from fastapi.testclient import TestClient

from caseproof.api.app import create_app
from tests.flow.test_victim_flow import settings


def test_practice_sessions_have_independent_catalogues_and_queues(tmp_path):
    app = create_app(settings(tmp_path))
    with TestClient(app) as a, TestClient(app) as b:
        original = b.get("/v1/victim/demo-customers").json()
        app.state.orchestrator.store.create("LEGACY", customer_account="old")
        made = a.post("/v1/victim/demo-session")
        assert made.status_code == 200 and made.json()["complaints_created"] == 0
        mine = a.get("/v1/victim/demo-customers").json()
        assert mine["customers"][0]["account"] != original["customers"][0]["account"]
        assert b.get("/v1/victim/demo-customers").json() == original
        assert a.get("/v1/workspace?scope=active").json()["cases"] == []
        assert len(a.get("/v1/workspace?scope=all").json()["cases"]) == 1
        assert (
            a.post(
                "/v1/victim/sessions", json={"customer_id": original["customers"][0]["account"]}
            ).status_code
            == 422
        )
        assert (
            a.post("/v1/victim/demo-session", headers={"Origin": "http://evil.invalid"}).status_code
            == 403
        )
