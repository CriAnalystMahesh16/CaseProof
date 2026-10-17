"""Persist synthetic bank worlds in Firestore; publish records through bank ingestion."""

from caseproof.adapters.firestore_casestore import identity
from caseproof.adapters.sqlite_casestore import ConflictError
from caseproof.api.bank_contracts import BankBatch
from local_services.bank_network import BankNetwork
from local_services.demo_world import BANKS, NAMES, incident


class CloudBankNetwork(BankNetwork):
    def __init__(self, o):
        self.o = o

    def read(self, network_id, actor):
        row = self.o.store.documents.get(
            "synthetic_networks/" + identity(actor.tenant_id, network_id)
        )
        if not row:
            raise KeyError("bank network missing")
        return row["data"]

    def create(self, network_id, seed, actor, minutes_ago=30, position=None):
        if actor.role != "admin" or not self.o.s.demo_mode:
            raise PermissionError("synthetic network administrator required")
        path = "synthetic_networks/" + identity(actor.tenant_id, network_id)
        generated = self._generate(network_id, seed, actor.tenant_id, minutes_ago)
        # Position in the tenant picks distinct names/banks; random seeds may collide.
        index = seed % 6 if position is None else position % 6
        import json

        raw = json.dumps(generated).replace("Lotus Demo Bank", BANKS[1 + index * 2 % 9])
        raw = raw.replace("Tulip Demo Bank", BANKS[1 + (index * 2 + 1) % 9])
        generated = json.loads(raw)
        for position, customer in enumerate(generated["dataset"]["customers"]):
            customer["display_name"] = NAMES[index * 2 + position] + " (synthetic)"
            for account in generated["dataset"]["accounts"]:
                if account["id"] == customer["account"]:
                    account["label"] = customer["display_name"].removesuffix(" (synthetic)")
        # The catalogue reads the manifest; it must carry the same distinct names.
        generated["manifest"]["customers"] = generated["dataset"]["customers"]

        def create(tx):
            row = tx.get(path)
            if row and row["data"]["seed"] != seed:
                raise ConflictError("network_id_seed_conflict")
            if row:
                return row["data"]
            tx.set(
                path,
                {"tenant": actor.tenant_id, "network_id": network_id, "data": generated},
                create=True,
            )
            return generated

        saved = self.o.store.documents.transact(create)
        result = self.o.bank_ingestion.ingest(BankBatch.model_validate(saved["dataset"]), actor)
        return {**saved["manifest"], "publication_id": result["publication_id"]}

    def seed_tenant(self, actor, minutes_ago=30, seeds=None):
        """seeds: one per network; practice sessions pass fresh random seeds so every
        visitor gets different amounts and money-movement shapes."""
        seeds = seeds or [36 + index for index in range(6)]
        manifests = [
            self.create(f"PRELOADED-{index}", seed, actor, minutes_ago, index)
            for index, seed in enumerate(seeds)
        ]
        return {
            "version": 5,
            "banks": BANKS,
            "customers": [
                {
                    **customer,
                    "network_id": m["network_id"],
                    "bank": m["bank"],
                    "publication_id": m["publication_id"],
                    **incident(m, customer),
                }
                for m in manifests
                for customer in m["customers"]
            ],
            "synthetic": True,
        }

    def publish_reports(self, network_id, actor, *, refresh=False):
        import copy
        from datetime import datetime, timezone

        if actor.role != "admin":
            raise PermissionError("synthetic bank administrator required")
        saved = self.read(network_id, actor)
        reports = list(saved["reports"])
        if refresh:
            observed = datetime.now(timezone.utc).isoformat()
            suffix = "-REFRESH-" + identity(observed)[:20]
            batch = copy.deepcopy(saved["dataset"])
            batch["batch_id"] += suffix
            batch["transactions"] = []
            for cover in batch["coverage"]:
                cover.update(as_of=observed, end=observed)
            self.o.bank_ingestion.ingest(BankBatch.model_validate(batch), actor)
            reports += [
                dict(
                    update_id=r["update_id"] + suffix,
                    account=r["account"],
                    reporting_bank=r["reporting_bank"],
                    reported_at=observed,
                    balance_minor=r["balance_minor"],
                    credit_received=[],
                    onward_transfers=[],
                )
                for r in reports
            ]
        return {
            "publications": [self.o.bank_ingestion.downstream(r, actor) for r in reports],
            "synthetic": True,
        }
