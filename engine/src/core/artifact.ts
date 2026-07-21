import type { GateResult, Tier, Verdict } from "./verdicts.js";
import type { FlowGraph, FlowOverlay } from "../judgment/runner.js";
import { t, type Lang } from "../report/i18n.js";
import { renderOutline } from "../report/flow.js";

export function assembleArtifact(input: {
  changesetId: string; mode: "spec" | "inference"; tier: Tier; gates: GateResult[]; lang: Lang;
  synthesis: { verdict: Verdict; humanMustVerify: string[] };
  doesNotEstablish: { sharedBlindSpot: string; downgradedGates: string; unguardedCriteria: string; regressionBasis: string };
}): string {
  const L = input.lang;
  const g = (n: number) => input.gates.find(x => x.gate === n)!;
  const ev = (n: number) => "```json\n" + JSON.stringify(g(n).evidence, null, 2) + "\n```";
  const sub = (n: number) => g(n).subReason ? ` (${g(n).subReason})` : "";
  const gate = (n: number) =>
    `## ${t(L, `gate${n}.name`)}\n- ${t(L, "label.verdict")}: ${g(n).verdict}${sub(n)}\n- ${t(L, "label.evidence")}:\n${ev(n)}`;

  // Gate 2 gets the flow outline when a graph is present; otherwise plain evidence.
  const g2 = g(2);
  const graph = g2.evidence.graph as FlowGraph | undefined;
  const gate2 = graph
    ? `## ${t(L, "gate2.name")}\n- ${t(L, "label.verdict")}: ${g2.verdict}${sub(2)}\n- ${t(L, "label.flow")}:\n`
      + renderOutline(graph, g2.evidence.overlay as FlowOverlay, L).split("\n").map(l => "  " + l).join("\n")
      + `\n- ${t(L, "flow.htmlPointer")}`
    : gate(2);

  return `# ${t(L, "title.review")}

## Header
- ${t(L, "header.changesetId")}: ${input.changesetId}
- ${t(L, "header.mode")}: ${input.mode}
- ${t(L, "header.tier")}: ${t(L, `tier.${input.tier}`)}

${gate(1)}

${gate2}

${gate(3)}

${gate(4)}

## ${t(L, "synthesis.name")}
- ${t(L, "label.verdict")}: ${input.synthesis.verdict}
- ${t(L, "synthesis.mustVerify")}
${input.synthesis.humanMustVerify.map(x => `  - ${x}`).join("\n")}

## ${t(L, "dne.name")}
- ${t(L, "dne.sharedBlindSpot")}: ${input.doesNotEstablish.sharedBlindSpot}
- ${t(L, "dne.downgraded")}: ${input.doesNotEstablish.downgradedGates}
- ${t(L, "dne.unguarded")}: ${input.doesNotEstablish.unguardedCriteria}
- ${t(L, "dne.regressionBasis")}: ${input.doesNotEstablish.regressionBasis}
`;
}
