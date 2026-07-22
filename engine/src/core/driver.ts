import { execa } from "execa";
import type { ChangesetContext } from "./changeset.js";
import type { GateResult, Tier, Verdict } from "./verdicts.js";
import { triage } from "../gates/triage.js";
import { intentGate } from "../gates/intent.js";
import { architectureGate } from "../gates/architecture.js";
import { faultInjectGate } from "../gates/faultInject.js";
import { regressionGate } from "../gates/regression.js";
import { assembleArtifact } from "./artifact.js";
import { assembleReviewDocument, type ReviewDocument } from "./reviewDocument.js";
import type { JudgmentRunner, FlowGraph, FlowOverlay } from "../judgment/runner.js";
import type { Mutator, TestRunner } from "../faultinject/interfaces.js";
import type { Sandbox } from "../sandbox/sandbox.js";
import type { Lang } from "../report/i18n.js";
import { t } from "../report/i18n.js";
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
): Promise<{ tier: Tier; gates: GateResult[]; markdown: string; document: ReviewDocument }> {
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
    g2.subReason === "no-flow" ? t(lang, "dne.gate2NoFlow")
    : g2.subReason === "no-baseline" ? t(lang, "dne.gate2NoBaseline")
    : t(lang, "common.none");
  const synthesis = { verdict: synthesisVerdict,
    humanMustVerify: unguarded.length ? [`${t(lang, "synth.leaveUntested")} ${unguarded.join(", ")}`] : [t(lang, "synth.confirmIntent")] };
  const doesNotEstablish = {
    sharedBlindSpot: t(lang, "dne.sharedBlindSpotText"),
    downgradedGates: downgraded,
    unguardedCriteria: unguarded.length ? unguarded.join(", ") : t(lang, "common.none"),
    regressionBasis: String(g4.evidence["selection-basis"]) === "full suite" ? t(lang, "regression.fullSuite") : String(g4.evidence["selection-basis"]),
  };
  const markdown = assembleArtifact({ changesetId: "discount@fixture", mode: ctx.mode, tier, gates, lang, synthesis, doesNotEstablish });
  const flow = g2.evidence.graph
    ? { graph: g2.evidence.graph as FlowGraph, overlay: g2.evidence.overlay as FlowOverlay }
    : null;
  const document = assembleReviewDocument({ changesetId: "discount@fixture", mode: ctx.mode, tier, lang, gates, flow, synthesis, doesNotEstablish });
  return { tier, gates, markdown, document };
}
