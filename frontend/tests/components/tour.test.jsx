import React from "react";
import fs from "node:fs";
import path from "node:path";
import { it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
vi.mock("../../src/state/resources.jsx", async (original) => ({
  ...(await original()),
  useSession: () => ({ persona: "analyst" }),
}));
import TourOverlay from "../../src/tour/Tour.jsx";
import { STEPS, CHAPTERS } from "../../src/tour/steps.js";
import { tour, caseFromRoute } from "../../src/tour/store.js";

beforeEach(() => {
  sessionStorage.clear();
  tour.reset();
  location.hash = "#/entry";
});
afterEach(cleanup);

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory()
      ? sources(full)
      : /\.jsx?$/.test(entry.name)
        ? [fs.readFileSync(full, "utf8")]
        : [];
  });
}

it("every step is well formed and every anchor exists in the application", () => {
  const code = sources(path.resolve(__dirname, "../../src")).join("\n");
  const anchors = new Set(
    [...code.matchAll(/data-tour="([a-z0-9-]+)"/g)].map((m) => m[1]),
  );
  for (const m of code.matchAll(/<CardH[^>]*?\btitle="([^"]+)"/gs))
    anchors.add(
      m[1]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    );
  const ids = STEPS.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const step of STEPS) {
    expect(CHAPTERS[step.chapter], step.id).toBeTruthy();
    expect(step.title && step.body.length, step.id).toBeTruthy();
    if (step.target) {
      const name = step.target.match(/^\[data-tour="([a-z0-9-]+)"\]$/)?.[1];
      expect(name, step.id).toBeTruthy();
      expect(anchors.has(name), `${step.id}: ${name}`).toBe(true);
    }
    if (step.optional) expect(step.absent, step.id).toBeTruthy();
  }
});

it("covers every analyst tab and finishes on a summary", () => {
  for (const tab of [
    "overview",
    "evidence",
    "trail",
    "requests",
    "review",
    "delivery",
    "audit",
  ])
    expect(
      STEPS.some(
        (s) =>
          typeof s.go === "function" && s.go({ caseId: "C" }).endsWith(tab),
      ),
      tab,
    ).toBe(true);
  expect(STEPS.at(-1).id).toBe("finish");
});

it("opens at the golden-hour introduction and moves forward and back", () => {
  render(<TourOverlay />);
  act(() => tour.start(0));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByText("Welcome: the golden hour")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Next/ }));
  expect(screen.getByText("Generate your own scam")).toBeTruthy();
  expect(location.hash).toBe("#/victim/start");
  fireEvent.click(screen.getByRole("button", { name: /Back/ }));
  expect(screen.getByText("Welcome: the golden hour")).toBeTruthy();
});

it("closes with Escape and resumes from the same step", () => {
  render(<TourOverlay />);
  act(() => tour.start(3));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  act(() => tour.start(tour.get().index));
  expect(screen.getByText(STEPS[3].title)).toBeTruthy();
});

it("jumps straight to an analyst chapter", () => {
  render(<TourOverlay />);
  act(() => tour.start(0));
  fireEvent.change(screen.getByLabelText("Jump to chapter"), {
    target: { value: "trail" },
  });
  expect(screen.getByRole("heading", { name: "Money trail" })).toBeTruthy();
});

it("remembers the case filed during the tour", () => {
  expect(caseFromRoute("/victim/complaints/CASE-abc123")).toBe("CASE-abc123");
  expect(caseFromRoute("/staff/cases/CASE-x/trail")).toBe("CASE-x");
  expect(caseFromRoute("/staff/queue")).toBeNull();
});
