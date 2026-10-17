"""Network-free acceptance of the actual scanner image and trusted engine."""

import base64
import json
import os
import tempfile
import time
from io import BytesIO
from pathlib import Path

from PIL import Image

from local_services.cloud_scanner import scan_bytes, signatures, verify_engine


def main():
    version = verify_engine()
    png = BytesIO()
    Image.new("RGB", (64, 32), "white").save(png, format="PNG")
    eicar = base64.b64decode(
        "WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo="
    )
    results = {}
    for name, data, mime, expected in (
        ("clean_text", b"Synthetic bank complaint evidence", "text/plain", "clean"),
        ("clean_png", png.getvalue(), "image/png", "clean"),
        ("standard_eicar", eicar, "text/plain", "infected"),
    ):
        started = time.perf_counter()
        result = scan_bytes(data, mime)
        assert result["status"] == expected, (name, result)
        results[name] = {**result, "elapsed_seconds": round(time.perf_counter() - started, 3)}
        print(json.dumps({"check": name, **results[name]}), flush=True)
    previous = os.environ.get("CLAMAV_DATABASE")
    try:
        with tempfile.TemporaryDirectory(prefix="caseproof-signature-check-") as folder:
            os.environ["CLAMAV_DATABASE"] = folder
            try:
                signatures()
            except RuntimeError:
                results["missing_signatures"] = "rejected"
            else:
                raise AssertionError("missing signature set accepted")
            for name, published in (
                ("main", time.time() - 365 * 86400),
                ("daily", time.time() - 73 * 3600),
            ):
                header = f"ClamAV-VDB:test:1:1:90:md5:sig:builder:{int(published)}"
                (Path(folder) / (name + ".cvd")).write_bytes(header.encode().ljust(512, b" "))
            try:
                signatures()
            except RuntimeError:
                results["stale_signatures"] = "rejected"
            else:
                raise AssertionError("expired signature set accepted")
    finally:
        if previous is None:
            os.environ.pop("CLAMAV_DATABASE", None)
        else:
            os.environ["CLAMAV_DATABASE"] = previous
    print(json.dumps({"ok": True, "engine_version": version, "checks": results}), flush=True)


if __name__ == "__main__":
    main()
