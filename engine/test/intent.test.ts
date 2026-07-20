import { describe, it, expect } from "vitest";
import { intentGate } from "../src/gates/intent";
import { StubJudgmentRunner } from "../src/judgment/runner";
import type { ChangesetContext } from "../src/core/changeset";
const base: ChangesetContext = { diff: "d", requirement: "apply pct, cap 50", testCmd: "pytest", workdir: "/w", mode: "spec" };
describe("intentGate", () => {
  it("spec mode: pass when all criteria met, and surfaces mutations", async () => {
    const runner = new StubJudgmentRunner({
      reconstruction: "reduces price by pct, max 50%",
      criterionTable: [{ criterion: "applies percentage", status: "met" }, { criterion: "caps at 50%", status: "met" }],
      mutations: [{ criterion: "caps at 50%", file: "d.py", find: "else 50", replace: "" }],
    });
    const { result, mutations } = await intentGate(base, runner);
    expect(result.gate).toBe(1);
    expect(result.verdict).toBe("pass");
    expect((result.evidence["criterion-table"] as any[]).length).toBe(2);
    expect(mutations[0].criterion).toBe("caps at 50%");
  });
  it("inference mode: verdict is always needs-human", async () => {
    const runner = new StubJudgmentRunner({ reconstruction: "guesses", criterionTable: [], mutations: [] });
    const { result } = await intentGate({ ...base, requirement: null, mode: "inference" }, runner);
    expect(result.verdict).toBe("needs-human");
    expect(result.evidence["inferred-intent"]).toBeDefined();
  });
});
