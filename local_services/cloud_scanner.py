"""Private bounded ClamAV scanner. Unavailable or stale signatures never mean clean."""

import hashlib
import os
import re
import subprocess
import tempfile
import threading
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request

from caseproof.adapters.object_validation import validate_evidence

app = FastAPI(title="CaseProof evidence scanner")
_refresh_lock = threading.Lock()
_last_refresh = None


def verify_engine():
    try:
        result = subprocess.run(
            ["clamscan", "--version"], capture_output=True, text=True, timeout=10, check=False
        )
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("SCANNER_ENGINE_UNAVAILABLE") from None
    version = re.match(r"ClamAV (\d+\.\d+\.\d+)(?:/|\s|$)", result.stdout or "")
    if result.returncode or not version or version[1] != "1.4.6":
        raise RuntimeError("SCANNER_ENGINE_VERSION_UNAPPROVED")
    return version[1]


def signatures():
    directory = Path(os.environ.get("CLAMAV_DATABASE", "/var/lib/clamav"))
    daily = None
    for name in ("main", "daily"):
        candidates = [
            p for suffix in (".cvd", ".cld") if (p := directory / (name + suffix)).is_file()
        ]
        if len(candidates) != 1:
            raise RuntimeError("SCANNER_SIGNATURES_UNAVAILABLE")
        with candidates[0].open("rb") as source:
            header = source.read(512).rstrip(b" \x00\r\n")
        try:
            if not header.startswith(b"ClamAV-VDB:"):
                raise ValueError("invalid header")
            published = int(header.split(b":")[-1])
        except (ValueError, IndexError):
            raise RuntimeError("SCANNER_SIGNATURES_INVALID") from None
        if name == "daily":
            daily = published
    if daily is None or not time.time() - 72 * 3600 <= daily <= time.time() + 300:
        raise RuntimeError("SCANNER_SIGNATURES_STALE")
    return daily


def current_signatures():
    """Recover long-lived instances without relying on idle background CPU."""
    global _last_refresh
    try:
        return signatures()
    except RuntimeError:
        pass
    if not _refresh_lock.acquire(blocking=False):
        raise RuntimeError("SCANNER_REFRESH_IN_PROGRESS")
    try:
        if _last_refresh is not None and time.monotonic() - _last_refresh < 300:
            raise RuntimeError("SCANNER_REFRESH_COOLDOWN")
        _last_refresh = time.monotonic()
        try:
            result = subprocess.run(
                ["freshclam", "--config-file=/app/freshclam.conf", "--stdout"],
                capture_output=True,
                timeout=60,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            raise RuntimeError("SCANNER_REFRESH_UNAVAILABLE") from None
        if result.returncode:
            raise RuntimeError("SCANNER_REFRESH_UNAVAILABLE")
        signatures()
    finally:
        _refresh_lock.release()
    # A refreshed request is retried rather than adding a 120s scan to a 60s
    # refresh and exceeding the authenticated service/Tasks deadline.
    raise RuntimeError("SCANNER_SIGNATURES_REFRESHED_RETRY")


def scan_bytes(data, mime):
    validate_evidence(data, mime)
    version = verify_engine()
    updated = current_signatures()
    with tempfile.TemporaryDirectory(prefix="caseproof-scan-") as folder:
        path = Path(folder) / "evidence"
        path.write_bytes(data)
        result = subprocess.run(
            [
                "clamscan",
                "--database=" + os.environ.get("CLAMAV_DATABASE", "/var/lib/clamav"),
                "--no-summary",
                "--scan-archive=no",
                "--max-filesize=6M",
                "--max-scansize=6M",
                str(path),
            ],
            capture_output=True,
            timeout=120,
            check=False,
        )
    if result.returncode not in {0, 1}:
        raise RuntimeError("SCANNER_UNAVAILABLE")
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "status": "clean" if result.returncode == 0 else "infected",
        "engine": "clamav",
        "engine_version": version,
        "signatures_at": updated,
    }


@app.get("/health")
def health():
    try:
        return {"ok": True, "engine_version": verify_engine(), "signatures_at": signatures()}
    except RuntimeError:
        raise HTTPException(503, "SCANNER_UNAVAILABLE") from None


@app.post("/scan")
async def scan(request: Request):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 5 * 1024 * 1024:
            raise HTTPException(413, "file_limit")
    import asyncio

    try:
        return await asyncio.to_thread(
            scan_bytes, bytes(data), request.headers.get("content-type", "")
        )
    except ValueError:
        raise HTTPException(422, "invalid_evidence") from None
    except (RuntimeError, subprocess.TimeoutExpired):
        raise HTTPException(503, "SCANNER_UNAVAILABLE") from None
