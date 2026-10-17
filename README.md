# CaseProof

Evidence-grounded assistance for a bank's payment-scam response analyst.

CaseProof turns a new customer complaint into a cited investigation brief, checks
it against bank records, identifies missing information, and prepares a reviewed
handoff. Deterministic code controls money calculations, readiness, approval and
delivery. The analyst remains accountable for the decision.

## Run the complete local application

Requires Docker Desktop in Linux-container mode. No cloud credentials are needed.

```sh
docker compose up --build -d --wait
```

Open **http://127.0.0.1:8080/app/#/entry**. One application container serves the
built React frontend and FastAPI API. Real Tesseract OCR, a durable worker and
synthetic bank/feed/report services run internally on loopback. Persistent data
uses the `caseproof_application-data` volume. Initial startup preloads fictional
bank records; it creates **no complaints**. Never use real customer information.

Stop with `docker compose stop`; resume with `docker compose up -d`. Do not use
`down -v` unless deliberately discarding all local investigation data.

## Evaluate a new complaint

Follow the [step-by-step demo](docs/DEMO.md): select a synthetic customer, dispute
a payment, write a narrative, upload a real image, and submit. Review the new case,
request missing information, answer through its scoped link, review citations,
approve as a reviewer, and send to both local report receivers. Delivery creates a
follow-up state; it does not close the investigation or freeze funds.

## Architecture and boundaries

| Component | Local implementation | Prepared Google implementation |
| --- | --- | --- |
| Analyst and victim workflows | React, same-origin FastAPI | Cloud Run behind HTTPS edge |
| Evidence interpretation | Tesseract plus explicit local extraction rules | Document AI plus Gemini on Vertex AI |
| Evidence storage | Private filesystem | Cloud Storage quarantine/clean buckets |
| Case history, approvals, work | SQLite with revision/digest/lease checks | Firestore Native and Cloud Tasks |
| Bank records and trace | Synthetic records in DuckDB; independent feed | Bounded BigQuery analytics |
| Report destinations | Idempotent synthetic receivers | Separately authenticated hosted simulators |

The local extractor is **not a live generative model**. Synthetic records are
inputs, not pre-recorded case decisions. The Google adapters and infrastructure
are prepared and tested with service doubles; application deployment and live
Google end-to-end acceptance remain on hold. The single-container local package
is a demonstration convenience, not a bank production deployment topology.

## Repository

- `frontend/` — React source, dependency lock and UI tests.
- `caseproof/` — domain rules, workflow API and local/cloud adapters.
- `local_services/`, `mock_services/` — OCR, worker and synthetic services.
- `policy/` — versioned fictional decision policy.
- `tests/`, `eval/` — regression tests and repeatable quality/load evaluations.
- `infra/google/` — Google configuration and deployment gates.
- `docs/` — demo, architecture, validation and security guidance.

The older `/inspector` diagnostic interface remains available for local technical
inspection; it is not the primary product interface.

See [architecture](docs/ARCHITECTURE.md), [API contract](docs/API_WORKFLOW_CONTRACT.md),
[testing](docs/TESTING.md), [security](docs/SECURITY.md),
[cloud readiness](docs/CLOUD_READINESS.md), and the [prioritized backlog](BACKLOG.md).

Licensed under [MIT](LICENSE).
