# Validation

## Automated tests

```sh
# Canonical local OCR/backend regression environment
docker build -t caseproof-tests .
docker run --rm --network none -e DATA_DIR=/tmp/tests -e SQLITE_URL=sqlite:////tmp/tests/cases.db -e DUCKDB_PATH=/tmp/tests/bank.duckdb -e OBJECT_DIR=/tmp/tests/objects -e LLM_PROVIDER=gemini -e LLM_MODE=live -e CUSTOMER_PORTAL=false caseproof-tests python -m pytest -q --basetemp=/tmp/pytest -o cache_dir=/tmp/pytest-cache

# Frontend unit and component tests (Node 24)
cd frontend
npm ci
npm test
npm run build
```

With the complete application running, use `node frontend/scripts/acceptance-browser.mjs`
from the repository root after installing Playwright Chromium. It submits new
complaints with uploaded PNGs and exercises requests, replies, review, delivery,
follow-up and responsive/accessibility checks. Results are local under `var/`.
`CASEPROOF_BASE_URL` overrides the default `http://127.0.0.1:8080`.

## Recorded baseline before frontend consolidation

- Full packaged backend: 313 passed, zero failures/skips.
- Separate prepared cloud runtime: 25 complaint/security contracts passed.
- Terraform deployment-hold mocked plans: 2 passed.
- Final scanner native retry: clean text/PNG, EICAR detection and missing/stale
  signature rejection passed. Scans took 63–88s; an initial 120s competing-load
  timeout is retained as an unresolved performance gate.

Google service responses and identity signature verification are explicit doubles
in offline contracts. These tests do not measure live Document AI/Gemini quality,
real Google IAM, human time saved, or production bank integration.

Fresh integrated-package validation is recorded in `docs/INTEGRATION_RESULTS.md`.
Retain failed attempts and limitations alongside rerun results.
