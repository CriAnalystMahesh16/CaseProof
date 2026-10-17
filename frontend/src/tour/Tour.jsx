import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import { go, useRoute } from "../router.js";
import { apiRequest } from "../api/client.js";
import { useSession, useResource } from "../state/resources.jsx";
import { CHAPTERS, EXAMPLE_NARRATIVE, STEPS } from "./steps.js";
import { caseFromRoute, tour, useTour } from "./store.js";
import { tourOutcome } from "../models/tourOutcome.js";
import "./tour.css";

const CARD_WIDTH = 360;
const GAP = 14;

// A card header or section heading highlights its whole card; anything else itself.
function spotlightFor(selector) {
  const anchor = selector && document.querySelector(selector);
  if (!anchor) return null;
  return anchor.classList.contains("card-h") || /^H[1-3]$/.test(anchor.tagName)
    ? anchor.closest(".card") || anchor
    : anchor;
}

function place(rect, measuredHeight) {
  const vw = window.innerWidth,
    vh = window.innerHeight;
  if (vw < 760) return { docked: true };
  if (!rect) return { centred: true };
  const width = Math.min(CARD_WIDTH, vw - 2 * GAP);
  const clampX = (x) => Math.min(Math.max(GAP, x), vw - width - GAP);
  const height = Math.min(measuredHeight, vh - 2 * GAP);
  const clampY = (y) => Math.min(Math.max(GAP, y), vh - height - GAP);
  if (rect.right + GAP + width < vw - GAP)
    return { left: rect.right + GAP, top: clampY(rect.top), width };
  if (rect.left - GAP - width > GAP)
    return { left: rect.left - GAP - width, top: clampY(rect.top), width };
  if (vh - rect.bottom > height + 2 * GAP)
    return { left: clampX(rect.left), top: rect.bottom + GAP, width };
  return {
    left: clampX(rect.left),
    top: clampY(rect.top - height - GAP),
    width,
  };
}

function insertExample() {
  const field = document.querySelector('textarea[aria-label="What happened?"]');
  if (!field) return false;
  // React tracks controlled inputs through the native setter plus an input event.
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  ).set;
  setter.call(field, EXAMPLE_NARRATIVE);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus({ preventScroll: true });
  return true;
}

export function TourButton({ className = "btn sm", label = "Tour" }) {
  return (
    <button className={className} onClick={() => tour.start(tour.get().index)}>
      <Compass size={13} /> {label}
    </button>
  );
}

export default function TourOverlay() {
  const state = useTour();
  return state.active ? <ActiveTour state={state} /> : <CaseTracker />;
}

function HandoffChecklist({ caseId, onComplete }) {
  const { persona } = useSession();
  const resource = useResource(
    "tour-outcome:" + caseId + ":" + persona,
    (signal) =>
      caseId
        ? apiRequest(`/v1/cases/${caseId}/workflow`, { persona, signal })
        : Promise.resolve(null),
    5000,
  );
  const w = resource.data;
  const { delivered, owned } = tourOutcome(w);
  useEffect(
    () => onComplete(delivered && owned),
    [delivered, owned, onComplete],
  );
  return (
    <div className="tour-action">
      <b>Actual case outcome</b>
      <p>
        {delivered
          ? "✓ Both receiver acknowledgements recorded"
          : "Pending: reviewer approval and both receiver acknowledgements"}
      </p>
      <p>
        {owned
          ? "✓ Follow-up owner and next action saved"
          : "Pending: owner, next action and awaiting-external follow-up"}
      </p>
      {resource.error && (
        <p>Could not refresh the outcome. Retry from the case workspace.</p>
      )}
      <button
        className="btn sm"
        onClick={() => go(`/staff/cases/${caseId}/delivery`)}
      >
        Open delivery &amp; follow-up
      </button>
    </div>
  );
}

// Remember the visitor's case even before the tour starts (e.g. resumed later).
function CaseTracker() {
  const route = useRoute();
  useEffect(() => {
    const found = caseFromRoute(route);
    if (found) tour.setCase(found);
  }, [route]);
  return null;
}

function ActiveTour({ state }) {
  const route = useRoute();
  const { persona } = useSession();
  const baseStep = STEPS[state.index];
  const step =
    baseStep.id === "practice"
      ? {
          ...baseStep,
          target:
            route === "/victim/start"
              ? '[data-tour="choose-your-demo-customer"]'
              : route === "/victim/home"
                ? '[data-tour="report-scam"]'
                : '[data-tour="report-payments"]',
          action:
            route === "/victim/start"
              ? "Start fresh if needed, select Samer or another customer, then Continue with selected customer."
              : route === "/victim/home"
                ? "Choose Report a payment scam."
                : "Select the recent large payment you want to report, then Continue. Payments are newest first.",
        }
      : baseStep;
  const [rect, setRect] = useState(null);
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState("");
  const scrolled = useRef(false);
  const titleRef = useRef(null);
  const cardRef = useRef(null);
  const [height, setHeight] = useState(480);
  const [minimised, setMinimised] = useState(false);
  const [waiting, setWaiting] = useState(!!step.advance);
  const [outcomeComplete, setOutcomeComplete] = useState(false);
  const last = state.index === STEPS.length - 1;

  useEffect(() => {
    const found = caseFromRoute(route);
    if (found) tour.setCase(found);
  }, [route]);

  // Enter a step: open its page, resolving the tour case when one is needed.
  useEffect(() => {
    let cancelled = false;
    scrolled.current = false;
    setMissing(false);
    setRect(null);
    setNotice("");
    titleRef.current?.focus({ preventScroll: true });
    if (!step.go) return;
    if (
      step.id === "practice" &&
      /^#\/victim\/(?:start|home|report)$/.test(location.hash)
    )
      return;
    (async () => {
      let ctx = tour.get();
      if (step.needsCase && !ctx.caseId) {
        try {
          const queue = await apiRequest("/v1/workspace?scope=active", {
            persona,
          });
          const first = queue.cases?.[0]?.case_id;
          if (first) tour.setCase(first);
        } catch {
          /* handled below */
        }
        ctx = tour.get();
        if (!ctx.caseId) {
          if (!cancelled)
            setNotice(
              "No case yet. Complete the victim chapter first so there is a complaint to investigate.",
            );
          return;
        }
      }
      const path = typeof step.go === "function" ? step.go(ctx) : step.go;
      if (!cancelled && location.hash.slice(1) !== path) go(path);
    })();
    return () => {
      cancelled = true;
    };
  }, [state.index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the target as pages load, scroll and resize; auto-advance on actions.
  useLayoutEffect(() => {
    const started = Date.now();
    const advance = step.advance;
    const happened = () =>
      !!advance &&
      ((advance.route && advance.route.test(location.hash.slice(1))) ||
        (advance.selector && !!document.querySelector(advance.selector)));
    // Only an action taken during this step advances it (Back must not bounce).
    const already = happened();
    setWaiting(!!step.advance && !already);
    const tick = () => {
      if (!already && happened()) {
        tour.next();
        return;
      }
      if (!step.target) return;
      const target =
        step.id === "practice"
          ? location.hash.includes("/victim/start")
            ? '[data-tour="choose-your-demo-customer"]'
            : location.hash.includes("/victim/home")
              ? '[data-tour="report-scam"]'
              : '[data-tour="report-payments"]'
          : step.target;
      const element = spotlightFor(target);
      if (!element) {
        setRect(null);
        setMissing(Date.now() - started > 2500);
        return;
      }
      setMissing(false);
      if (!scrolled.current) {
        scrolled.current = true;
        const still = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        element.scrollIntoView({
          // Phones dock the card at the bottom, so keep the target above it.
          block:
            window.innerWidth < 760 ||
            element.getBoundingClientRect().height > window.innerHeight * 0.6
              ? "start"
              : "center",
          behavior: still ? "auto" : "smooth",
        });
      }
      const box = element.getBoundingClientRect();
      setRect((old) =>
        old &&
        old.top === box.top &&
        old.left === box.left &&
        old.width === box.width &&
        old.height === box.height
          ? old
          : {
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
              right: box.right,
              bottom: box.bottom,
            },
      );
    };
    tick();
    const id = setInterval(tick, 300);
    window.addEventListener("resize", tick);
    window.addEventListener("scroll", tick, true);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", tick);
      window.removeEventListener("scroll", tick, true);
    };
  }, [state.index]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const measure = () =>
      setHeight(cardRef.current?.getBoundingClientRect().height || 480);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [minimised, state.index]);

  useEffect(() => {
    const key = (event) => {
      if (event.key === "Escape") tour.stop();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const position = place(rect, height);
  const chapterIds = [...new Set(STEPS.map((item) => item.chapter))];
  const chapterStart = (chapter) =>
    STEPS.findIndex((candidate) => candidate.chapter === chapter);

  if (minimised)
    return (
      <button
        className="btn primary tour-resume"
        onClick={() => setMinimised(false)}
      >
        Show guidance · {state.index + 1} / {STEPS.length}
      </button>
    );
  return (
    <>
      {rect && (
        <div
          className="tour-spotlight"
          aria-hidden="true"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      {!rect && <div className="tour-dim" aria-hidden="true" />}
      <section
        ref={cardRef}
        className={
          "tour-card" +
          (position.docked ? " docked" : "") +
          (position.centred ? " centred" : "")
        }
        style={
          position.docked || position.centred
            ? undefined
            : { top: position.top, left: position.left, width: position.width }
        }
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
      >
        <div className="tour-top">
          <span className="tour-chapter">{CHAPTERS[step.chapter]}</span>
          <span className="tour-count">
            {state.index + 1} / {STEPS.length}
          </span>
          <button
            className="icon-btn tour-close"
            aria-label="Minimise guidance"
            onClick={() => setMinimised(true)}
          >
            −
          </button>
          <button
            className="icon-btn tour-close"
            aria-label="Close tour"
            onClick={() => tour.stop()}
          >
            <X size={15} />
          </button>
        </div>
        <div className="tour-progress" aria-hidden="true">
          <i
            style={{ width: `${((state.index + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="tour-body">
          <h2 id="tour-title" tabIndex={-1} ref={titleRef} aria-live="polite">
            {step.title}
          </h2>
          {step.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
          {missing && step.optional && (
            <p className="tour-note">
              Not shown for this case yet. {step.absent}
            </p>
          )}
          {missing && !step.optional && (
            <p className="tour-note">
              This panel is not on the current screen yet. Finish the previous
              step (Back shows it), or wait a moment if the case is still
              processing.
            </p>
          )}
          {notice && <p className="tour-note">{notice}</p>}
          {step.example && (
            <div className="tour-example">
              <q>{EXAMPLE_NARRATIVE}</q>
              <button
                className="btn sm"
                onClick={() =>
                  setNotice(
                    insertExample()
                      ? "Example inserted. You can edit it before continuing."
                      : "Open the narrative step first, then insert the example.",
                  )
                }
              >
                Insert example
              </button>
            </div>
          )}
          {step.action && (
            <p className="tour-action">
              <b>Your turn:</b> {step.action}
            </p>
          )}
          {waiting && (
            <p className="muted">
              Complete this action in the page to continue automatically.
              Minimise guidance if it covers a control.
            </p>
          )}
          {last && (
            <HandoffChecklist
              caseId={state.caseId}
              onComplete={setOutcomeComplete}
            />
          )}
        </div>
        <div className="tour-footer">
          <label className="tour-jump">
            <span className="sr-only">Jump to chapter</span>
            <select
              aria-label="Jump to chapter"
              value={step.chapter}
              onChange={(event) => tour.goTo(chapterStart(event.target.value))}
            >
              {chapterIds.map((id) => (
                <option key={id} value={id}>
                  {CHAPTERS[id]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn sm"
            disabled={state.index === 0}
            onClick={() => tour.back()}
          >
            <ArrowLeft size={13} /> Back
          </button>
          {last ? (
            <button
              className="btn sm primary"
              disabled={!outcomeComplete}
              onClick={() => tour.reset()}
            >
              Finish
            </button>
          ) : (
            <button
              className="btn sm primary"
              disabled={waiting}
              onClick={() => tour.next()}
            >
              Next <ArrowRight size={13} />
            </button>
          )}
        </div>
      </section>
    </>
  );
}
