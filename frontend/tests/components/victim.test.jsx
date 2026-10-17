import React from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
const mock = vi.hoisted(() => ({ data: null }));
vi.mock("../../src/state/resources.jsx", async (original) => ({
  ...(await original()),
  useResource: () => ({ data: mock.data, reload: vi.fn() }),
  useSession: () => ({ config: null }),
}));
import Victim from "../../src/pages/victim/Victim.jsx";
const customer = { account: "SYNTH-C1", display_name: "Asha Rao (synthetic)" };
afterEach(cleanup);
it("shows the API customer display name in the selection card", () => {
  mock.data = { customers: [customer] };
  render(<Victim route="/victim/start" />);
  expect(screen.getByRole("button", { name: /Asha Rao/ })).toBeTruthy();
});
it("greets the scoped customer using the API display name", () => {
  mock.data = { customer, complaints: [], transactions: [] };
  render(<Victim route="/victim/home" />);
  expect(
    screen.getByRole("heading", { name: "Hello, Asha Rao (synthetic)." }),
  ).toBeTruthy();
});
