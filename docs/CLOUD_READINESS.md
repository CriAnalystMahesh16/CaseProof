# Google deployment readiness

**Deployment is on hold.** Local integration or GitHub publication does not
permit Terraform apply, image publication, DNS changes or enabling dispatch.

Prepared components: Cloud Run, Vertex AI Gemini, Document AI, Cloud Storage,
Firestore Native, BigQuery, Cloud Tasks, Cloud Scheduler, Artifact Registry, IAM,
Logging/Monitoring, budget/resource limits and Cloud Armor Standard. Secret
Manager is conditional when an external secret actually exists; attached identity
avoids service-account key files. Keep hosted simulators explicitly synthetic.

Before an authorized staging deployment:

1. Complete integrated frontend authentication and asynchronous workflow acceptance.
2. Establish scanner latency margin and assess remaining native dependency risks.
3. Confirm Mumbai processor/version, model availability and quotas; configure staff
   subjects/OAuth audience, real HTTPS domain and operational alert destination.
4. Review protected Terraform state ownership/imports and immutable image digests.
5. Estimate a short validation window. The initial $25 target is a planning limit;
   budgets alert but do not stop charges. Armor/load-balancer hourly charges matter.
6. Obtain the user's explicit deployment instruction. Defaults fail the deployment
   gate; Tasks and Scheduler stay paused until service/identity checks pass.

After staging deployment: test real Firestore contention/IAM, BigQuery publication
and replay, Tasks retry recovery, edge bypass and multipart WAF behavior. Then run
a new complaint through actual Document AI and Vertex to both simulator receipts.
Evaluate retained unfamiliar inputs, including unresolved N28, before quality claims.
FCA independent evaluation remains deferred until Google integration as agreed.

Local synthetic success is not production readiness or evidence of customer demand.
See [infrastructure configuration](../infra/google/README.md).
