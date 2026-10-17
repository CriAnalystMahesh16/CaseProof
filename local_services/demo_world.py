"""Persistent independent synthetic world used by the victim-led demonstration."""

import json
import re
import time
from types import SimpleNamespace

from filelock import FileLock

from local_services.bank_network import BankNetwork

BANKS = [
    "Cedar Demo Bank",
    "Lotus Demo Bank",
    "Tulip Demo Bank",
    "Maple Demo Bank",
    "Willow Demo Bank",
    "Birch Demo Bank",
    "Pine Demo Bank",
    "Elm Demo Bank",
    "Aspen Demo Bank",
    "Oak Demo Bank",
]
NAMES = [
    "Ram",
    "Samer",
    "Asha",
    "Meera",
    "Kabir",
    "Priya",
    "Dev",
    "Sara",
    "Arjun",
    "Leela",
    "Rohan",
    "Zoya",
]
ADMIN = SimpleNamespace(role="admin", tenant_id="demo")


class DemoWorld:
    def __init__(self, o, session_id=None):
        self.o = o
        self.namespace = "PRELOADED" if session_id is None else "SESSION-" + session_id
        self.archive = o.s.data_dir / "demo_worlds"
        self.path = (
            o.s.data_dir / "preloaded_world_v1.json"
            if session_id is None
            else self.archive / (session_id + ".json")
        )

    def ensure(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with FileLock(str(self.path) + ".lock"):
            if self.path.exists():
                return json.loads(self.path.read_text())
            network = BankNetwork(self.o)
            people, ids = [], []
            for index in range(6):
                nid = f"CEDAR-{self.namespace}-{index + 1}"
                # Generate once, remap downstream institutions, then import through the
                # existing immutable bank contract. No complaint is created here.
                try:
                    saved = network.read(nid, ADMIN)
                except KeyError:
                    seed = 35 + index
                    if self.namespace.startswith("SESSION-judge-"):
                        from caseproof.domain.contracts import hash_json

                        seed = 100 + int(hash_json([nid, index])[:6], 16) % 9000
                    saved = network._generate(nid, seed, "demo")
                    raw = json.dumps(saved)
                    raw = raw.replace("Lotus Demo Bank", BANKS[1 + index * 2 % 9])
                    raw = raw.replace("Tulip Demo Bank", BANKS[1 + (index * 2 + 1) % 9])
                    saved = json.loads(raw)
                for j, customer in enumerate(saved["dataset"]["customers"]):
                    customer["display_name"] = NAMES[index * 2 + j] + " (synthetic)"
                saved["manifest"]["customers"] = saved["dataset"]["customers"]
                from caseproof.api.bank_contracts import BankBatch
                from caseproof.domain.contracts import hash_json

                network.ingestion.ingest(BankBatch.model_validate(saved["dataset"]), ADMIN)
                with network.ingestion.bank.connect() as db:
                    db.execute(
                        "INSERT OR IGNORE INTO bank_networks VALUES(?,?,?)",
                        [hash_json(["demo", nid]), "demo", json.dumps(saved)],
                    )
                for customer in saved["dataset"]["customers"]:
                    people.append({**customer, "network_id": nid, "bank": BANKS[0]})
                ids.append(nid)
            world = {
                "version": 1,
                "synthetic": True,
                "banks": BANKS,
                "customers": people,
                "networks": ids,
                "created_at": time.time(),
            }
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps(world))
            temporary.replace(self.path)
            return world

    def worlds(self):
        active = self.ensure()
        return [active] + [json.loads(p.read_text()) for p in self.archive.glob("*.json")]

    def customer(self, account):
        for world in self.worlds():
            for person in world["customers"]:
                if person["account"] == account:
                    return person
        raise PermissionError("unknown synthetic customer")

    def start(self, session_id, actor):
        if actor.role != "admin" or not self.o.s.demo_mode or not self.o.s.preloaded_demo:
            raise PermissionError("demo operator required")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,24}", session_id):
            raise ValueError("invalid demo session identity")
        previous = self.ensure()
        candidate = DemoWorld(self.o, session_id).ensure()
        from caseproof.domain.contracts import hash_json

        with FileLock(str(self.path) + ".lock"):
            self.archive.mkdir(parents=True, exist_ok=True)
            archive = self.archive / ("ARCHIVE-" + hash_json(previous["networks"])[:16] + ".json")
            if not archive.exists():
                archive.write_text(json.dumps(previous))
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps(candidate))
            temporary.replace(self.path)
        return {
            "synthetic": True,
            "session_id": session_id,
            "customers": candidate["customers"],
            "created_at": candidate["created_at"],
        }

    def tick(self):
        """Scheduled independent observations; failed calls never advance the cursor."""
        # Refresh only worlds with actual complaints. Bound each scheduler turn so
        # accumulated practice sessions cannot monopolise the processing worker.
        from datetime import datetime

        from sqlalchemy import text

        with self.o.store.engine.connect() as db:
            demands = dict(
                db.execute(
                    text(
                        "SELECT json_extract(metadata,'$.customer_account'),"
                        "max(json_extract(metadata,'$.reported_at')) FROM cases "
                        "WHERE tenant_id='demo' GROUP BY 1"
                    )
                ).all()
            )
        networks = {}
        for world in self.worlds():
            for person in world["customers"]:
                reported = demands.get(person["account"])
                if reported:
                    stamp = datetime.fromisoformat(reported).timestamp()
                    nid = person["network_id"]
                    networks[nid] = max(networks.get(nid, 0), stamp)
        cursor = self.path.with_name("world_observations.json")
        previous = json.loads(cursor.read_text()) if cursor.exists() else {}
        states = previous.setdefault("networks", {})
        network = BankNetwork(self.o)
        due = []
        for nid, reported in networks.items():
            state = states.get(nid, {})
            attempted = state.get("attempt_at", 0)
            observed = state.get("observed_at", 0)
            # A new complaint needs coverage through its filing instant, even
            # when a pre-complaint observation is still fresh. Failed refreshes
            # back off instead of retrying on every worker iteration.
            needs_coverage = observed < reported
            interval = 10 if state.get("status") == "unavailable" else 120
            if (
                needs_coverage
                and state.get("status") != "unavailable"
                or time.time() - attempted >= interval
            ):
                due.append((needs_coverage, reported if needs_coverage else -attempted, nid))
        for _, _, nid in sorted(due, reverse=True)[:2]:
            try:
                observed_at = time.time()
                network.publish_reports(nid, ADMIN, refresh=True)
                states[nid] = {
                    "status": "observed",
                    "attempt_at": time.time(),
                    "observed_at": observed_at,
                }
            except Exception as error:
                states[nid] = {
                    "status": "unavailable",
                    "error": type(error).__name__,
                    "attempt_at": time.time(),
                }
            temporary = cursor.with_suffix(".tmp")
            temporary.write_text(json.dumps(previous))
            temporary.replace(cursor)
