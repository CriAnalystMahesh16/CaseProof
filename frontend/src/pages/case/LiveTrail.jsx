import React, { useMemo, useState, useEffect, useRef } from "react";

import dagre from "@dagrejs/dagre";

import { Play, ZoomIn, ZoomOut, Maximize, ArrowRight } from "lucide-react";

import { Card, CardH, Badge, Empty, Metric } from "../../components/live.jsx";

import { formatMinor, time, label } from "../../models/caseView.js";

export function edgeCurve(points) {
  const a = points[0],
    b = points.at(-1),
    mx = (a.x + b.x) / 2;

  return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
}

export function trailTone(account, positions, observation) {
  if (account.kind === "customer") return "victim";

  if (account.kind === "cashout") return "cashout";

  return positions.some((p) => p.status === "unaccounted") || !observation
    ? "uncertain"
    : "observed";
}

export function makeTrailView(snapshot) {
  const trail = snapshot.trail || {},
    accounts = new Map((trail.accounts || []).map((a) => [a.id, a]));

  for (const t of trail.transfers || [])
    for (const id of [t.from_account, t.to_account])
      if (!accounts.has(id))
        accounts.set(id, {
          id,

          label: id,

          bank: "Bank not specified",

          kind: "external",
        });

  return {
    ...trail,

    accounts: [...accounts.values()],

    transfers: trail.transfers || [],

    positions: trail.positions || [],

    account_observations: trail.account_observations || [],

    summary: trail.summary || {},

    assessmentAsOf: snapshot.clock?.as_of,
  };
}

export function layoutTrail(trail) {
  const g = new dagre.graphlib.Graph({ multigraph: true });

  g.setGraph({
    rankdir: "LR",

    nodesep: 58,

    ranksep: 88,

    marginx: 32,

    marginy: 62,
  });

  g.setDefaultEdgeLabel(() => ({}));

  trail.accounts.forEach((a) => g.setNode(a.id, { width: 178, height: 82 }));

  trail.transfers.forEach((t) =>
    g.setEdge(
      t.from_account,

      t.to_account,

      { width: 78, height: 38 },

      t.txn_id,
    ),
  );

  dagre.layout(g);

  return {
    nodes: trail.accounts.map((a) => ({ ...a, ...g.node(a.id) })),

    edges: trail.transfers.map((t) => ({
      ...t,

      ...g.edge(t.from_account, t.to_account, t.txn_id),
    })),

    bounds: g.graph(),
  };
}

export default function MoneyTrail({ view }) {
  const trail = useMemo(() => makeTrailView(view.snapshot), [view.snapshot]);

  const graph = useMemo(() => layoutTrail(trail), [trail]);

  const canvas = useRef(null),
    [canvasWidth, setCanvasWidth] = useState(0);

  useEffect(() => {
    if (!canvas.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) =>
      setCanvasWidth(entries[0].contentRect.width),
    );
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [trail.transfers.length]);

  const [selected, setSelected] = useState(null),
    [zoom, setZoom] = useState(1),
    [cursor, setCursor] = useState(1),
    [playing, setPlaying] = useState(false),
    [follow, setFollow] = useState(null);

  useEffect(() => {
    if (!playing) return;

    const id = setInterval(
      () =>
        setCursor((x) => {
          if (x >= 1) {
            setPlaying(false);

            return 1;
          }

          return Math.min(1, x + 0.025);
        }),

      70,
    );

    return () => clearInterval(id);
  }, [playing]);

  const scale =
    Math.min(
      1,
      canvasWidth ? Math.max(0.35, (canvasWidth - 20) / graph.bounds.width) : 1,
    ) * zoom;

  const ordered = [...trail.transfers].sort((a, b) => a.ts.localeCompare(b.ts));

  const active = new Set(
    ordered.slice(0, Math.ceil(cursor * ordered.length)).map((t) => t.txn_id),
  );

  const debitIds = new Set(
    (view.snapshot.ledger_matches || []).map((m) => m.txn_id),
  );

  const debits = trail.transfers.filter((t) => debitIds.has(t.txn_id));

  const followed = follow
    ? new Set([
        follow,

        ...trail.positions

          .filter((p) => (p.path || []).includes(follow))

          .flatMap((p) => p.path || []),
      ])
    : null;

  const columns = [...new Set(graph.nodes.map((n) => n.x))].sort(
    (a, b) => a - b,
  );

  const account = trail.accounts.find((a) => a.id === selected),
    positions = trail.positions.filter((p) => p.account === selected),
    observation = trail.account_observations.find(
      (o) => o.account === selected,
    );

  return (
    <div className="trail-wrap live-trail">
      <Card className="graph-card">
        <CardH
          title="Money Trail"
          sub={`Graph · ${trail.accounts.length} accounts · ${trail.transfers.length} transfers · r${view.snapshot.revision}`}
        >
          <div className="row gap4">
            <button
              className="icon-btn"
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(0.35, z - 0.15))}
            >
              <ZoomOut size={15} />
            </button>

            <button
              className="icon-btn"
              aria-label="Fit graph"
              onClick={() => setZoom(1)}
            >
              <Maximize size={15} />
            </button>

            <button
              className="icon-btn"
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}
            >
              <ZoomIn size={15} />
            </button>
          </div>
        </CardH>

        <div className="trail-controls">
          <div className="legend" data-tour="trail-legend">
            <span>
              <i style={{ borderColor: "#3c9a67" }} />
              Sourced transfer
            </span>

            <span>
              <i style={{ borderColor: "#d48a45", borderTopStyle: "dashed" }} />
              Availability uncertain
            </span>
          </div>

          <div className="row gap6 wrap">
            <small className="muted">Follow</small>

            {debits.map((d, i) => (
              <button
                key={d.txn_id}
                className={"btn sm " + (follow === d.txn_id ? "dark" : "")}
                onClick={() =>
                  setFollow((old) => (old === d.txn_id ? null : d.txn_id))
                }
              >
                Debit {i + 1} · {formatMinor(d.amount_minor)}
              </button>
            ))}
          </div>
        </div>

        {!trail.transfers.length ? (
          <Empty>
            No sourced trail yet. A missing observation is not zero balance.
          </Empty>
        ) : (
          <div
            className="graph-viewport"
            ref={canvas}
            tabIndex={0}
            aria-label="Scrollable money trail"
          >
            <div
              className="graph-scale"
              style={{
                width: graph.bounds.width * scale,

                height: graph.bounds.height * scale,
              }}
            >
              <div
                className="live-graph"
                style={{
                  width: graph.bounds.width,

                  height: graph.bounds.height,

                  transform: `scale(${scale})`,
                }}
              >
                {columns.map((x, i) => (
                  <React.Fragment key={x}>
                    <span className="colhead" style={{ left: x - 89, top: 12 }}>
                      {i === 0 ? "Origin · customer" : `Hop ${i}`}
                    </span>

                    {i > 0 && (
                      <span className="colline" style={{ left: x - 119 }} />
                    )}
                  </React.Fragment>
                ))}

                <svg width={graph.bounds.width} height={graph.bounds.height}>
                  <defs>
                    <marker
                      id="trail-arrow"
                      markerWidth="8"
                      markerHeight="8"
                      refX="7"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L0,6 L7,3 z" fill="#3c9a67" />
                    </marker>
                  </defs>

                  {graph.edges.map((e) => {
                    const pts = e.points;

                    return (
                      <g
                        key={e.txn_id}
                        opacity={
                          active.has(e.txn_id) &&
                          (!followed || followed.has(e.txn_id))
                            ? 1
                            : 0.15
                        }
                      >
                        <path
                          d={edgeCurve(pts)}
                          fill="none"
                          stroke="#3c9a67"
                          strokeWidth="1.8"
                          markerEnd="url(#trail-arrow)"
                        />
                      </g>
                    );
                  })}
                </svg>

                {graph.edges.map((e) => (
                  <span
                    key={e.txn_id}
                    className={
                      "elabel " +
                      (e.source === "ledger" ? "verified" : "reported")
                    }
                    style={{
                      left: e.x,

                      top: e.y,

                      opacity:
                        active.has(e.txn_id) &&
                        (!followed || followed.has(e.txn_id))
                          ? 1
                          : 0.2,
                    }}
                  >
                    {debitIds.has(e.txn_id) && <small>Disputed debit</small>}

                    {formatMinor(e.amount_minor)}

                    <small>{time(e.ts).split(", ").at(-1)}</small>
                  </span>
                ))}

                {graph.nodes.map((n) => {
                  const ps = trail.positions.filter((p) => p.account === n.id);

                  const ob = trail.account_observations.find(
                    (o) => o.account === n.id,
                  );

                  const tone = trailTone(n, ps, ob);

                  const attributed = trail.summary?.attributed;

                  return (
                    <button
                      key={n.id}
                      className={
                        "trail-node node " +
                        tone +
                        " " +
                        (selected === n.id ? "selected sel" : "")
                      }
                      style={{ left: n.x - 89, top: n.y - 41 }}
                      onClick={() => setSelected(n.id)}
                    >
                      <div className="row gap8">
                        <span className="bank-letter bk">
                          {n.bank?.slice(0, 3).toUpperCase()}
                        </span>

                        <div className="grow">
                          <b>
                            {n.kind === "customer"
                              ? "Customer"
                              : n.label && n.label !== n.id
                                ? n.label
                                : `${n.bank?.replace(" Demo Bank", "")} · ${n.id.slice(-4)}`}
                          </b>

                          <small>
                            {n.bank} · {n.kind}
                          </small>
                        </div>
                      </div>

                      <div className="foot">
                        {ps.length
                          ? formatMinor(
                              ps.reduce((a, p) => a + p.amount_minor, 0),
                            )
                          : n.kind === "customer"
                            ? "Complaint origin"
                            : "No attributed position"}

                        <span
                          className={
                            "badge mono " +
                            (tone === "uncertain"
                              ? "warn"
                              : tone === "victim"
                                ? "crit"
                                : "ok")
                          }
                        >
                          {tone === "uncertain"
                            ? "Uncertain"
                            : tone === "victim"
                              ? "Customer"
                              : tone === "cashout"
                                ? "Withdrawn"
                                : "Observed"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="trail-asof mono muted">
          Assessment as of {time(trail.assessmentAsOf)} · balances require their
          own bank observation
        </div>

        <div className="transfer-sequence">
          <div className="row gap8 wrap">
            <span className="eyebrow">Transfer sequence</span>

            <button
              className="btn sm ghost"
              onClick={() => {
                setCursor(0);

                setPlaying(true);
              }}
            >
              <Play size={12} />
              Replay
            </button>

            <span className="right mono muted">
              {Math.ceil(cursor * ordered.length)} / {ordered.length} transfers
            </span>
          </div>

          <input
            aria-label="Transfer sequence"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={cursor}
            onChange={(e) => {
              setPlaying(false);

              setCursor(+e.target.value);
            }}
          />

          <p className="muted">
            Animation of transfers in this assessment. Balances and inspector
            remain at the assessment time; this is not historical knowledge
            replay.
          </p>
        </div>

        <details className="transfer-table">
          <summary>Transfer table · {trail.transfers.length} records</summary>

          <div className="table-scroll">
            <table className="t">
              <thead>
                <tr>
                  <th>From → to</th>

                  <th>Amount</th>

                  <th>Time</th>

                  <th>Source / reference</th>
                </tr>
              </thead>

              <tbody>
                {ordered.map((t) => (
                  <tr key={t.txn_id}>
                    <td>
                      {t.from_account}
                      <br />→ {t.to_account}
                    </td>

                    <td>{formatMinor(t.amount_minor)}</td>

                    <td>{time(t.ts)}</td>

                    <td>
                      {t.source}

                      <br />

                      {t.reference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <div className="col gap12">
        <Card className="card-b" data-tour="trail-positions">
          <div className="eyebrow">Attributed positions · assessment time</div>

          <div className="position-total">
            {formatMinor(trail.summary.recoverable)}
          </div>

          <p className="muted">
            Potentially available at a bank-reported observation. Not a
            confirmed hold or recovery.
          </p>

          <div className="mini-stats">
            <Metric
              title="Unaccounted"
              value={formatMinor(trail.summary.unaccounted)}
            />

            <Metric
              title="Left system"
              value={formatMinor(trail.summary.left_system)}
            />
          </div>
        </Card>

        <Card className="card-b" data-tour="trail-inspector">
          <div className="eyebrow">Account inspector</div>

          {account ? (
            <>
              <h2>{account.label || account.id}</h2>

              <p className="muted">
                {account.bank} · {account.id}
              </p>

              <div className="insp-row">
                <span>Attributed to complaint</span>

                <b>
                  {formatMinor(
                    positions.reduce((a, p) => a + p.amount_minor, 0),
                  )}
                </b>
              </div>

              <div className="insp-row">
                <span>Whole account observation</span>

                <b>{formatMinor(observation?.balance_minor)}</b>
              </div>

              <p className="mono muted">{time(observation?.reported_at)}</p>

              {positions.map((p, i) => (
                <div className="statement" key={i}>
                  <Badge tone={p.status === "recoverable" ? "ok" : "warn"}>
                    {label(p.status)}
                  </Badge>

                  <p>
                    {p.status === "left_system"
                      ? "Funds left the observed bank path; this is not available bank balance."
                      : p.availability_note}
                  </p>

                  <small className="hash-text">{p.sources?.join(" · ")}</small>
                </div>
              ))}
            </>
          ) : (
            <Empty>
              Select an account to inspect its sources and observation.
            </Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
