import { describe, it, expect } from "vitest";
import { runReview } from "../src/core/driver";
import { StubJudgmentRunner } from "../src/judgment/runner";
import { StubSandbox } from "../src/sandbox/sandbox";
import type { Mutator, TestRunner } from "../src/faultinject/interfaces";
import type { ChangesetContext } from "../src/core/changeset";
// Deterministic golden: judgment stubbed, mechanical gates real logic over stubbed sandbox outcomes.
describe("golden discount review (deterministic)", () => {
  it("reproduces the validated artifact's tiers, gates, and verdicts", async () => {
    const ctx: ChangesetContext = {
      diff: "diff --git a/discount.py b/discount.py\n@@\n+capped = percent if percent <= 50 else 50",
      requirement: "apply the given percentage discount, capped at 50%",
      testCmd: "python -m pytest -q", workdir: "/w", mode: "spec",
    };
    const runner = new StubJudgmentRunner({
      reconstruction: "reduces price by a percentage, never more than 50%",
      criterionTable: [{ criterion: "applies percentage", status: "met" }, { criterion: "caps at 50%", status: "met" }],
      mutations: [
        { criterion: "applies percentage", file: "discount.py", find: "capped / 100", replace: "capped / 50" },
        { criterion: "caps at 50%", file: "discount.py", find: " if percent <= 50 else 50", replace: "" },
      ],
      flow: {
        nodes: [
          { id: "n1", label: "apply_discount", kind: "entry" },
          { id: "n2", label: "percent <= 50 ?", kind: "branch", criterion: "applies percentage" },
          { id: "n3", label: "capped = 50", kind: "state", criterion: "caps at 50%" },
        ],
        edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }],
      },
    });
    let cur = "";
    const mutator: Mutator = { async apply(m) { cur = m.find; return async () => {}; } };
    const testRunner: TestRunner = { async run() {
      if (cur === "capped / 100") return { passed: false, failedTests: ["test_applies_percentage"], raw: "" };
      return { passed: true, failedTests: [], raw: "2 passed" };
    } };
    const { markdown } = await runReview(ctx, { runner, mutator, testRunner,
      sandbox: new StubSandbox(() => ({ stdout: "2 passed", stderr: "", exitCode: 0 })),
      verifyClean: async () => true });
    expect(markdown).toMatch(/Risk tier.*Tier 2/i);
    expect(markdown).toMatch(/Gate 1[\s\S]*verdict.*pass/i);
    expect(markdown).toMatch(/Gate 2[\s\S]*needs-human[\s\S]*no-baseline/i);
    expect(markdown).toMatch(/flow:[\s\S]*capped = 50  \[unguarded\]/i);
    expect(markdown).toMatch(/Gate 3[\s\S]*needs-human/i);
    expect(markdown).toMatch(/unguarded-paths[\s\S]*caps at 50%/i);
    expect(markdown).toMatch(/Gate 4[\s\S]*verdict.*pass/i);
    expect(markdown).toMatch(/What this review does NOT establish/i);
    expect(markdown).toMatch(/shared-blind-spot/i);

    const de = await runReview(ctx, { runner, mutator, testRunner,
      sandbox: new StubSandbox(() => ({ stdout: "2 passed", stderr: "", exitCode: 0 })),
      verifyClean: async () => true }, { lang: "de" });
    expect(de.markdown).toMatch(/Architekturkonformität/);
    expect(de.markdown).toMatch(/\[ungesichert\]/);
    expect(de.overlay?.n3.status).toBe("unguarded");
    expect(de.markdown).toMatch(/Ist es akzeptabel, diese ungetestet zu lassen\?/);
    expect(de.markdown).toMatch(/Eingaben, die weder Autor noch Prüfer/);
  });
});
