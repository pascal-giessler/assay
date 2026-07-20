import { execa } from "execa";
import type { ChangesetContext } from "./changeset";
import type { GateResult, Tier, Verdict } from "./verdicts";
import { triage } from "../gates/triage";
import { intentGate } from "../gates/intent";
import { architectureGate } from "../gates/architecture";
import { faultInjectGate } from "../gates/faultInject";
import { regressionGate } from "../gates/regression";
import { assembleArtifact } from "./artifact";
import type { JudgmentRunner } from "../judgment/runner";
import type { Mutator, TestRunner } from "../faultinject/interfaces";
import type { Sandbox } from "../sandbox/sandbox";
const gitVerifyClean = async (workdir: string): Promise<boolean> => {
  const res = await execa("git", ["-C", workdir, "diff", "--exit-code"], { reject: false });
  return res.exitCode === 0;
};
export async function runReview(
  ctx: ChangesetContext,
  deps: {
    runner: JudgmentRunner; mutator: Mutator; testRunner: TestRunner; sandbox: Sandbox;
    verifyClean?: (workdir: string) => Promise<boolean>;
  }
): Promise<{ tier: Tier; gates: GateResult[]; markdown: string }> {
  const verifyClean = deps.verifyClean ?? gitVerifyClean;
  const { tier } = triage(ctx.diff);
  const baseline = await deps.testRunner.run(ctx.testCmd, ctx.workdir, deps.sandbox);
  const g1 = await intentGate(ctx, deps.runner);
  const g2 = architectureGate();
  const g3 = await faultInjectGate({
    criteria: g1.mutations.map(m => ({ criterion: m.criterion, mutation: { file: m.file, find: m.find, replace: m.replace } })),
    baselineOutcome: baseline, testCmd: ctx.testCmd, workdir: ctx.workdir, tier,
    mutator: deps.mutator, runner: deps.testRunner, sandbox: deps.sandbox,
  });
  if (!(await verifyClean(ctx.workdir))) {
    throw new Error("workdir not restored to a clean state after fault injection; refusing to emit review");
  }
  const g4 = await regressionGate({ testCmd: ctx.testCmd, workdir: ctx.workdir, runner: deps.testRunner, sandbox: deps.sandbox });
  const gates = [g1.result, g2, g3, g4];
  const unguarded = (g3.evidence["unguarded-paths"] as string[]) ?? [];
  const synthesisVerdict: Verdict =
    gates.some(g => g.verdict === "needs-human") ? "needs-human"
    : gates.some(g => g.verdict === "fail") ? "fail" : "pass";
  const markdown = assembleArtifact({
    changesetId: "discount@fixture", mode: ctx.mode, tier, gates,
    synthesis: { verdict: synthesisVerdict,
      humanMustVerify: unguarded.length ? [`is leaving these untested acceptable? ${unguarded.join(", ")}`] : ["confirm intent"] },
    doesNotEstablish: {
      sharedBlindSpot: "inputs neither author nor reviewer considered (e.g. negative price/percent)",
      downgradedGates: g2.subReason === "no-baseline" ? "Gate 2 abstained (no-baseline)" : "none",
      unguardedCriteria: unguarded.length ? unguarded.join(", ") : "none",
      regressionBasis: String(g4.evidence["selection-basis"]),
    },
  });
  return { tier, gates, markdown };
}
