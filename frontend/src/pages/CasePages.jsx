import { canRequestRole } from "../api/auth.js";
import React, { useState, useEffect } from "react";
import {
  Clock,
  ArrowRight,
  FileText,
  Database,
  ShieldCheck,
  Sparkles,
  Check,
  Info,
} from "lucide-react";
import {
  Card,
  CardH,
  Ring,
  Badge,
  Metric,
  Status,
  ErrorBanner,
  Empty,
  Modal,
  SourceChip,
} from "../components/live.jsx";
import { formatMinor, time, remaining, label } from "../models/caseView.js";
import {
  useSession,
  useAction,
  useResource,
  useDisplayClock,
} from "../state/resources.jsx";
import { apiRequest, post, evidenceForm } from "../api/client.js";
import { go } from "../router.js";
import Evidence from "./case/LiveEvidence.jsx";
import MoneyTrail from "./case/LiveTrail.jsx";
import Review from "./case/LiveReview.jsx";
import Delivery from "./case/LiveDelivery.jsx";
import { GeminiSummary } from "../components/Gemini.jsx";

export default function CasePages({ view, tab, stale, reload }) {
  const props = { view, reload, stale };
  return (
    <>
      {view.workflow.bank_data_refresh_required && (
        <div className="banner warn">
          <Clock size={16} />
          Bank observations need refresh. Observed availability is time-bound;
          unsupported sends remain blocked.
        </div>
      )}
      {tab === "overview" ? (
        <Overview {...props} />
      ) : tab === "evidence" ? (
        <Evidence {...props} />
      ) : tab === "trail" ? (
        <MoneyTrail {...props} />
      ) : tab === "requests" ? (
        <Requests {...props} />
      ) : tab === "review" ? (
        <Review {...props} />
      ) : tab === "delivery" ? (
        <Delivery {...props} />
      ) : tab === "audit" ? (
        <Audit {...props} />
      ) : (
        <Empty>Section unavailable.</Empty>
      )}
    </>
  );
}
function Overview({ view }) {
  const countdown = useDisplayClock(view.workflow.clock);
  const { snapshot: s, workflow: w } = view;
  const brief = w.brief || {},
    next = brief.recommended_action || {};
  const to = (section) => go(`/staff/cases/${s.case_id}/${section}`);
  return (
    <>
    <GeminiSummary caseId={s.case_id} revision={s.revision} />
    <div className="g3 overview-grid">
      <Card>
        <CardH
          title="Payment inventory"
          sub="Disputed payments and candidates remain distinct"
        />
        <div className="card-b">
          <div className="tl">
            {(brief.payments || []).map((p) => (
              <div
                className={
                  "tl-item " + (p.status === "confirmed_disputed" ? "crit" : "")
                }
                key={p.txn_id}
              >
                <span className="dot" />
                <div className="muted mono">{time(p.at)}</div>
                <div
                  className={
                    "debit-card " +
                    (p.status === "confirmed_disputed" ? "urgent" : "")
                  }
                >
                  <div className="row gap8 wrap">
                    <b>{label(p.status)}</b>
                    <b className="right num">{formatMinor(p.amount_minor)}</b>
                  </div>
                  <p className="mono">{p.payee || p.txn_id}</p>
                  <div className="muted mono">
                    {p.reference || "Reference unknown"}
                  </div>
                  <Badge tone="outline">{label(p.source_category)}</Badge>
                </div>
              </div>
            ))}
            {!brief.payments?.length && (
              <Empty>
                No bank-matched disputed payment yet. Uncertain evidence remains
                visible for review.
              </Empty>
            )}
          </div>
          <div className="hr" />
          <div className="eyebrow">Source chronology</div>
          {(brief.chronology || []).slice(-6).map((e, i) => (
            <div className="chronology" key={i}>
              <span className="mono muted">{time(e.at)}</span>
              <b>{e.event}</b>
              <small className="muted">
                {label(e.source_category)} · {e.source_id}
              </small>
            </div>
          ))}
        </div>
      </Card>
      <div className="col gap12">
        <Card>
          <CardH
            title="Golden-hour priority"
            icon={<Clock size={16} />}
            sub="Response urgency, not a recovery deadline"
          />
          <div className="card-b col center">
            <Ring value={(countdown ?? 0) / 60} size={186}>
              <div>
                <div className="eyebrow">Response window</div>
                <div className="mono ring-number">{remaining(countdown)}</div>
                <small>
                  {w.clock?.replay ? "Labelled replay" : "Demo clock · IST"}
                </small>
              </div>
            </Ring>
            <div className="mini-stats full">
              <Metric
                title="Confirmed disputed"
                value={formatMinor(view.amounts.confirmed)}
              />
              <Metric
                title="Candidate"
                value={formatMinor(view.amounts.candidate)}
              />
            </div>
          </div>
        </Card>
        <Card>
          <CardH
            title="Next best step"
            sub="Driven by current gaps and supported eligibility"
          />
          <div className="card-b">
            <h3>{next.action || "Inspect current assessment"}</h3>
            <p className="muted">
              {next.reason || "Wait for the current assessment to finish."}
            </p>
            <button
              className="btn primary full"
              onClick={() =>
                to(
                  next.request_id
                    ? "requests"
                    : next.owner === "reviewer"
                      ? "review"
                      : "evidence",
                )
              }
            >
              Open next action <ArrowRight size={14} />
            </button>
            {w.urgent_referral?.eligible && (
              <button className="btn full" onClick={() => to("review")}>
                Urgent referral eligible <ShieldCheck size={14} />
              </button>
            )}
          </div>
        </Card>
      </div>
      <div className="col gap12">
        <Card className="ai-frame">
          <CardH
            title="Investigation brief"
            icon={<Sparkles size={17} />}
            sub={"Grounded in assessment r" + s.revision}
          >
            <Badge tone="ai">Advisory</Badge>
          </CardH>
          <div className="card-b">
            <p className="brief-summary">{brief.summary}</p>
            <div className="eyebrow">
              Victim account · source supported text
            </div>
            {(brief.victim_statements || []).slice(0, 4).map((c) => (
              <div className="statement" key={c.claim_id}>
                <span>
                  {c.kind === "amount"
                    ? formatMinor(c.value)
                    : String(c.value ?? "Unknown")}
                </span>
                <Status value={c.state} />
                <div className="muted">
                  {c.sources?.map((x) => x.text).join(" · ")}
                </div>
                <button
                  className="chip-cite"
                  onClick={() =>
                    to(
                      "evidence?source=" +
                        encodeURIComponent(c.sources?.[0]?.segment_id || ""),
                    )
                  }
                >
                  Inspect source
                </button>
              </div>
            ))}
            <div className="banner info">
              <Info size={15} />
              {brief.limitations ||
                "Synthetic advisory assessment. Observed funds are not frozen, recovered or refunded."}
            </div>
          </div>
        </Card>
        <Card>
          <CardH
            title="Actual processing"
            sub="Provider metadata, not a confidence score"
          />
          <div className="card-b">
            {(s.run_meta || []).length ? (
              (s.run_meta || []).slice(-2).map((r, i) => (
                <div className="insp-row" key={i}>
                  <span>
                    {r.provider} · {r.mode}
                  </span>
                  <span className="mono">{r.model_id}</span>
                </div>
              ))
            ) : (
              <p className="muted">
                Processing metadata will appear after assessment.
              </p>
            )}
            {w.job && (
              <div className="insp-row">
                <span>Current job</span>
                <Status value={w.job.status} />
              </div>
            )}
            <p className="muted">
              Processing providers for this assessment are listed above. Each
              extracted fact remains linked to its source.
            </p>
          </div>
        </Card>
        {(brief.conflicts?.length > 0 || brief.unknowns?.length > 0) && (
          <Card className="card-b" data-tour="unresolved-matters">
            <h3>Unresolved matters</h3>
            {(brief.unknowns || []).map((x, i) => (
              <p key={i}>
                {typeof x === "string" ? label(x) : JSON.stringify(x)}
              </p>
            ))}
            {brief.conflicts?.length > 0 && (
              <Badge tone="crit">
                {brief.conflicts.length} conflicting claims
              </Badge>
            )}
          </Card>
        )}
      </div>
    </div>
    </>
  );
}
function Requests({ view, reload, stale }) {
  const { persona } = useSession();
  const action = useAction(reload);
  const [confirm, setConfirm] = useState(null),
    [reason, setReason] = useState("");
  const [link, setLink] = useState(null);
  const s = view.snapshot,
    w = view.workflow,
    root = `/v1/cases/${s.case_id}`;
  const requests = s.requests || [];
  const proposal = requests.find((r) => r.state === "proposed");
  const invoke = (fn) => action.run(fn).catch(() => {});
  useEffect(() => {
    if (confirm && confirm.revision !== s.revision) setConfirm(null);
  }, [s.revision]);
  return (
    <div className="g2">
      <Card>
        <CardH
          title="Request engine"
          sub="Permitted catalogue · only unresolved customer gaps"
        />
        <div className="card-b col gap12">
          <ErrorBanner error={action.error} />
          {requests.map((r) => (
            <div
              className={"req " + (proposal === r ? "best" : "")}
              key={r.request_id}
            >
              <div className="grow">
                <b>{label(r.catalogue_id)}</b>
                <p>{r.reason}</p>
                <Status value={r.state} />
                <p className="muted">
                  {r.explanation?.can_settle?.join(" · ")}
                </p>
                <small className="muted">
                  Cannot prove:{" "}
                  {r.explanation?.cannot_prove?.join(", ") ||
                    "identity, guilt, liability or recovery"}
                </small>
              </div>
              {proposal === r && (
                <button
                  className="btn primary"
                  disabled={
                    !canRequestRole(persona, "analyst") || stale || action.busy
                  }
                  onClick={() =>
                    setConfirm({ request: r, revision: s.revision })
                  }
                >
                  Review & send
                </button>
              )}
            </div>
          ))}
          {!requests.length && (
            <Empty>No customer request is needed at this assessment.</Empty>
          )}
          {link && (
            <div className="banner ok">
              <span>Request recorded in the victim inbox. </span>
              <a
                href={
                  "#/victim/reply/" +
                  encodeURIComponent(link.url.split("/").at(-1))
                }
              >
                Open scoped reply
              </a>
            </div>
          )}
        </div>
      </Card>
      <div className="col gap12">
        <Card>
          <CardH
            title="Why this request?"
            sub="A useful answer should change the next decision"
          />
          <div className="card-b">
            <p>
              {proposal?.reason ||
                "Already settled facts are not requested again."}
            </p>
            <div className="banner info">
              A request can clarify evidence. Uploading a file does not stop a
              debit or guarantee recovery.
            </div>
            <button className="btn" onClick={() => go("/victim/home")}>
              Open victim portal <ArrowRight size={13} />
            </button>
          </div>
        </Card>
        <Card>
          <CardH
            title="Internal bank action"
            sub="Bank coverage is separate from victim clarification"
          />
          <div className="card-b">
            <p className="muted">
              Background services refresh bank observations. If records remain
              unavailable, record the reason for internal escalation.
            </p>
            <label>
              Reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why bank verification is unavailable"
              />
            </label>
            <button
              className="btn"
              disabled={
                !canRequestRole(persona, "analyst") ||
                !reason.trim() ||
                action.busy ||
                stale
              }
              onClick={() =>
                invoke(() =>
                  post(
                    root + "/bank-verification/unavailable",
                    { reason, expected_revision: s.revision },
                    persona,
                  ),
                )
              }
            >
              Record unavailable bank data
            </button>
          </div>
        </Card>
      </div>
      {confirm && (
        <Modal
          title="Send one focused customer request?"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={action.busy}
                onClick={() =>
                  invoke(async () => {
                    setLink(
                      await post(
                        root +
                          "/requests/" +
                          confirm.request.request_id +
                          "/send",
                        undefined,
                        persona,
                      ),
                    );
                    setConfirm(null);
                  })
                }
              >
                Confirm request
              </button>
            </>
          }
        >
          <p>{confirm.request.reason}</p>
          <p className="muted">
            Revision {confirm.revision}. Delivery uses the local victim inbox;
            external SMS is simulated.
          </p>
        </Modal>
      )}
    </div>
  );
}
function Audit({ view }) {
  const { persona } = useSession(),
    id = view.identity.caseId;
  const resource = useResource("audit:" + id + ":" + persona, (s) =>
    Promise.all(
      ["audit", "approvals", "urgent-referrals"].map((p) =>
        apiRequest(`/v1/cases/${id}/${p}`, { persona, signal: s }),
      ),
    ),
  );
  const [events, approvals, urgent] = resource.data || [[], [], []];
  return (
    <div className="g2">
      <Card>
        <CardH
          title="Audit chronology"
          sub="Persisted backend events · originals and decisions retained"
        />
        <div className="card-b">
          <ErrorBanner error={resource.error} />
          {[...events].reverse().map((e, i) => (
            <div key={i} className="chronology">
              <span className="mono muted">
                r{e.revision} · {time(e.at)}
              </span>
              <b>{label(e.event)}</b>
            </div>
          ))}
        </div>
      </Card>
      <div className="col gap12">
        <Card>
          <CardH
            title="Approval history"
            sub="Historical approvals do not authorise current content"
          />
          <div className="card-b">
            {approvals.length ? (
              approvals.map((a) => (
                <div className="statement" key={a.approval_id}>
                  <b>
                    Revision {a.revision} · {label(a.disposition)}
                  </b>
                  <p>{a.reason}</p>
                  <small className="mono muted">
                    {a.reviewer?.user_id} · {time(a.at)} ·{" "}
                    {a.digest?.slice(0, 16)}
                  </small>
                </div>
              ))
            ) : (
              <Empty>No complete handoff approval recorded.</Empty>
            )}
          </div>
        </Card>
        <Card className="card-b">
          <h3>Urgent referral history</h3>
          {urgent.length ? (
            urgent.map((r, i) => (
              <div className="statement" key={r.referral_id || i}>
                <b>
                  Revision {r.revision} ·{" "}
                  {label(r.status || r.disposition || "recorded")}
                </b>
                {r.reason && <p>{r.reason}</p>}
                <details>
                  <summary>Referral record</summary>
                  <pre className="safe-json">{JSON.stringify(r, null, 2)}</pre>
                </details>
              </div>
            ))
          ) : (
            <Empty>No urgent referrals recorded.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
