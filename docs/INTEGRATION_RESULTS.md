# Integrated local validation — 17 October 2026

The application runs as one supervised `caseproof-app-1` container at localhost
port 8080. Both previous six-service stacks are stopped, with volumes preserved.
A new persistent volume starts with bank records and zero complaints.

| Check | Result | Scope |
| --- | --- | --- |
| Frontend unit/component suite | 39/39 pass | 14 test files |
| Focused host/supervisor/worker tests | 5/5 pass | Route isolation, valid/expired capabilities, cleanup, heartbeat |
| Clarification return-target contract | 2/2 pass after reproduced failure | Both local and cloud adapters |
| Automated browser full workflow | 30/30 pass | Two new complaints with actual uploaded PNGs |
| Accessibility scans | 10 scans, zero reported violations | Sampled victim, queue, overview, trail and delivery screens |
| Browser uncaught errors | Zero | Automated acceptance run |
| Fresh full backend regression | RUNNING | Prior complete baseline 313/313; final result to be recorded |
| Static/config checks | Scoped Ruff and configured mypy pass; Compose parses | No cloud apply |
| Credential-pattern review | 523 text files, no matches | Limited signatures; not an exhaustive secret audit |

## Browser workflow exercised

Both fresh automated cases select a preloaded synthetic account/payment, submit
an actual bank-generated PNG plus a new narrative, wait for real local OCR,
appear automatically in the analyst queue, render a money trail, send a missing
information request, accept the victim's response, explicitly exclude an unrelated
candidate debit, and enforce reviewer-only approval. Both report destinations
acknowledge delivery. Follow-up owner/next action survives reload.

Cases: `CASE-bdf18f757cf33080` and `CASE-7ec653d3f2c43046`.
Provider: real local Tesseract plus literal extraction rules. No live cloud model
or pre-recorded complaint outcome is represented.

Manual browser testing independently verified the entry screen, empty practice
queue, account/payment selection, narrative entry, receipt download/file upload,
and creation of `CASE-418e861b3fda9010` with both evidence items received.
The Chrome extension subsequently disconnected repeatedly during analyst-tab
attachment. A fully manual analyst-to-delivery completion is therefore not yet
claimed; the complete automated browser flow above passed. The same manual case
can be continued using the demo guide when browser control is restored.

## Confirmed issues fixed during integration

1. A hung initialization process could escape supervisor cleanup. It now remains
   tracked until exit, has a 300s deadline, and is killed/reaped on failure.
2. Customer reply envelopes omitted their case return target. Both local/cloud
   capability-validated responses now include scoped `case_id`; red tests failed
   before the fix. The first browser run's return-navigation timeout is retained.
3. SPA hosting preserves API 404s, denied expired links, no-store/no-referrer,
   request limits and same-origin session cookies rather than a generic fallback.

A separate Lead Technical review found no remaining confirmed code publication
blocker after fixes. This is an engineering review, not an independent security
certification. Runtime image: `sha256:99789878f49f26d0925ef23df2f185469a5536603ea4d44ab7e915a1f027bb65`.

Raw local reports: `var/frontend-validation/quality/acceptance.json`, screenshots
and `axe-results.json`; `var/readiness/integrated-backend-full.xml` when complete.
The original failed attempt is preserved in the same local evidence directory.

## Remaining boundaries

Scanner competing-load latency, native dependency risk assessment, B11 bootstrap
latency and N28 unfamiliar-input quality remain open. Real Google service, IAM,
WAF and Document AI/Vertex acceptance needs an authorized staging deployment.
No production readiness or human time-saved claim. Google deployment remains held.
