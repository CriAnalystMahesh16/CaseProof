"""Supervise the complete local prototype in one container, without a gateway."""

import os
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request


def wait_ready(url, children, stopped, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline and not stopped.is_set():
        if any(child.poll() is not None for child in children):
            raise RuntimeError("Application child exited during startup")
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError):
            pass
        stopped.wait(1)
    raise RuntimeError("Application readiness deadline exceeded")


def main():
    if "--health" in sys.argv:
        with urllib.request.urlopen("http://127.0.0.1:8080/ready", timeout=12) as response:
            raise SystemExit(0 if response.status == 200 else 1)
    if os.environ.get("RUNTIME_BACKEND", "local") != "local":
        raise RuntimeError("Consolidated application is local-only; use cloud service images")
    stopped = threading.Event()
    children = []
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stopped.set())

    def launch(*args):
        process = subprocess.Popen([sys.executable, *args], start_new_session=True)
        children.append(process)
        return process

    def serve(module, port, host="127.0.0.1", factory=False):
        args = ["-m", "uvicorn", module, "--host", host, "--port", str(port), "--no-access-log"]
        if factory:
            args.append("--factory")
        launch(*args)

    try:
        serve("local_services.ocr:app", 8770)
        serve("local_services.feed:app", 8771)
        serve("mock_services.bank_mock:app", 8765)
        for port in (8770, 8771, 8765):
            wait_ready(f"http://127.0.0.1:{port}/health", children, stopped)
        # Idempotently preload records only. Never create a complaint or GOLD case.
        initializer = launch("-m", "local_services.application", "--initialize")
        initialization_deadline = time.monotonic() + 300
        while initializer.poll() is None and not stopped.wait(1):
            if time.monotonic() >= initialization_deadline:
                raise RuntimeError("Synthetic bank initialization deadline exceeded")
            if any(child.poll() is not None for child in children if child is not initializer):
                raise RuntimeError("Internal service failed during initialization")
        if stopped.is_set() or initializer.returncode != 0:
            raise RuntimeError("Synthetic bank initialization did not complete")
        children.remove(initializer)
        launch("-m", "local_services.worker")
        serve("caseproof.api.frontend:create_app", 8080, "0.0.0.0", factory=True)
        wait_ready("http://127.0.0.1:8080/ready", children, stopped)
        print("CaseProof ready: frontend, API, OCR, worker and synthetic services", flush=True)
        while not stopped.wait(1):
            if any(child.poll() is not None for child in children):
                raise RuntimeError("Essential application service exited")
    finally:
        for child in children:
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
        deadline = time.monotonic() + 20
        for child in children:
            try:
                child.wait(timeout=max(0.1, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()


if __name__ == "__main__":
    if "--initialize" in sys.argv:
        from caseproof.config import Settings
        from caseproof.pipeline.orchestrator import Orchestrator
        from local_services.demo_world import DemoWorld

        DemoWorld(Orchestrator(Settings(_env_file=None))).ensure()
    else:
        main()
