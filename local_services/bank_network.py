"""Fictional bank/customer simulator. Generates records, not extraction answers."""

import json
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

import httpx
from filelock import FileLock
from PIL import Image, ImageDraw, ImageFont

from caseproof.adapters.bank_ingestion import BankIngestion
from caseproof.adapters.local_trail_feed import validate_updates
from caseproof.adapters.sqlite_casestore import ConflictError
from caseproof.api.bank_contracts import BankBatch
from caseproof.domain.contracts import hash_json


class BankNetwork:
    def __init__(self, orchestrator):
        self.o = orchestrator
        self.ingestion = BankIngestion(orchestrator)
        with self.ingestion.bank.connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS bank_networks("
                "id VARCHAR PRIMARY KEY,tenant VARCHAR,data VARCHAR)"
            )

    def read(self, network_id, actor):
        key = hash_json([actor.tenant_id, network_id])
        with self.ingestion.bank.connect() as db:
            row = db.execute(
                "SELECT data FROM bank_networks WHERE id=? AND tenant=?", [key, actor.tenant_id]
            ).fetchone()
        if not row:
            raise KeyError("bank network missing")
        return json.loads(row[0])

    def create(self, network_id, seed, actor):
        if actor.role != "admin" or not self.o.s.demo_mode:
            raise PermissionError("synthetic network administrator required")
        # Serialize a network's initial time and identity; retries must reproduce the same data.
        key = hash_json([actor.tenant_id, network_id])
        folder = self.o.s.data_dir / "network_locks"
        folder.mkdir(parents=True, exist_ok=True)
        with FileLock(str(folder / (key + ".lock"))):
            try:
                saved = self.read(network_id, actor)
                if saved["seed"] != seed:
                    raise ConflictError("network_id_seed_conflict")
            except KeyError:
                saved = self._generate(network_id, seed, actor.tenant_id)
                with self.ingestion.bank.connect() as db:
                    db.execute(
                        "INSERT INTO bank_networks VALUES(?,?,?)",
                        [key, actor.tenant_id, json.dumps(saved)],
                    )
            self.ingestion.ingest(BankBatch.model_validate(saved["dataset"]), actor)
            return saved["manifest"]

    def _generate(self, network_id, seed, tenant):
        prefix = "SIM-" + hash_json([tenant, network_id, seed])[:10].upper()
        now = datetime.now(timezone(timedelta(hours=5, minutes=30))).replace(
            second=0, microsecond=0
        )

        def stamp(minutes):
            return (now - timedelta(minutes=minutes)).isoformat()

        customer, other, mule, second, layer, atm, shop = [
            prefix + "-" + suffix for suffix in ("C1", "C2", "M1", "M2", "L2", "ATM", "SHOP")
        ]
        first_amount, extra_amount = (50000 + seed % 7 * 1000) * 100, (10000 + seed % 5 * 500) * 100
        accounts = [
            dict(id=id, bank=bank, label=id, kind=kind, opening_balance=opening)
            for id, bank, kind, opening in (
                (customer, "Cedar Demo Bank", "customer", 100000000),
                (other, "Cedar Demo Bank", "customer", 50000000),
                (mule, "Lotus Demo Bank", "beneficiary", 0),
                (second, "Tulip Demo Bank", "beneficiary", 0),
                (layer, "Tulip Demo Bank", "layer", 0),
                (atm, "Lotus Demo Bank", "cashout", 0),
                (shop, "Cedar Demo Bank", "merchant", 0),
            )
        ]

        def transaction(suffix, account, receiver, amount, payee, minutes):
            return dict(
                txn_id=prefix + "-" + suffix,
                account=account,
                counterparty_account=receiver,
                amount_minor=amount,
                payee=payee,
                ts=stamp(minutes),
                reference="SYNTH-TX-" + prefix + "-" + suffix,
                direction="debit",
                channel="UPI",
            )

        transactions = [
            transaction("HISTORY", customer, shop, 120000, "grocer@fictional.invalid", 4320),
            transaction("GROCERY", customer, shop, 120000, "grocer@fictional.invalid", 25),
            transaction(
                "T1",
                customer,
                mule,
                first_amount,
                "safe-" + prefix.lower() + "@fictional.invalid",
                30,
            ),
            transaction(
                "T2",
                customer,
                second,
                extra_amount,
                "refund-" + prefix.lower() + "@fictional.invalid",
                20,
            ),
            transaction("OTHER", other, shop, 80000, "grocer@fictional.invalid", 50),
        ]
        dataset = dict(
            batch_id=prefix + "-B0",
            synthetic=True,
            bank="Cedar Demo Bank",
            customers=[
                dict(account=customer, display_name="Maya Synthetic"),
                dict(account=other, display_name="Ravi Synthetic"),
            ],
            accounts=accounts,
            transactions=transactions,
            coverage=[
                dict(account=a, start=stamp(10080), end=stamp(0), as_of=stamp(0))
                for a in (customer, other)
            ],
        )
        BankBatch.model_validate(dataset)

        def edge(tx):
            return {
                "txn_id": tx["txn_id"],
                "ts": tx["ts"],
                "from_account": tx["account"],
                "to_account": tx["counterparty_account"],
                "amount_minor": tx["amount_minor"],
                "channel": tx["channel"],
                "reference": tx["reference"],
                "source": "ledger",
            }

        t1, t2 = transactions[2:4]
        onward = (
            first_amount
            * (1 if seed >= 100 and seed % 2 else 3)
            // (4 if seed >= 100 and seed % 2 else 5)
        )
        cashout = first_amount // (5 if seed >= 100 and seed % 3 == 0 else 10)
        u1 = prefix + "-U1"
        hop = dict(
            txn_id=prefix + "-HOP",
            ts=stamp(15),
            from_account=mule,
            to_account=layer,
            amount_minor=onward,
            channel="IMPS",
            reference=prefix + "-HOPREF",
            source="cfcfrms_update:" + u1,
        )
        withdrawal = dict(
            txn_id=prefix + "-CASH",
            ts=stamp(12),
            from_account=mule,
            to_account=atm,
            amount_minor=cashout,
            channel="ATM",
            reference=prefix + "-ATMREF",
            source="cfcfrms_update:" + u1,
        )
        reports = [
            dict(
                update_id=u1,
                account=mule,
                reporting_bank="Lotus Demo Bank",
                reported_at=stamp(5),
                credit_received=[edge(t1)],
                onward_transfers=[hop, withdrawal],
                balance_minor=first_amount - onward - cashout,
            ),
            dict(
                update_id=prefix + "-U2",
                account=layer,
                reporting_bank="Tulip Demo Bank",
                reported_at=stamp(4),
                credit_received=[hop],
                onward_transfers=[],
                balance_minor=onward,
            ),
            dict(
                update_id=prefix + "-U3",
                account=second,
                reporting_bank="Tulip Demo Bank",
                reported_at=stamp(3),
                credit_received=[edge(t2)],
                onward_transfers=[],
                balance_minor=extra_amount,
            ),
        ]
        if seed >= 1000 and seed % 2 == 0:
            distant = prefix + "-L3"
            accounts.append(
                dict(
                    id=distant,
                    bank="Willow Demo Bank",
                    label=distant,
                    kind="layer",
                    opening_balance=0,
                )
            )
            branch = dict(
                txn_id=prefix + "-DEEP",
                ts=stamp(8),
                from_account=layer,
                to_account=distant,
                amount_minor=onward // 2,
                channel="IMPS",
                reference=prefix + "-DEEPREF",
                source="cfcfrms_update:" + prefix + "-U2",
            )
            reports[1]["onward_transfers"] = [branch]
            reports[1]["balance_minor"] -= branch["amount_minor"]
            reports.append(
                dict(
                    update_id=prefix + "-U4",
                    account=distant,
                    reporting_bank="Willow Demo Bank",
                    reported_at=stamp(2),
                    credit_received=[branch],
                    onward_transfers=[],
                    balance_minor=branch["amount_minor"],
                )
            )
        validate_updates(reports, stamp(0))

        def statement(tx):
            date = datetime.fromisoformat(tx["ts"])
            return (
                f"I confirm I paid INR {tx['amount_minor'] / 100:.2f} "
                f"on {date:%Y-%m-%d} at {date:%H:%M} to {tx['payee']}. "
                "The caller asked for a safe account refund transfer."
            )

        manifest = dict(
            network_id=network_id,
            seed=seed,
            synthetic=True,
            bank="Cedar Demo Bank",
            customers=dataset["customers"],
            customer_account=customer,
            first_contact=stamp(45),
            reported_at=stamp(0),
            initial_statement=statement(t1),
            followup_statement=statement(t2),
            receipt_url=f"/v1/local/bank-network/{network_id}/receipt",
            dataset_url=f"/v1/local/bank-network/{network_id}/dataset",
            policy="Synthetic demo policy; not a regulatory or bank-compliance certification",
        )
        return dict(seed=seed, dataset=dataset, reports=reports, manifest=manifest)

    def receipt(self, network_id, actor):
        tx = self.read(network_id, actor)["dataset"]["transactions"][2]
        date = datetime.fromisoformat(tx["ts"])
        lines = [
            "CEDAR DEMO BANK - SYNTHETIC",
            "Payment successful",
            f"INR {tx['amount_minor'] / 100:,.2f}",
            f"Date: {date:%Y-%m-%d}",
            f"Time: {date:%H:%M} IST",
            f"To: {tx['payee']}",
            "Reference crop not included",
            "FICTIONAL EVIDENCE FOR LOCAL TESTING",
        ]
        fonts = [
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"),
        ]
        face = next((p for p in fonts if p.exists()), None)
        font = ImageFont.truetype(str(face), 26) if face else ImageFont.load_default(size=26)
        image = Image.new("RGB", (1250, 750), "white")
        draw = ImageDraw.Draw(image)
        for i, line in enumerate(lines):
            draw.text((35, 35 + i * 80), line, font=font, fill="#172f40")
        output = BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()

    def publish_reports(self, network_id, actor, *, refresh=False):
        if actor.role != "admin" or not self.o.s.demo_mode:
            raise PermissionError("synthetic network administrator required")
        saved = self.read(network_id, actor)
        reports = saved["reports"]
        bank_jobs = []
        if refresh:
            # This simulator's independent world has no new movements. Re-observe it;
            # never change an old report's time or pretend a victim supplied bank facts.
            observed = datetime.now(timezone.utc).isoformat()
            suffix = "-REFRESH-" + hash_json([network_id, observed])[:12]
            dataset = json.loads(json.dumps(saved["dataset"]))
            dataset["batch_id"] += suffix
            dataset["transactions"] = []
            for row in dataset["coverage"]:
                row["as_of"] = observed
                row["end"] = observed
            bank_jobs = self.ingestion.ingest(BankBatch.model_validate(dataset), actor)[
                "reprocess_jobs"
            ]
            refreshed = [
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
            reports = reports + refreshed
        if self.o.s.trail_feed_url:
            for report in reports:
                result = httpx.post(
                    self.o.s.trail_feed_url + "/v1/updates",
                    json=report,
                    timeout=15,
                    trust_env=False,
                )
                result.raise_for_status()
        else:
            path = self.o.s.trail_feed_path
            path.parent.mkdir(parents=True, exist_ok=True)
            with FileLock(str(path) + ".lock"):
                existing = json.loads(path.read_text()) if path.exists() else []
                by_id = {r["update_id"]: r for r in existing}
                for report in reports:
                    if report["update_id"] in by_id and by_id[report["update_id"]] != report:
                        raise ConflictError("immutable_report_conflict")
                    by_id[report["update_id"]] = report
                temporary = path.with_suffix(".tmp")
                temporary.write_text(json.dumps(list(by_id.values())))
                temporary.replace(path)
        # Reuse the durable bank wakeup path rather than wait for a large feed poll scan.
        manifest = self.read(network_id, actor)["manifest"]
        jobs = []
        for cid in self.o.store.cases_for_accounts(actor.tenant_id, {manifest["customer_account"]}):
            snap = self.o.store.get(cid)
            if not all(
                r["update_id"]
                in {x["update_id"] for x in snap.trail.get("account_observations", [])}
                for r in reports
            ):
                old = snap.revision
                snap.revision += 1
                snap.readiness.disposition = "REVIEW_REQUIRED"
                self.o.store.publish(snap, old, "bank_feed_received")
                jobs.append(self.o.jobs.enqueue(cid, snap.revision))
        return {
            "synthetic": True,
            "update_ids": [r["update_id"] for r in reports],
            "reprocess_jobs": bank_jobs + jobs,
        }
