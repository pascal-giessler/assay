import { execa } from "execa";
import type { ChangesetContext } from "./changeset.js";
import type { GateResult, Tier, Verdict } from "./verdicts.js";
import { triage } from "../gates/triage.js";
import { intentGate } from "../gates/intent.js";
import { architectureGate } from "../gates/architecture.js";
import { faultInjectGate } from "../gates/faultInject.js";
import { regressionGate } from "../gates/regression.js";
import { assembleArtifact } from "./artifact.js";
import type { JudgmentRunner, FlowGraph, FlowOverlay } from "../judgment/runner.js";
import type { Mutator, TestRunner } from "../faultinject/interfaces.js";
import type { Sandbox } from "../sandbox/sandbox.js";
import type { Lang } from "../report/i18n.js";
const gitVerifyClean = async (workdir: string): Promise<boolean> => {
  const res = await execa("git", ["-C", workdir, "diff", "--exit-code"], { reject: false });
  return res.exitCode === 0;
};
export async function runReview(
  ctx: ChangesetContext,
  deps: {
    runner: JudgmentRunner; mutator: Mutator; testRunner: TestRunner; sandbox: Sandbox;
    verifyClean?: (workdir: string) => Promise<boolean>;
  },
  opts: { lang?: Lang } = {},
): Promise<{ tier: Tier; gates: GateResult[]; markdown: string; graph?: FlowGraph; overlay?: FlowOverlay }> {
  const lang = opts.lang ?? "en";
  const verifyClean = deps.verifyClean ?? gitVerifyClean;
  const { tier } = triage(ctx.diff);
  const baseline = await deps.testRunner.run(ctx.testCmd, ctx.workdir, deps.sandbox);
  const g1 = await intentGate(ctx, deps.runner, lang);
  const g3 = await faultInjectGate({
    criteria: g1.mutations.map(m => ({ criterion: m.criterion, mutation: { file: m.file, find: m.find, replace: m.replace } })),
    baselineOutcome: baseline, testCmd: ctx.testCmd, workdir: ctx.workdir, tier,
    mutator: deps.mutator, runner: deps.testRunner, sandbox: deps.sandbox,
  });
  if (!(await verifyClean(ctx.workdir))) {
    throw new Error("workdir not restored to a clean state after fault injection; refusing to emit review");
  }
  const g3table = (g3.evidence["guarding-test-table"] as { criterion: string; status: "guarded" | "unguarded"; failedTests: string[] }[]) ?? [];
  const g2 = architectureGate({ flow: g1.flow, guardingTable: g3table });
  const g4 = await regressionGate({ testCmd: ctx.testCmd, workdir: ctx.workdir, runner: deps.testRunner, sandbox: deps.sandbox });
  const gates = [g1.result, g2, g3, g4];
  const unguarded = (g3.evidence["unguarded-paths"] as string[]) ?? [];
  const synthesisVerdict: Verdict =
    gates.some(g => g.verdict === "needs-human") ? "needs-human"
    : gates.some(g => g.verdict === "fail") ? "fail" : "pass";
  const downgraded =
    g2.subReason === "no-flow" ? "Gate 2 abstained (flow not synthesized)"
    : g2.subReason === "no-baseline" ? "Gate 2: no architecture baseline (diagram is comprehension-only)"
    : "none";
  const markdown = assembleArtifact({
    changesetId: "discount@fixture", mode: ctx.mode, tier, gates, lang,
    synthesis: { verdict: synthesisVerdict,
      humanMustVerify: unguarded.length ? [`is leaving these untested acceptable? ${unguarded.join(", ")}`] : ["confirm intent"] },
    doesNotEstablish: {
      sharedBlindSpot: "inputs neither author nor reviewer considered (e.g. negative price/percent)",
      downgradedGates: downgraded,
      unguardedCriteria: unguarded.length ? unguarded.join(", ") : "none",
      regressionBasis: String(g4.evidence["selection-basis"]),
    },
  });
  return { tier, gates, markdown, graph: g2.evidence.graph as FlowGraph | undefined, overlay: g2.evidence.overlay as FlowOverlay | undefined };
}
