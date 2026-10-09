import { expect, test } from "vitest";
import { howItWorksSteps } from "../lib/how-it-works";

test("three steps with the fees from the public settings", () => {
  const steps = howItWorksSteps({ costume_fee_lamports: 2_000_000, launch_fee_lamports: 30_000_000 });
  expect(steps.map((s) => s.title)).toEqual(["Upload your mascot", "Pick a costume", "Launch on pump.fun"]);
  expect(steps[1].body).toContain("at 0.002 SOL each");
  expect(steps[2].body).toContain("0.03 SOL");
  expect(steps[2].body).toContain("creator fees are yours");
});

test("fee clauses are dropped until the settings load", () => {
  const steps = howItWorksSteps(null);
  expect(steps[1].body).toContain("in seconds, and a failed one");
  expect(steps[2].body).toContain("creator fees are yours.");
  expect(steps.map((s) => s.body).join(" ")).not.toMatch(/SOL|…/);
});
