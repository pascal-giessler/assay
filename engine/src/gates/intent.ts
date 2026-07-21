import type { ChangesetContext } from "../core/changeset.js";
import type { GateResult } from "../core/verdicts.js";
import type { JudgmentRunner, IntentResult, FlowGraph } from "../judgment/runner.js";
import type { Lang } from "../report/i18n.js";

const PROMPT = "You are an INDEPENDENT reviewer. From evidence bundle ONLY (you did not write this code and have no authoring context), reconstruct what change does, then compare requirement. Return JSON {reconstruction, criterionTable:[{criterion,status:'met'|'not met'|'not addressed'}], mutations:[{criterion,file,find,replace}], flow:{nodes:[{id,label,kind:'entry'|'branch'|'state'|'exit',sourceLine?,criterion?}],edges:[{from,to,label?}]}} where each mutation is a single, uniquely-matching source edit that would break that criterion, and flow models the control flow of the change with each node.criterion set to the criterion string it implements when applicable.";

function langInstruction(lang: Lang): string {
  return lang === "de"
    ? " Respond with all human-readable text fields (reconstruction, criterion descriptions, node labels) in German; keep JSON keys and enum values in English."
    : "";
}
export async function intentGate(ctx: ChangesetContext, runner: JudgmentRunner, lang: Lang = "en"):
  Promise<{ result: GateResult; mutations: IntentResult["mutations"]; flow?: FlowGraph }> {
  const r = await runner.intent({
    bundle: { diff: ctx.diff, requirement: ctx.requirement, testResults: "" },
    prompt: PROMPT + langInstruction(lang),
  });
  if (ctx.mode === "inference") {
    return { result: { gate: 1, verdict: "needs-human",
      evidence: { "inferred-intent": r.reconstruction, note: "inference mode — no pass; human must confirm intent" } },
      mutations: r.mutations, flow: r.flow };
  }
  const allMet = r.criterionTable.length > 0 && r.criterionTable.every(c => c.status === "met");
  return { result: { gate: 1, verdict: allMet ? "pass" : "needs-human",
    evidence: { reconstruction: r.reconstruction, "criterion-table": r.criterionTable } },
    mutations: r.mutations, flow: r.flow };
}
