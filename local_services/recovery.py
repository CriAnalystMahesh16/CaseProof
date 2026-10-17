"""Fault injection against this Compose project only; run as a disposable validation job."""

import hashlib
import json
import os
import time
from pathlib import Path

import httpx


def main():
    project = os.environ.get("DOCKER_PROJECT", "caseproof-local")
    docker = httpx.Client(
        transport=httpx.HTTPTransport(uds="/var/run/docker.sock"),
        base_url="http://docker",
        timeout=60,
    )
    api_client = httpx.Client(
        base_url=os.environ.get("API_BASE_URL", "http://api:8000"), timeout=30, trust_env=False
    )

    def container(service):
        filters = {
            "label": [
                "com.docker.compose.project=" + project,
                "com.docker.compose.service=" + service,
            ]
        }
        response = docker.get(
            "/containers/json", params={"all": True, "filters": json.dumps(filters)}
        )
        response.raise_for_status()
        rows = response.json()
        assert len(rows) == 1, (service, "expected exactly one owned service container")
        assert rows[0]["Labels"]["com.docker.compose.project"] == project
        return rows[0]["Id"]

    def control(service, action, **params):
        result = docker.post(f"/containers/{container(service)}/{action}", params=params)
        if action == "start" and result.status_code == 409:
            state = docker.get(f"/containers/{container(service)}/json").json()["State"]
            if state.get("Restarting"):
                return
        assert result.status_code in (204, 304), (service, action, result.status_code)

    def ready(service):
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            response = docker.get(f"/containers/{container(service)}/json")
            state = response.json()["State"]
            if state["Running"] and state.get("Health", {}).get("Status") == "healthy":
                return
            time.sleep(0.4)
        raise AssertionError(service + " did not recover")

    def api(path, body=None, role="analyst"):
        response = api_client.request(
            "GET" if body is None else "POST", path, json=body, headers={"X-Demo-User": role}
        )
        response.raise_for_status()
        return response.json()

    def wait_job(id, statuses):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            job = api("/v1/jobs/" + id)
            if job["status"] in statuses:
                return job
            assert job["status"] not in {"done", "failed", "stale"}, job
            time.sleep(0.1)
        raise AssertionError("job recovery timeout")

    result = {}
    control("ocr", "stop", t=5)
    try:
        created = api("/v1/local/fixtures/GOLD-001", {})
        job = wait_job(created["job_id"], {"failed"})
        snapshot = api("/v1/cases/" + created["case_id"])
        assert job["error"] == "LOCAL_OCR_ERROR" and not snapshot["claims"]
        result["ocr_outage"] = {"safe_error": job["error"], "no_fallback": True}
        print("OCR outage rejected safely without fabricated facts", flush=True)
    finally:
        control("ocr", "start")
    ready("ocr")
    api("/v1/jobs/" + created["job_id"] + "/retry", {})
    wait_job(created["job_id"], {"done"})
    result["ocr_retry"] = True
    print("OCR retry completed", flush=True)
    created = api("/v1/local/fixtures/GOLD-001", {})
    running = wait_job(created["job_id"], {"running"})
    control("worker", "kill", signal="SIGKILL")
    # Docker's restart policy may already have started it; start is idempotent.
    control("worker", "start")
    ready("worker")
    completed = wait_job(created["job_id"], {"done", "stale"})
    snapshot = api("/v1/cases/" + created["case_id"])
    assert snapshot["claims"] and snapshot["revision"] > running["revision"]
    assert completed["lease_token"] != running["lease_token"]
    result["worker_recovery"] = {"status": completed["status"], "lease_owner_changed": True}
    print("Killed worker lease reclaimed", flush=True)
    browser = json.loads(Path("/browser/docker_browser_validation.json").read_text())
    cid = browser["case_id"]
    before = api("/v1/cases/" + cid)
    deliveries = api(f"/v1/cases/{cid}/exports", {}, "reviewer")
    artifact = before["artifacts"][0]
    content_path = f"/v1/cases/{cid}/artifacts/{artifact['artifact_id']}/content"
    assert hashlib.sha256(api_client.get(content_path).content).hexdigest() == artifact["sha256"]
    for service in ("api", "worker", "ocr", "trail-feed", "simulator", "gateway"):
        control(service, "restart", t=5)
    for service in ("api", "worker", "ocr", "trail-feed", "simulator", "gateway"):
        ready(service)
    assert api("/v1/cases/" + cid) == before
    assert api(f"/v1/cases/{cid}/exports", {}, "reviewer") == deliveries
    assert hashlib.sha256(api_client.get(content_path).content).hexdigest() == artifact["sha256"]
    result["persistence"] = {
        "case_id": cid,
        "revision": before["revision"],
        "digest_unchanged": True,
        "evidence_hash_unchanged": True,
        "approval_and_outbound_ids_unchanged": True,
    }
    result["passed"] = True
    Path("/data/local_recovery_validation.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
