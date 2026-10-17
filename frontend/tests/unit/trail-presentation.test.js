import { it, expect } from "vitest";
import { edgeCurve, trailTone } from "../../src/pages/case/LiveTrail.jsx";
it("uses reference curved connectors without changing transfer values", () => {
  expect(
    edgeCurve([
      { x: 10, y: 20 },
      { x: 60, y: 90 },
    ]),
  ).toBe("M10,20 C35,20 35,90 60,90");
});
it("keeps sourced transfer and uncertain availability separate", () => {
  expect(
    trailTone({ kind: "beneficiary" }, [{ status: "unaccounted" }], null),
  ).toBe("uncertain");
  expect(trailTone({ kind: "customer" }, [], null)).toBe("victim");
  expect(
    trailTone({ kind: "beneficiary" }, [{ status: "recoverable" }], {
      balance_minor: 10,
    }),
  ).toBe("observed");
});
