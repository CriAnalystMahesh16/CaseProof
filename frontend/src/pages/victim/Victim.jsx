import React, { useState, useEffect } from "react";
import { IntakeHelper } from "../../components/Gemini.jsx";
import BankBuilder, { waitForBank } from "./BankBuilder.jsx";
import {
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Plus,
  Check,
  Upload,
  FileText,
  Clock,
  Landmark,
  MessageSquare,
} from "lucide-react";
import {
  Card,
  CardH,
  LogoMark,
  Badge,
  Status,
  Empty,
  ErrorBanner,
  Loading,
  Modal,
} from "../../components/live.jsx";
import { apiRequest, post, evidenceForm } from "../../api/client.js";
import { useSession, useResource, useAction } from "../../state/resources.jsx";
import { time, formatMinor, label } from "../../models/caseView.js";
import { go } from "../../router.js";
import {
  validateFiles,
  prepareJournal,
  readJournal,
  clearJournal,
  submitReport,
} from "../../features/victim/submission.js";
import { auth } from "../../api/auth.js";
import SampleEvidence from "./SampleEvidence.jsx";
import { recentPayments, contactWarning } from "../../models/reportGuidance.js";
import { TourButton } from "../../tour/Tour.jsx";

export default function Victim({ route }) {
  const parts = route.split("/");
  const { setPersona } = useSession();
  return (
    <div className="victim-app">
      <header className="victim-header">
        <button
          className="brand-button row gap10"
          onClick={() => location.assign("/")}
        >
          <span className="logo-mark">
            <LogoMark />
          </span>
          <div>
            <b>CaseProof</b>
            <small>Cedar Demo Bank · reporting portal</small>
          </div>
        </button>
        <div className="row gap8">
          <TourButton />
          {auth.personas && (
            <button
              className="btn sm"
              onClick={() => {
                setPersona("analyst");
                go("/staff/queue");
              }}
            >
              Analyst demo
            </button>
          )}
          <Badge tone="warn">Synthetic demonstration</Badge>
        </div>
      </header>
      <div className="victim-layout">
        <aside className="victim-guide">
          <h2>A clear next step, at your pace.</h2>
          <p>
            <b>Why report promptly?</b> The golden hour is the first 60 minutes
            after a payment. The server uses payment timestamps to prioritise
            the response; AI does not decide the clock. Reporting promptly
            cannot guarantee recovery.
          </p>
          <ol>
            <li>Choose your payments</li>
            <li>Tell us what happened</li>
            <li>Share relevant evidence</li>
            <li>Return for updates</li>
          </ol>
          <p>
            You can leave unknown details blank. Your fraud desk will ask only
            for what is needed.
          </p>
          <div className="hr" />
          <p>
            Never share an OTP, PIN or password. A report acknowledgement does
            not mean funds are held or recovered.
          </p>
        </aside>
        <main className="victim-main">
          {parts[2] === "start" ? (
            <Start />
          ) : parts[2] === "home" ? (
            <Home />
          ) : parts[2] === "report" ? (
            <Report />
          ) : parts[2] === "complaints" ? (
            <Complaint key={parts[3]} caseId={parts[3]} />
          ) : parts[2] === "reply" ? (
            <Reply key={parts[3]} token={decodeURIComponent(parts[3] || "")} />
          ) : (
            <Start />
          )}
        </main>
      </div>
      <footer className="victim-footer">
        <ShieldCheck size={15} />
        <span>
          We never ask for OTP, PIN, password or remote access.
          <br />
          Fictional accounts and source-linked assessment. A report does not
          guarantee recovery.
        </span>
      </footer>
    </div>
  );
}
const SCAM_TIMINGS = [
  [10, "10 minutes ago", "Inside the golden hour, about 50 minutes left"],
  [40, "40 minutes ago", "Inside the golden hour, about 20 minutes left"],
  [120, "2 hours ago", "Golden hour already missed"],
];
function CustomerOption({ person, selected, busy, onSelect }) {
  const incident = person.incident;
  return (
    <button
      disabled={busy}
      className={"customer-option " + (selected ? "selected" : "")}
      onClick={onSelect}
    >
      <span className="avatar">{person.display_name?.slice(0, 2) || "CP"}</span>
      <div>
        <b>{person.display_name.replace(/ \(synthetic\)$/i, "")}</b>
        <small className="mono muted">{person.account}</small>
        {incident && (
          <small className="incident-hint">
            Suspicious {formatMinor(incident.amount_minor)} payment ·{" "}
            {incident.minutes_ago} min ago
          </small>
        )}
      </div>
      {selected && <Check size={16} />}
    </button>
  );
}
function Start() {
  const resource = useResource(
      "customers",
      (signal) => apiRequest("/v1/victim/demo-customers", { signal }),
      60000,
    ),
    action = useAction(resource.reload);
  const [selected, setSelected] = useState(""),
    [catalogue, setCatalogue] = useState(null),
    [timing, setTiming] = useState(10),
    [build, setBuild] = useState(null);
  const customers = (catalogue || resource.data)?.customers || [];
  const victims = customers.filter((p) => p.incident),
    others = customers.filter((p) => !p.incident);
  const option = (p) => (
    <CustomerOption
      key={p.account}
      person={p}
      busy={action.busy}
      selected={selected === p.account}
      onSelect={() => setSelected(p.account)}
    />
  );
  return (
    <>
      <div className="victim-title">
        <div className="eyebrow">Cedar Demo Bank</div>
        <h1>Let's take the next step.</h1>
        <p>
          Play a customer who has just been scammed. A fresh fictional bank,
          scam payment and money trail are generated for you, timed the way you
          choose.
        </p>
        <p className="banner info same-browser">
          Generating your practice bank takes about 20 seconds. Keep using this
          browser: the fraud-desk view of your report opens here too, because
          it belongs to this browser's practice session.
        </p>
      </div>
      {(catalogue || resource.data)?.version < 5 && (
        <p className="banner info">
          This is an earlier practice catalogue. Start a fresh practice session
          below for the updated payment names and a current response window.
          Earlier reports remain in the Case register.
        </p>
      )}
      <Card>
        <CardH
          title="Start a live practice scam"
          sub="Everything is generated now for this session only"
        />
        <div className="card-b col gap12">
          <fieldset className="scam-timing">
            <legend>When did the scam payment happen?</legend>
            {SCAM_TIMINGS.map(([minutes, title, hint]) => (
              <label
                key={minutes}
                className={"timing-option " + (timing === minutes ? "on" : "")}
              >
                <input
                  type="radio"
                  name="scam-timing"
                  checked={timing === minutes}
                  onChange={() => setTiming(minutes)}
                />
                <span>
                  <b>{title}</b>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <button
            className="btn primary"
            data-tour="practice-session"
            aria-busy={action.busy}
            disabled={action.busy}
            onClick={() =>
              action
                .run(async () => {
                  setBuild({ stage: 0 });
                  // The server generates and publishes in one call (~20 s);
                  // advance the visible steps while it works.
                  const ticks = [
                    [1, 1500],
                    [2, 3500],
                    [3, 6000],
                  ].map(([stage, at]) =>
                    setTimeout(
                      () =>
                        setBuild((b) =>
                          b ? { ...b, stage, published: 0, total: 6 } : b,
                        ),
                      at,
                    ),
                  );
                  try {
                    await post("/v1/victim/demo-session", {
                      minutes_ago: timing,
                    });
                    ticks.forEach(clearTimeout);
                    setBuild({ stage: 3, published: 0, total: 6 });
                    await waitForBank((p) =>
                      setBuild({
                        stage: 3,
                        published: p.published,
                        total: p.total,
                      }),
                    );
                    const next = await apiRequest("/v1/victim/demo-customers");
                    setCatalogue(next);
                    setSelected(
                      next.customers.find((p) => p.incident)?.account || "",
                    );
                    setBuild({ stage: 4, published: 6, total: 6 });
                    setTimeout(() => setBuild(null), 1500);
                  } catch (error) {
                    ticks.forEach(clearTimeout);
                    setBuild(null);
                    throw error;
                  }
                })
                .catch(() => {})
            }
          >
            {action.busy
              ? "Generating your bank and scam…"
              : "Start a fresh practice session"}
          </button>
          {build && (
            <BankBuilder
              stage={build.stage}
              published={build.published}
              total={build.total}
              minutes={timing}
            />
          )}
        </div>
      </Card>
      <Card>
        <CardH
          title="Choose your demo customer"
          sub="Customers marked with a suspicious payment are the scam victims"
        />
        <div className="card-b">
          <ErrorBanner error={resource.error || action.error} />
          {resource.loading ? (
            <Loading />
          ) : (
            <>
              {!victims.length && (
                <p className="muted">
                  {customers.length
                    ? "These customers have only normal payments. Start a fresh practice session above to generate a scam victim."
                    : "No practice session yet. Choose the scam timing above and start one; your customers appear here in about 30 seconds."}
                </p>
              )}
              <div className="customer-grid">
                {(victims.length ? victims : others).map(option)}
              </div>
              {victims.length > 0 && others.length > 0 && (
                <details className="other-customers">
                  <summary>
                    Other customers without a reported incident ({others.length}
                    )
                  </summary>
                  <div className="customer-grid">{others.map(option)}</div>
                </details>
              )}
            </>
          )}
          <button
            className="btn primary lg full"
            data-tour="continue-customer"
            disabled={!selected || action.busy}
            onClick={() =>
              action
                .run(async () => {
                  await post("/v1/victim/sessions", { customer_id: selected });
                  try {
                    const txn = customers.find((p) => p.account === selected)
                      ?.incident?.txn_id;
                    if (txn) sessionStorage.setItem("cp-incident-txn", txn);
                    else sessionStorage.removeItem("cp-incident-txn");
                  } catch {
                    /* hint only */
                  }
                  go("/victim/home");
                })
                .catch(() => {})
            }
          >
            Continue with selected customer <ArrowRight size={15} />
          </button>
          <div className="hr" />
          <button
            className="btn"
            hidden={!customers.length}
            disabled={action.busy}
            onClick={() =>
              action
                .run(async () => {
                  await apiRequest("/v1/victim/me");
                  go("/victim/home");
                })
                .catch(() => {})
            }
          >
            Continue current session
          </button>
        </div>
      </Card>
    </>
  );
}
function useMe() {
  return useResource(
    "victim:me",
    (signal) => apiRequest("/v1/victim/me", { signal }),
    10000,
  );
}
function SessionError({ resource }) {
  return (
    <>
      <ErrorBanner error={resource.error} onRetry={resource.reload} />
      <button className="btn" onClick={() => go("/victim/start")}>
        Choose a demo customer
      </button>
    </>
  );
}
function Home() {
  const resource = useMe();
  if (resource.loading)
    return (
      <Loading message="Opening your account. A new practice bank publishes its records first, which can take up to a minute." />
    );
  if (!resource.data) return <SessionError resource={resource} />;
  const me = resource.data;
  return (
    <>
      <div className="victim-title">
        <div className="eyebrow">Your Cedar account</div>
        <h1>
          Hello, {me.customer.display_name.replace(/ \(synthetic\)$/i, "")}.
        </h1>
        <p>
          Tell us which payments concern you. You can return here for updates
          and focused questions.
        </p>
        <p className="banner info">
          For a golden-hour practice case, start a fresh session and report the
          recent safe-account payment. Its downstream bank records are prepared
          independently of your report. Older payments remain reportable; their
          first-hour window will show as elapsed.
        </p>
      </div>
      <div className="row gap8 wrap victim-actions">
        <button
          className="btn primary lg"
          data-tour="report-scam"
          onClick={() => go("/victim/report")}
        >
          <Plus size={15} />
          Report a payment scam
        </button>
        <button className="btn" onClick={resource.reload}>
          Check for updates
        </button>
        <button className="btn ghost" onClick={() => go("/victim/start")}>
          Change demo customer
        </button>
      </div>
      <ErrorBanner error={resource.error} />
      <Card>
        <CardH
          title="Your reports"
          sub="Only this fictional customer's complaints"
        />
        <div className="card-b">
          {me.complaints.map((id) => (
            <button
              className="report-link"
              key={id}
              onClick={() => go("/victim/complaints/" + id)}
            >
              <FileText size={18} />
              <b className="mono grow">{id}</b>
              <ArrowRight size={15} />
            </button>
          ))}
          {!me.complaints.length && (
            <Empty>
              No reports yet. Start with the payments you want to dispute.
            </Empty>
          )}
        </div>
      </Card>
      <Card>
        <CardH
          title="Recent payments"
          sub="Bank records establish a payment; you decide whether it belongs in your complaint"
        />
        <div className="card-b">
          {me.transactions.slice(0, 12).map((t) => (
            <Payment key={t.txn_id} t={t} />
          ))}
        </div>
      </Card>
    </>
  );
}
// The generated scam payment for the chosen customer, remembered from the start screen.
const incidentTxn = () => {
  try {
    return sessionStorage.getItem("cp-incident-txn");
  } catch {
    return null;
  }
};
function Payment({ t, children }) {
  const suspicious = t.txn_id === incidentTxn();
  return (
    <div className={"payment-row" + (suspicious ? " suspicious" : "")}>
      <span className="payment-icon">
        <Landmark size={17} />
      </span>
      <div className="grow">
        <b>
          {t.payee || t.payee_vpa || t.to_account || t.beneficiary || t.txn_id}
        </b>
        <small className="muted">{time(t.ts)}</small>
        <small className="mono muted">{t.reference || t.txn_id}</small>
        {suspicious && (
          <small className="incident-hint">
            The scam payment in this practice scenario
          </small>
        )}
      </div>
      <b className="num">{formatMinor(t.amount_minor)}</b>
      {children}
    </div>
  );
}
function Report() {
  const me = useMe(),
    { config } = useSession();
  const action = useAction();
  const [step, setStep] = useState(0),
    [selected, setSelected] = useState([]),
    [unknown, setUnknown] = useState(false),
    [narrative, setNarrative] = useState(""),
    [authorisation, setAuthorisation] = useState("unsure"),
    [first, setFirst] = useState(""),
    [contactConfirmed, setContactConfirmed] = useState(false),
    [refs, setRefs] = useState({
      bank_reference: "",
      ncrp_reference: "",
      fir_reference: "",
    }),
    [files, setFiles] = useState([]),
    [validation, setValidation] = useState(""),
    [journal, setJournal] = useState(null);
  const account = me.data?.customer.account;
  useEffect(() => {
    if (account) setJournal(readJournal(account));
  }, [account]);
  if (me.loading) return <Loading />;
  if (!me.data) return <SessionError resource={me} />;
  const existing = journal;
  const chronologyWarning = contactWarning(
    first,
    selected,
    me.data.transactions,
  );
  function advance() {
    const error =
      step === 0 && !unknown && !selected.length
        ? "Select a payment, or choose that you cannot identify it yet."
        : step === 1 &&
            (narrative.trim().length < 5 || narrative.length > 10000)
          ? "Describe what happened in 5–10,000 characters."
          : step === 1 && chronologyWarning && !contactConfirmed
            ? "Check the first contact time, or confirm it is accurate below."
            : step === 2
              ? validateFiles(
                  files.map((f) => f.file),
                  narrative,
                  config.evidence,
                )
              : null;
    setValidation(error || "");
    if (!error) setStep((n) => Math.min(3, n + 1));
  }
  async function send() {
    setValidation("");
    await action
      .run(async () => {
        const j =
          existing ||
          (await prepareJournal(
            account,
            {
              narrative,
              transaction_ids: unknown ? [] : selected,
              payment_authorisation: authorisation,
              ...refs,
              ...(first
                ? { first_contact: new Date(first).toISOString() }
                : {}),
            },
            files,
          ));
        setJournal(j);
        const result = await submitReport(account, j, files, setJournal);
        if (result.files.every((f) => f.state === "received"))
          clearJournal(account);
        go("/victim/complaints/" + result.caseId);
      })
      .catch(() => {});
  }
  return (
    <>
      <button className="btn ghost" onClick={() => go("/victim/home")}>
        <ArrowLeft size={14} />
        Your account
      </button>
      <div className="victim-title">
        <div className="eyebrow">
          New report ·{" "}
          {me.data.customer.display_name.replace(/ \(synthetic\)$/i, "")}
        </div>
        <h1>Tell us what happened.</h1>
        <p>
          You can leave unknown details blank. Share only evidence relevant to
          these payments.
        </p>
      </div>
      {existing && !action.busy && (
        <div className="banner warn">
          <div className="grow">
            A submission is awaiting recovery.{" "}
            {existing.caseId
              ? "Report " + existing.caseId + " is already registered."
              : "The original submission identifier is preserved."}
            <br />
            Retry uses its original details. Reselect any pending files with the
            same contents.
          </div>
          <button className="btn sm" onClick={send} disabled={action.busy}>
            Resume submission
          </button>
          {existing.caseId && (
            <button
              className="btn sm"
              onClick={() => go("/victim/complaints/" + existing.caseId)}
            >
              View report
            </button>
          )}
        </div>
      )}
      <ol className="form-progress">
        {["Payments", "What happened", "Evidence", "Review"].map((name, i) => (
          <li
            key={name}
            className={step === i ? "active" : step > i ? "done" : ""}
          >
            <span>{step > i ? <Check size={13} /> : i + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      <Card>
        <div className="card-b report-form">
          <ErrorBanner error={action.error} />
          {validation && (
            <div className="banner crit" role="alert">
              {validation}
            </div>
          )}
          {step === 0 && (
            <>
              <h2 data-tour="report-payments">
                Which payments do you want to dispute?
              </h2>
              <p className="muted">
                Newest payments first. Choose only payments that belong in this
                report. A candidate is not automatically disputed.
              </p>
              {recentPayments(me.data.transactions).map((t) => (
                <label className="select-payment" key={t.txn_id}>
                  <input
                    type="checkbox"
                    aria-label={"Dispute payment " + t.txn_id}
                    disabled={unknown}
                    checked={selected.includes(t.txn_id) && !unknown}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, t.txn_id].slice(0, 20)
                          : old.filter((id) => id !== t.txn_id),
                      )
                    }
                  />
                  <Payment t={t} />
                </label>
              ))}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={unknown}
                  onChange={(e) => setUnknown(e.target.checked)}
                />
                I cannot identify the payment yet
              </label>
            </>
          )}
          {step === 1 && (
            <>
              <h2 data-tour="report-narrative">Your account of the incident</h2>
              <label>
                What happened?
                <textarea
                  aria-label="What happened?"
                  rows={7}
                  minLength={5}
                  maxLength={10000}
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  placeholder="Describe what you remember. You do not need special wording."
                />
              </label>
              <IntakeHelper narrative={narrative} />
              <label>
                How did the payment happen?
                <select
                  value={authorisation}
                  onChange={(e) => setAuthorisation(e.target.value)}
                >
                  <option value="unsure">I'm not sure</option>
                  <option value="deceived">
                    I made the payment after being deceived
                  </option>
                  <option value="unrecognised">
                    I do not recognise or authorise this payment
                  </option>
                </select>
              </label>
              <label>
                When did the caller first contact you? (optional, local time)
                <input
                  type="datetime-local"
                  value={first}
                  onChange={(e) => {
                    setFirst(e.target.value);
                    setContactConfirmed(false);
                  }}
                />
              </label>
              <p className="muted">
                Enter when the contact began, not when you are filing this
                report. Leave it blank if uncertain. The response window uses
                the bank payment time.
              </p>
              {chronologyWarning && (
                <div className="banner warn" role="status">
                  <div>
                    <p>{chronologyWarning}</p>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={contactConfirmed}
                        onChange={(e) => setContactConfirmed(e.target.checked)}
                      />
                      Keep this contact time as reported
                    </label>
                  </div>
                </div>
              )}
              <details>
                <summary>Existing complaint references (optional)</summary>
                {Object.entries(refs).map(([k, v]) => (
                  <label key={k}>
                    {label(k)}
                    <input
                      maxLength={120}
                      value={v}
                      onChange={(e) =>
                        setRefs({ ...refs, [k]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </details>
            </>
          )}
          {step === 2 && (
            <>
              <h2 data-tour="report-evidence">Share relevant evidence</h2>
              <p className="muted">
                Optional · PNG, JPEG or UTF-8 text · 5 MiB per file. Up to 5
                initial attachments; narrative uses the sixth slot. Total case
                limit 20 MiB. PDF is not supported.
              </p>
              <SampleEvidence
                selected={selected}
                narrative={narrative}
                setFiles={setFiles}
                count={files.length}
              />
              <label className="upload-zone">
                <Upload size={24} />
                <b>Choose actual evidence files</b>
                <span>Keep the original receipt or message screenshot</span>
                <input
                  aria-label="Report evidence"
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,text/plain"
                  onChange={(e) =>
                    setFiles((old) => [
                      ...old,
                      ...Array.from(e.target.files).map((file) => ({
                        file,
                        kind: "receipt",
                      })),
                    ])
                  }
                />
              </label>
              <UploadList files={files} setFiles={setFiles} />
              <p className="muted">
                To test receipt OCR, download a supported bank receipt from your
                payment list, then attach the saved original.
              </p>
              {selected.map((id) => (
                <a
                  key={id}
                  className="btn sm receipt-link"
                  href={"/v1/victim/receipts/" + encodeURIComponent(id)}
                  download
                >
                  View bank receipt · {id}
                </a>
              ))}
            </>
          )}
          {step === 3 && (
            <>
              <h2 data-tour="report-review">Review your report</h2>
              <div className="bound">
                <p>
                  <b>
                    {me.data.customer.display_name.replace(
                      / \(synthetic\)$/i,
                      "",
                    )}
                  </b>{" "}
                  · {me.data.customer.account}
                </p>
                <p>
                  {unknown
                    ? "Payment identification is uncertain"
                    : selected.length + " disputed payment(s) selected"}
                </p>
                <p>{narrative}</p>
                <p>{files.length} optional attachment(s)</p>
                <p>{label(authorisation)}</p>
              </div>
              <div className="banner info">
                Submitting registers your report and starts assessment. Evidence
                files are received separately; a failed attachment can be
                retried without creating another complaint.
              </div>
              <p className="muted">
                For interrupted submission recovery, this tab temporarily stores
                the synthetic narrative and file hashes. File contents are not
                stored. The recovery record is cleared when all selected
                evidence is received.
              </p>
            </>
          )}
          <div className="form-footer">
            <button
              className="btn"
              disabled={step === 0 || action.busy}
              onClick={() => {
                setStep((n) => n - 1);
                setValidation("");
              }}
            >
              Back
            </button>
            {step < 3 ? (
              <button className="btn primary" onClick={advance}>
                Continue <ArrowRight size={14} />
              </button>
            ) : (
              <button
                className="btn primary lg"
                disabled={action.busy}
                onClick={send}
              >
                {action.busy
                  ? "Registering / receiving evidence…"
                  : "Submit report"}
              </button>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
function UploadList({ files, setFiles }) {
  return (
    <div className="upload-list">
      {files.map((f, i) => (
        <div className="upload-row" key={i}>
          <FileText size={17} />
          <div className="grow">
            <b>{f.file.name}</b>
            <small>{(f.file.size / 1024).toFixed(1)} KiB</small>
          </div>
          <select
            aria-label={"Evidence kind " + (i + 1)}
            value={f.kind}
            onChange={(e) =>
              setFiles((old) =>
                old.map((x, j) =>
                  j === i ? { ...x, kind: e.target.value } : x,
                ),
              )
            }
          >
            {["receipt", "messages", "call_log", "narrative"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <button
            className="btn sm"
            onClick={() => setFiles((old) => old.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
function Complaint({ caseId }) {
  const { setPersona } = useSession();
  const resource = useResource(
      "victim-case:" + caseId,
      (signal) => apiRequest("/v1/victim/complaints/" + caseId, { signal }),
      5000,
    ),
    me = useMe();
  const action = useAction(resource.reload);
  const [decision, setDecision] = useState(null),
    [files, setFiles] = useState([]);
  const c = resource.data,
    account = me.data?.customer.account,
    journal = account ? readJournal(account) : null;
  const run = (fn) => action.run(fn).catch(() => {});
  return (
    <>
      <button className="btn ghost" onClick={() => go("/victim/home")}>
        <ArrowLeft size={14} />
        Your reports
      </button>
      <div className="victim-title">
        <div className="eyebrow">Your report reference</div>
        <h1 className="case-reference" data-tour="complaint-reference">
          {caseId}
        </h1>
        <p>
          Your report and received evidence are preserved while the fraud desk
          assesses them.
        </p>
      </div>
      <ErrorBanner
        error={resource.error || action.error}
        onRetry={resource.reload}
      />
      {resource.loading ? (
        <Loading />
      ) : c ? (
        <>
          <Card>
            <div className="card-b">
              <div className="receipt-status">
                <span className="receipt-check">
                  <Check size={24} />
                </span>
                <div className="grow">
                  <h2>Report registered</h2>
                  {auth.personas && (
                    <button
                      className="btn primary"
                      onClick={() => {
                        setPersona("analyst");
                        go(`/staff/cases/${caseId}/overview`);
                      }}
                    >
                      Continue as analyst demo <ArrowRight size={14} />
                    </button>
                  )}
                  <p>{c.status}</p>
                </div>
                <Status value={c.processing?.state} />
              </div>
              <p className="muted">
                {c.processing?.message ||
                  "You can leave this page and return to check for updates."}
              </p>
              <button className="btn" onClick={resource.reload}>
                Check for updates
              </button>
              <div className="banner info">{c.note}</div>
            </div>
          </Card>
          {journal?.caseId === caseId &&
            journal.files.some((f) => f.state !== "received") && (
              <Card>
                <CardH
                  title="Attachments still need attention"
                  sub="Your complaint is already registered"
                />
                <div className="card-b">
                  {journal.files.map((f, i) => (
                    <div className="statement" key={i}>
                      <b>{f.name}</b>
                      <Status value={f.state} />
                      <p>{f.error}</p>
                    </div>
                  ))}
                  <label>
                    Reselect pending files
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,text/plain"
                      onChange={(e) =>
                        setFiles(
                          Array.from(e.target.files).map((file) => ({
                            file,
                            kind: "receipt",
                          })),
                        )
                      }
                    />
                  </label>
                  <button
                    className="btn primary"
                    disabled={action.busy || !files.length}
                    onClick={() =>
                      run(async () => {
                        const result = await submitReport(
                          account,
                          journal,
                          files,
                        );
                        if (result.files.every((f) => f.state === "received"))
                          clearJournal(account);
                      })
                    }
                  >
                    Retry missing attachments
                  </button>
                </div>
              </Card>
            )}
          <Card>
            <CardH
              title="Questions from your fraud desk"
              sub="Respond only to the information needed for this case"
            />
            <div className="card-b">
              {c.candidate_payments.map((t) => (
                <div className="candidate-question" key={t.txn_id}>
                  <div className="row gap8 wrap">
                    <b>
                      {formatMinor(t.amount_minor)} · {t.payee}
                    </b>
                    <Badge tone="warn">Candidate · not added to loss</Badge>
                  </div>
                  <p>
                    {time(t.ts)} · {t.reference || "Reference unavailable"}
                  </p>
                  <p>Is this payment part of your complaint?</p>
                  <div className="row gap8 wrap">
                    <button
                      className="btn primary"
                      disabled={action.busy}
                      onClick={() => setDecision({ t, disputed: true })}
                    >
                      Yes, dispute this payment
                    </button>
                    <button
                      className="btn"
                      disabled={action.busy}
                      onClick={() => setDecision({ t, disputed: false })}
                    >
                      No, this payment is unrelated
                    </button>
                  </div>
                </div>
              ))}
              {c.messages.map((m) => (
                <div className="message-request" key={m.request_id}>
                  <MessageSquare size={18} />
                  <div className="grow">
                    <p>{m.text}</p>
                    {m.reply_url ? (
                      <button
                        className="btn primary"
                        onClick={() =>
                          go(
                            "/victim/reply/" +
                              encodeURIComponent(m.reply_url.split("/").at(-1)),
                          )
                        }
                      >
                        Respond to request <ArrowRight size={14} />
                      </button>
                    ) : (
                      <p className="muted">
                        This reply link expired. Contact the fraud desk for a
                        current request.
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {!c.messages.length && !c.candidate_payments.length && (
                <Empty>No clarification is needed from you right now.</Empty>
              )}
            </div>
          </Card>
          <Card>
            <CardH
              title="Received evidence"
              sub={
                c.evidence_count + " evidence item(s) · includes your narrative"
              }
            />
            <div className="card-b">
              {c.artifacts?.map((a) => (
                <div className="received-artifact" key={a.artifact_id}>
                  <FileText size={17} />
                  <div className="grow">
                    <b>{label(a.kind)}</b>
                    <small>
                      {a.byte_count.toLocaleString()} bytes ·{" "}
                      {time(a.received_at)}
                    </small>
                    <small className="mono hash-text">{a.sha256}</small>
                  </div>
                  <Badge tone="ok">Received</Badge>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}
      {decision && (
        <Modal
          title="Confirm payment decision"
          onClose={() => setDecision(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDecision(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={action.busy}
                onClick={() =>
                  run(async () => {
                    await post(`/v1/victim/complaints/${caseId}/payments`, {
                      transaction_id: decision.t.txn_id,
                      disputed: decision.disputed,
                    });
                    setDecision(null);
                  })
                }
              >
                Confirm {decision.disputed ? "dispute" : "unrelated payment"}
              </button>
            </>
          }
        >
          <p>
            {formatMinor(decision.t.amount_minor)} · {decision.t.payee}
          </p>
          <p>
            {decision.disputed
              ? "You confirm this payment belongs in your complaint."
              : "You confirm this payment is unrelated to your complaint."}
          </p>
          <p className="muted">
            A previously recorded decision cannot be silently reversed;
            corrections require the fraud desk.
          </p>
          <ErrorBanner error={action.error} />
        </Modal>
      )}
    </>
  );
}
function Reply({ token }) {
  const [done, setDone] = useState(false),
    [returnCase, setReturnCase] = useState(null);
  const resource = useResource(
    "reply:" + token,
    (signal) =>
      apiRequest("/v1/customer/" + encodeURIComponent(token), { signal }),
    done ? false : 60000,
  );
  const action = useAction();
  const [files, setFiles] = useState([]),
    [notes, setNotes] = useState(""),
    [unavailable, setUnavailable] = useState(false);
  const [validation, setValidation] = useState("");
  const c = resource.data;
  useEffect(() => {
    if (c?.case_id) setReturnCase(c.case_id);
  }, [c?.case_id]);
  async function send() {
    const err = validateFiles(
      files.map((f) => f.file),
      "",
      c.evidence,
      [],
    );
    if (err) {
      setValidation(err);
      return;
    }
    if (unavailable && !notes.trim()) {
      setValidation("Please explain why you cannot provide this information.");
      return;
    }
    await action
      .run(async () => {
        for (const f of files)
          await apiRequest(
            "/v1/customer/" + encodeURIComponent(token) + "/artifacts",
            { method: "POST", body: evidenceForm(f.file, f.kind) },
          );
        await post("/v1/customer/" + encodeURIComponent(token) + "/complete", {
          notes,
          unavailable,
        });
        setDone(true);
      })
      .catch(() => {});
  }
  return (
    <>
      <div className="victim-title">
        <div className="eyebrow">Secure scoped reply</div>
        <h1>
          {done
            ? "Thank you. Your reply is received."
            : "One focused question."}
        </h1>
        <p>Share the requested information, or tell us if it is unavailable.</p>
      </div>
      <ErrorBanner error={resource.error || action.error} />
      {done ? (
        <Card className="card-b">
          <div className="receipt-check">
            <Check size={24} />
          </div>
          <h2>Your evidence will be assessed.</h2>
          <p>A reply is not a recovery confirmation.</p>
          <button
            className="btn primary"
            onClick={() =>
              go(
                returnCase
                  ? "/victim/complaints/" + returnCase
                  : "/victim/home",
              )
            }
          >
            Return to your report
          </button>
        </Card>
      ) : c ? (
        <Card>
          <CardH
            title="Request from Cedar's fraud desk"
            sub={
              "Link expires " +
              time(new Date(c.expires_at * 1000).toISOString())
            }
          />
          <div className="card-b">
            <p className="request-purpose">{c.request}</p>
            <p className="muted">{c.reminder}</p>
            {validation && (
              <div className="banner crit" role="alert">
                {validation}
              </div>
            )}
            <label>
              Relevant evidence (PNG, JPEG, UTF-8 text · 5 MiB)
              <input
                aria-label="Reply evidence"
                type="file"
                multiple
                accept="image/png,image/jpeg,text/plain"
                disabled={unavailable}
                onChange={(e) =>
                  setFiles(
                    Array.from(e.target.files).map((file) => ({
                      file,
                      kind: "receipt",
                    })),
                  )
                }
              />
            </label>
            <UploadList files={files} setFiles={setFiles} />
            <label>
              Notes / explanation
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={10000}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={unavailable}
                onChange={(e) => {
                  setUnavailable(e.target.checked);
                  if (e.target.checked) setFiles([]);
                }}
              />
              I cannot provide this information
            </label>
            <button
              className="btn primary lg full"
              disabled={action.busy || c.can_complete === false}
              onClick={send}
            >
              {action.busy ? "Sending reply…" : "Submit reply"}
            </button>
          </div>
        </Card>
      ) : resource.loading ? (
        <Loading />
      ) : (
        <div className="banner warn">
          This link is unavailable or expired. Return to your report for current
          requests.
        </div>
      )}
    </>
  );
}
