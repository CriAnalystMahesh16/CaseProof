import { it, expect } from "vitest";
import { initialPriorityAlerts } from "../../src/models/queue.js";

it("surfaces server priority when switching from victim without inventing arrival", () => {
  const rows = [
    {
      case_id: "A",
      status: "ready_for_review",
      clock: { golden_hour_remaining: 25 },
    },
    {
      case_id: "B",
      status: "needs_attention",
      clock: { golden_hour_remaining: 0 },
    },
    { case_id: "C", status: "completed", clock: { golden_hour_remaining: 25 } },
    {
      case_id: "D",
      status: "processing",
      clock: { golden_hour_remaining: null },
    },
  ];
  expect(initialPriorityAlerts(rows).map((x) => [x.case_id, x.type])).toEqual([
    ["A", "priority"],
  ]);
});
