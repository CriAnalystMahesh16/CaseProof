# CaseProof

Evidence-grounded assistance for a bank's payment-scam response analyst.

CaseProof turns a new customer complaint into a cited investigation brief, checks
it against bank records, identifies missing information, and prepares a reviewed
handoff. Deterministic code controls money calculations, readiness, approval and
delivery. The analyst remains accountable for the decision.

## Try it

A synthetic staging deployment on Google Cloud (Mumbai) is live at
**https://8-233-217-230.sslip.io**: choose **Take the guided tour**. No sign-in is
needed; the analyst and reviewer roles are labelled demo personas confined to your
own practice session.

## Run the complete local application

Requires Docker Desktop in Linux-container mode. No cloud credentials are needed.

```sh
docker compose up --build -d --wait
```

Open **http://127.0.0.1:8080/app/#/entry**. Compose starts independent services
on one `caseproof` network; only the frontend publishes a port (host loopback):

| Service | Role | Data |
| --- | --- | --- |
| `frontend` | nginx serving the React build; proxies API paths to `api` | none |
| `api` | FastAPI workflow API, customer links, readiness | `application-data` |
| `worker` | Durable job processing, bank observations, outbound delivery | `application-data` |
| `ocr` | Real Tesseract OCR over HTTP | none |
| `trail-feed` | Independent synthetic downstream-bank feed | `feed-data` |
| `simulator` | Two idempotent synthetic report receivers | `simulator-data` |
| `preload` | One-shot synthetic bank preload, then exits | `application-data` |

Initial startup preloads fictional bank records; it creates **no complaints**.
Never use real customer information.

Stop with `docker compose stop`; resume with `docker compose up -d`. Do not use
`down -v` unless deliberately discarding all local investigation data.

## Guided demo tour

New visitors can choose **Take the guided tour** on the entry page (or **Tour** in
any header). It follows one synthetic "golden hour" scam, a fake bank-officer call
at 10:02 that leads to a payment into a "safe account", from the victim's report
to the fraud desk's reviewed handoff. The tour spotlights each analyst component
that is not self-explanatory and says what it means and why it exists. It
auto-advances when the visitor performs the step, resumes after a reload, and can
jump straight to any analyst chapter. Source: `frontend/src/tour/`.

## Practice scenarios

Every practice session generates its own synthetic bank: distinct customers, varied
amounts, a scam payment and downstream mule movements. The tester chooses **when
the scam happened** (10 min, 40 min or 2 h ago), so cases inside and outside the
golden hour can both be tried; nothing is replayed from a fixed case. The end
product, the reviewer-approved report sent to the bank case system and the
cybercrime-report receiver, opens as a readable, printable document under
**Delivery & follow-up → View delivered report**.

## Evaluate a new complaint

Follow the [step-by-step demo](docs/DEMO.md): select a synthetic customer, dispute
a payment, write a narrative, upload a real image, and submit. Review the new case,
request missing information, answer through its scoped link, review citations,
approve as a reviewer, and send to both local report receivers. Delivery creates a
follow-up state; it does not close the investigation or freeze funds.

## Architecture and boundaries

| Component | Local implementation | Prepared Google implementation |
| --- | --- | --- |
| Analyst and victim workflows | `frontend` (nginx + React) in front of `api` (FastAPI) | Separate frontend and API Cloud Run services behind one HTTPS load balancer |
| Evidence interpretation | Tesseract plus explicit local extraction rules | Document AI plus Gemini on Vertex AI |
| Evidence storage | Private filesystem | Cloud Storage quarantine/clean buckets |
| Case history, approvals, work | SQLite with revision/digest/lease checks | Firestore Native and Cloud Tasks |
| Bank records and trace | Synthetic records in DuckDB; independent feed | Bounded BigQuery analytics |
| Report destinations | Idempotent synthetic receivers | Separately authenticated hosted simulators |

The local extractor is **not a live generative model**. Synthetic records are
inputs, not pre-recorded case decisions. The Google adapters and infrastructure
are deployed to a synthetic staging environment and pass a live end-to-end run
(real Document AI and Gemini to both simulated receivers). The local Compose stack uses SQLite and
DuckDB on shared volumes; it is a demonstration topology, not a bank production one.

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
[cloud readiness](docs/CLOUD_READINESS.md), [deployment preparation](docs/DEPLOYMENT.md),
[native dependency risk](docs/NATIVE_DEPENDENCY_RISK.md), and the [prioritized backlog](BACKLOG.md).

Licensed under [MIT](LICENSE).
