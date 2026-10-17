import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  LayoutGrid,
  Briefcase,
  ArrowRight,
  ShieldCheck,
  FileText,
  Menu,
  Search,
  ChevronRight,
  Landmark,
  Bell,
  Clock,
  Activity,
  Check,
  X,
} from "lucide-react";
import {
  useSession,
  useResource,
  useDisplayClock,
} from "./state/resources.jsx";
import { apiRequest, loadCaseView } from "./api/client.js";
import { useRoute, go } from "./router.js";
import {
  Card,
  CardH,
  LogoMark,
  Badge,
  ErrorBanner,
  Loading,
  Empty,
  Status,
  Metric,
} from "./components/live.jsx";
import { formatMinor, time, remaining, label } from "./models/caseView.js";
import Queue from "./pages/LiveQueue.jsx";
import CasePages from "./pages/CasePages.jsx";
import { auth } from "./api/auth.js";
import { queueChanges } from "./models/queue.js";
import StaffSignIn from "./components/StaffSignIn.jsx";
import Victim from "./pages/victim/Victim.jsx";

export default function App() {
  const route = useRoute(),
    session = useSession();
  const [authTick, setAuthTick] = useState(0);
  const ready = useCallback(() => setAuthTick((x) => x + 1), []);
  useEffect(() => {
    const id = setInterval(() => setAuthTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (session.error)
    return (
      <div className="page">
        <ErrorBanner error={session.error} onRetry={() => location.reload()} />
      </div>
    );
  if (!session.config) return <Loading />;
  if (route.startsWith("/victim/")) return <Victim route={route} />;
  if (route === "/entry") return <Entry />;
  if (auth.profile === "cloud" && !auth.ready())
    return <StaffSignIn onReady={ready} />;
  return <Staff route={route} />;
}
function Entry() {
  return (
    <div className="entry-page">
      <div className="entry-brand">
        <span className="logo-mark">
          <LogoMark />
        </span>
        <b>CaseProof</b>
        <Badge tone="warn">Synthetic bank demonstration</Badge>
      </div>
      <div className="entry-body">
        <div className="eyebrow">Cedar Demo Bank · payment scam response</div>
        <h1>
          From a difficult moment
          <br />
          to a supported next step.
        </h1>
        <p>
          Report what happened. Understand the evidence. Give the fraud desk a
          clear, accountable path forward.
        </p>
        <div className="entry-options">
          <button className="entry-option" onClick={() => go("/victim/start")}>
            <span className="entry-icon">
              <ShieldCheck />
            </span>
            <h2>Report a payment scam</h2>
            <p>
              Select your payments, share your account of what happened, and
              return for updates.
            </p>
            <span className="row gap8">
              Open reporting portal <ArrowRight size={15} />
            </span>
          </button>
          <button className="entry-option" onClick={() => go("/staff/queue")}>
            <span className="entry-icon violet">
              <Briefcase />
            </span>
            <h2>Fraud desk workspace</h2>
            <p>
              Inspect cited evidence, review the money trail and approve a
              supported handoff.
            </p>
            <span className="row gap8">
              Enter staff demo <ArrowRight size={15} />
            </span>
          </button>
        </div>
        <div className="entry-foot">
          <Landmark size={15} /> Fictional accounts · local processing ·
          simulated report destinations
        </div>
      </div>
    </div>
  );
}
function Staff({ route }) {
  const { persona, setPersona, config } = useSession();
  const [menu, setMenu] = useState(false);
  const [queueScope, setQueueScope] = useState("active");
  const queue = useResource(
    "staff-queue:" + persona + ":" + queueScope,
    (signal) =>
      apiRequest("/v1/workspace?scope=" + queueScope, { persona, signal }),
    5000,
  );
  const previous = useRef(null);
  const [alerts, setAlerts] = useState([]),
    [showAlerts, setShowAlerts] = useState(false);
  useEffect(() => {
    if (!queue.data) return;
    const changes = queueChanges(previous.current, queue.data.cases || []);
    previous.current = queue.data.cases || [];
    if (changes.length)
      setAlerts((old) =>
        [
          ...changes.map((c) => ({
            ...c,
            eventId: c.case_id + ":" + c.status + ":" + Date.now(),
            seen: false,
          })),
          ...old,
        ].slice(0, 30),
      );
  }, [queue.data]);
  useEffect(() => {
    previous.current = null;
    setAlerts([]);
  }, [persona, queueScope]);
  const parts = route.split("/"),
    caseId = parts[2] === "cases" ? parts[3] : null,
    tab = (parts[4] || "overview").split("?")[0];
  useEffect(() => {
    if (caseId)
      setAlerts((old) =>
        old.map((a) => (a.case_id === caseId ? { ...a, seen: true } : a)),
      );
  }, [caseId]);
  return (
    <div className={"app studio-app " + (menu ? "menu-open" : "")}>
      <aside className="side">
        <button className="logo brand-button" onClick={() => go("/entry")}>
          <span className="logo-mark">
            <LogoMark />
          </span>
          <div>
            <b>CaseProof</b>
            <small>Golden-hour evidence intake</small>
          </div>
        </button>
        <div className="unit">
          <span className="bank-letter">CDR</span>
          <div>
            <b>{config.institution.name}</b>
            <small>Fraud Operations</small>
          </div>
        </div>
        <div className="nav-h">Investigate</div>
        {[
          ["queue", "Queue", LayoutGrid],
          ["cases", "Cases", Briefcase],
          ["deliveries", "Deliveries", FileText],
        ].map(([id, name, Icon]) => (
          <button
            key={id}
            className={"nav " + (route.includes(id) ? "on" : "")}
            onClick={() => {
              go("/staff/" + id);
              setMenu(false);
            }}
          >
            <Icon size={16} />
            {name}
          </button>
        ))}
        <div className="shift">
          <div className="row gap8">
            <ShieldCheck size={16} />
            <b>Synthetic staff demo</b>
          </div>
          <p className="muted">
            Evidence-backed decisions. A report acknowledgement is not a hold or
            refund.
          </p>
          <button className="btn sm" onClick={() => go("/victim/start")}>
            Victim portal <ArrowRight size={12} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <button
            className="icon-btn mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMenu((v) => !v)}
          >
            <Menu size={17} />
          </button>
          <div className="muted row gap8 grow">
            <ShieldCheck size={15} />
            <span>Fraud response workspace</span>
          </div>
          <span className="demo-chip">Synthetic data · sandbox</span>
          <div className="notification-wrap">
            <button
              className="icon-btn notification-bell"
              aria-label={`Notifications, ${alerts.filter((a) => !a.seen).length} unread`}
              aria-expanded={showAlerts}
              onClick={() => setShowAlerts((x) => !x)}
            >
              <Bell size={18} />
              {alerts.some((a) => !a.seen) && (
                <span className="notification-count">
                  {alerts.filter((a) => !a.seen).length}
                </span>
              )}
            </button>
            {showAlerts && (
              <div className="notification-panel">
                <div className="row">
                  <b>Workspace notifications</b>
                  <button
                    className="btn sm ghost right"
                    onClick={() =>
                      setAlerts((old) => old.map((a) => ({ ...a, seen: true })))
                    }
                  >
                    Mark read
                  </button>
                </div>
                {!alerts.length && (
                  <Empty>
                    No new changes since this workspace opened. The queue checks
                    every five seconds.
                  </Empty>
                )}
                {alerts.map((a) => (
                  <button
                    className="notification-item"
                    key={a.eventId}
                    onClick={() => {
                      go(`/staff/cases/${a.case_id}/overview`);
                      setShowAlerts(false);
                      setAlerts((old) =>
                        old.map((x) =>
                          x.eventId === a.eventId ? { ...x, seen: true } : x,
                        ),
                      );
                    }}
                  >
                    <b>
                      {a.type === "arrived"
                        ? "New complaint received"
                        : "Case status changed"}
                    </b>
                    <span className="mono">{a.case_id}</span>
                    <small>{label(a.status)}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          {auth.profile === "local" ? (
            <label className="persona-label">
              Demo identity
              <select
                aria-label="Staff persona"
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
              >
                <option value="analyst">Analyst demo</option>
                <option value="reviewer">Reviewer demo</option>
              </select>
            </label>
          ) : (
            <button
              className="btn sm"
              onClick={() => {
                auth.clear();
                location.reload();
              }}
            >
              Sign out
            </button>
          )}
          <span className="avatar">
            {auth.profile === "cloud"
              ? "ST"
              : persona === "reviewer"
                ? "RV"
                : "AN"}
          </span>
        </header>
        <main className="content" id="content">
          {alerts.some((a) => !a.seen && a.type === "arrived") && (
            <div className="arrival-notice" role="status">
              <Bell size={16} />
              <b>New complaint received</b>
              <span>The queue has updated.</span>
              <button
                className="btn sm right"
                onClick={() => {
                  go("/staff/queue");
                  setAlerts((old) => old.map((a) => ({ ...a, seen: true })));
                }}
              >
                Review queue
              </button>
            </div>
          )}
          {caseId ? (
            <Case key={caseId + persona} caseId={caseId} tab={tab} />
          ) : (
            <Queue
              key={persona}
              mode={parts[2]}
              activeResource={queue}
              scope={queueScope}
              setScope={setQueueScope}
            />
          )}
        </main>
      </div>
    </div>
  );
}
function Case({ caseId, tab }) {
  const { persona } = useSession();
  const resource = useResource(
    caseId + ":" + persona,
    (s) => loadCaseView(caseId, { persona, signal: s }),
    "case",
  );
  const view = resource.data;
  const countdown = useDisplayClock(view?.workflow.clock);
  const tabs = [
    ["overview", "Overview"],
    ["evidence", "Evidence"],
    ["trail", "Money Trail"],
    ["requests", "Requests"],
    ["review", "Review & decision"],
    ["delivery", "Delivery & follow-up"],
    ["audit", "Audit"],
  ];
  return (
    <>
      <ErrorBanner error={resource.error} onRetry={resource.reload} />
      {!view ? (
        resource.loading ? (
          <Loading />
        ) : (
          <Empty>
            Case unavailable.{" "}
            <button className="btn" onClick={() => go("/staff/queue")}>
              Return to queue
            </button>
          </Empty>
        )
      ) : (
        <>
          <div className="case-h">
            <span className="avatar lg">CP</span>
            <div className="col gap6 grow">
              <div className="mono muted">Cases / {caseId}</div>
              <div className="row gap8 wrap">
                <h1>Investigation brief</h1>
                <Status value={view.workflow.status} />
                <Badge tone="warn">
                  {remaining(countdown)} · response priority
                </Badge>
              </div>
              <div className="muted">
                {view.workflow.customer_account} ·{" "}
                {label(view.workflow.intake_channel)} · assessment r
                {view.identity.revision}
              </div>
            </div>
            <div className="stats">
              <div className="stat">
                <small>Confirmed disputed</small>
                <b className="num">{formatMinor(view.amounts.confirmed)}</b>
              </div>
              <div className="stat">
                <small>Additional candidate</small>
                <b className="num">{formatMinor(view.amounts.candidate)}</b>
              </div>
              <div className="stat">
                <small>Snapshot</small>
                <b className="mono">
                  r{view.identity.revision}{" "}
                  <small>{view.identity.digest?.slice(0, 8)}</small>
                </b>
              </div>
            </div>
          </div>
          <nav className="tabs">
            {tabs.map(([id, name]) => (
              <button
                key={id}
                className={"tab " + (tab === id ? "on" : "")}
                onClick={() => go(`/staff/cases/${caseId}/${id}`)}
              >
                {name}
                {id === "evidence" && (
                  <span className="n">{view.snapshot.artifacts?.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="case-body">
            <CasePages
              view={view}
              tab={tab}
              stale={!!resource.error}
              reload={resource.reload}
            />
          </div>
        </>
      )}
    </>
  );
}
