import { describe, it, expect } from "vitest";
import { runReview } from "../src/core/driver";
import { StubJudgmentRunner } from "../src/judgment/runner";
import { StubSandbox } from "../src/sandbox/sandbox";
import type { Mutator, TestRunner, TestOutcome } from "../src/faultinject/interfaces";
import type { ChangesetContext } from "../src/core/changeset";
const ctx: ChangesetContext = {
  diff: "diff --git a/discount.py b/discount.py\n@@\n+capped = percent if percent <= 50 else 50\n+return round(price * (1 - capped / 100), 2)",
  requirement: "apply the given percentage discount, capped at 50%",
  testCmd: "python -m pytest -q", workdir: "/w", mode: "spec",
};
const runner = new StubJudgmentRunner({
  reconstruction: "reduces price by pct, capped at 50%",
  criterionTable: [{ criterion: "applies percentage", status: "met" }, { criterion: "caps at 50%", status: "met" }],
  mutations: [
    { criterion: "applies percentage", file: "discount.py", find: "capped / 100", replace: "capped / 50" },
    { criterion: "caps at 50%", file: "discount.py", find: " if percent <= 50 else 50", replace: "" },
  ],
});
const mutator: Mutator = { async apply(m) { cur = m.find; return async () => {}; } };
let cur = "";
const testRunner: TestRunner = {
  async run(): Promise<TestOutcome> {
    // percentage mutation -> red; cap removal -> green; baseline -> green
    if (cur === "capped / 100") return { passed: false, failedTests: ["test_applies"], raw: "" };
    if (cur === " if percent <= 50 else 50") return { passed: true, failedTests: [], raw: "2 passed" };
    return { passed: true, failedTests: [], raw: "2 passed" };
  },
};
describe("runReview", () => {
  it("produces Tier 2 with the expected gate verdicts", async () => {
    const { tier, gates } = await runReview(ctx, { runner, mutator, testRunner,
      sandbox: new StubSandbox(() => ({ stdout: "2 passed", stderr: "", exitCode: 0 })),
      verifyClean: async () => true });
    expect(tier).toBe("tier-2");
    expect(gates.find(g => g.gate === 1)!.verdict).toBe("pass");
    expect(gates.find(g => g.gate === 2)!.verdict).toBe("abstain");
    expect(gates.find(g => g.gate === 3)!.verdict).toBe("needs-human");
    expect(gates.find(g => g.gate === 4)!.verdict).toBe("pass");
  });

  it("refuses to emit a result when the workdir is not restored to a clean state", async () => {
    await expect(runReview(ctx, { runner, mutator, testRunner,
      sandbox: new StubSandbox(() => ({ stdout: "2 passed", stderr: "", exitCode: 0 })),
      verifyClean: async () => false }))
      .rejects.toThrow(/workdir not restored to a clean state/);
  });

  it("returns Gate 2 graph/overlay and overlays g3 guarding, honoring lang", async () => {
    const runner = new StubJudgmentRunner({
      reconstruction: "r", criterionTable: [{ criterion: "caps at 50%", status: "met" }],
      mutations: [{ criterion: "caps at 50%", file: "d.py", find: "x", replace: "" }],
      flow: { nodes: [{ id: "n1", label: "cap", kind: "branch", criterion: "caps at 50%" }], edges: [] },
    });
    const ctx = { diff: "d", requirement: "r", testCmd: "t", workdir: "/w", mode: "spec" as const };
    const mutator = { async apply() { return async () => {}; } };
    const testRunner = { async run() { return { passed: true, failedTests: [], raw: "2 passed" }; } };
    const res = await runReview(ctx, { runner, mutator, testRunner,
      sandbox: new StubSandbox(() => ({ stdout: "2 passed", stderr: "", exitCode: 0 })),
      verifyClean: async () => true }, { lang: "de" });
    expect(res.overlay?.n1.status).toBe("unguarded"); // mutation left suite green
    expect(res.markdown).toMatch(/Architekturkonformität/);
  });
});
