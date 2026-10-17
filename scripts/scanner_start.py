"""Refresh scanner signatures before accepting traffic; never deploy by running this."""

import os
import subprocess
import sys

# Keep updater output out of evidence/request logs; startup failure stays explicit.
try:
    result = subprocess.run(
        ["freshclam", "--config-file=/app/freshclam.conf", "--stdout"], timeout=60
    )
except subprocess.TimeoutExpired:
    result = None
from local_services.cloud_scanner import signatures, verify_engine

try:
    verify_engine()
    signatures()  # A failed refresh is acceptable only while the trusted existing set is fresh.
except RuntimeError:
    raise SystemExit("Scanner startup failed: fresh signatures unavailable") from None
os.execv(
    sys.executable,
    [
        sys.executable,
        "-m",
        "uvicorn",
        "local_services.cloud_scanner:app",
        "--host",
        "0.0.0.0",
        "--port",
        os.environ.get("PORT", "8080"),
        "--no-access-log",
    ],
)
