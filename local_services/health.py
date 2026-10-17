"""Fast Docker worker liveness check; no application/database/model imports."""

import os
import time
from pathlib import Path


def worker_healthy(data_dir, as_of=None):
    try:
        age = (time.time() if as_of is None else as_of) - (
            Path(data_dir) / "worker.heartbeat"
        ).stat().st_mtime
    except OSError:
        return False
    return 0 <= age < 20


if __name__ == "__main__":
    raise SystemExit(0 if worker_healthy(os.environ.get("DATA_DIR", "/data")) else 1)
