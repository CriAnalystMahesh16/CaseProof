# Security boundaries

This is a synthetic local prototype. Host exposure is loopback only; no real
customer data or institutional authority is represented. Cloud deployment is held.

- Staff local roles are explicit demonstration personas. Prepared cloud mode uses
  verified Google ID tokens and server-mapped roles/tenants; demo headers do not
  authorize cloud staff access.
- Victim sessions use scoped cookies; clarification links are bounded capabilities.
  Do not log/share link tokens. Token pages use no-referrer and no-store headers.
- Request bodies and image dimensions are bounded; supported evidence is PNG,
  JPEG and text. Missing/invalid source anchors do not become verified facts.
- Money calculations, readiness, revision/digest checks, permissions and delivery
  are deterministic. AI interpretation remains advisory.
- Google evidence enters quarantine and requires a digest-matching clean scan.
  Scanner unavailable, malformed/stale signatures and errors fail closed.
- ClamAV 1.4.6 and image digests are pinned. Independent native dependency audits
  were performed; raw matches include backport false positives and unresolved
  vendor findings. This is not a zero-vulnerability or production-security claim.
- Local data, credentials, environment secrets, Terraform state, generated browser
  reports and dependency/build directories are excluded from Git and build context.

The retained Bookworm image preserves the local OCR evaluation environment and
is not the production image recommendation. Prepared cloud/scanner images use
Trixie. Native-risk review and scanner performance remain release gates.

Real identity, retention, institutional access, incident operations and independent
security approval are production requirements beyond a synthetic demonstration.
