import type { ChangesetContext } from "../core/changeset";
import type { GateResult } from "../core/verdicts";
import type { JudgmentRunner, IntentResult } from "../judgment/runner";
const PROMPT = "You are an INDEPENDENT reviewer. From the evidence bundle ONLY (you did not write this code and have no authoring context), reconstruct what the change does, then compare to the requirement. Return JSON {reconstruction, criterionTable:[{criterion,status:'met'|'not met'|'not addressed'}], mutations:[{criterion,file,find,replace}]} where each mutation is a single, uniquely-matching source edit that would break that criterion.";
export async function intentGate(ctx: ChangesetContext, runner: JudgmentRunner):
  Promise<{ result: GateResult; mutations: IntentResult["mutations"] }> {
  const r = await runner.intent({
    bundle: { diff: ctx.diff, requirement: ctx.requirement, testResults: "" },
    prompt: PROMPT,
  });
  if (ctx.mode === "inference") {
    return { result: { gate: 1, verdict: "needs-human",
      evidence: { "inferred-intent": r.reconstruction, note: "inference mode — no pass; human must confirm intent" } },
      mutations: r.mutations };
  }
  const allMet = r.criterionTable.length > 0 && r.criterionTable.every(c => c.status === "met");
  return { result: { gate: 1, verdict: allMet ? "pass" : "needs-human",
    evidence: { reconstruction: r.reconstruction, "criterion-table": r.criterionTable } },
    mutations: r.mutations };
}
