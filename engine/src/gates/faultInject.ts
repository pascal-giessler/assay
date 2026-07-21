import type { Mutation, Mutator, TestRunner, TestOutcome } from "../faultinject/interfaces.js";
import type { Sandbox } from "../sandbox/sandbox.js";
import type { GateResult, Tier } from "../core/verdicts.js";
export type CriterionMutation = { criterion: string; mutation: Mutation };
export async function faultInjectGate(input: {
  criteria: CriterionMutation[]; baselineOutcome: TestOutcome;
  testCmd: string; workdir: string; tier: Tier;
  mutator: Mutator; runner: TestRunner; sandbox: Sandbox;
}): Promise<GateResult> {
  if (!input.baselineOutcome.passed) {
    return {
      gate: 3, verdict: "needs-human",
      evidence: {
        "guarding-test-table": [], "unguarded-paths": [],
        baseline: "not green — test adequacy indeterminate", tier: input.tier,
      },
    };
  }
  const table: { criterion: string; status: "guarded" | "unguarded"; failedTests: string[] }[] = [];
  for (const c of input.criteria) {
    const restore = await input.mutator.apply(c.mutation, input.workdir);
    let outcome: TestOutcome;
    try { outcome = await input.runner.run(input.testCmd, input.workdir, input.sandbox); }
    finally { await restore(); }
    // red (a test failed vs. green baseline) = the criterion is guarded
    const guarded = !outcome.passed;
    table.push({ criterion: c.criterion, status: guarded ? "guarded" : "unguarded", failedTests: outcome.failedTests });
  }
  const unguarded = table.filter(t => t.status === "unguarded").map(t => t.criterion);
  const verdict = unguarded.length > 0 ? "needs-human" : "pass";
  return {
    gate: 3, verdict,
    evidence: { "guarding-test-table": table, "unguarded-paths": unguarded, tier: input.tier },
  };
}
