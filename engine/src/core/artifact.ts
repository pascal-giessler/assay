import type { GateResult, Tier, Verdict } from "./verdicts.js";
const tierLabel = (t: Tier) => ({ "tier-0": "Tier 0 Mechanical", "tier-1": "Tier 1 Standard", "tier-2": "Tier 2 Critical" }[t]);
export function assembleArtifact(input: {
  changesetId: string; mode: "spec" | "inference"; tier: Tier; gates: GateResult[];
  synthesis: { verdict: Verdict; humanMustVerify: string[] };
  doesNotEstablish: { sharedBlindSpot: string; downgradedGates: string; unguardedCriteria: string; regressionBasis: string };
}): string {
  const g = (n: number) => input.gates.find(x => x.gate === n)!;
  const ev = (n: number) => "```json\n" + JSON.stringify(g(n).evidence, null, 2) + "\n```";
  const sub = (n: number) => g(n).subReason ? ` (${g(n).subReason})` : "";
  return `# Review Artifact

## Header
- Changeset id: ${input.changesetId}
- Requirement mode: ${input.mode}
- Risk tier: ${tierLabel(input.tier)}

## Gate 1 — Intent Match
- verdict: ${g(1).verdict}
- evidence:
${ev(1)}

## Gate 2 — Architecture Conformance
- verdict: ${g(2).verdict}${sub(2)}
- evidence:
${ev(2)}

## Gate 3 — Test Adequacy
- verdict: ${g(3).verdict}
- evidence:
${ev(3)}

## Gate 4 — Regression
- verdict: ${g(4).verdict}
- evidence:
${ev(4)}

## Synthesis
- verdict: ${input.synthesis.verdict}
- The human must personally verify:
${input.synthesis.humanMustVerify.map(x => `  - ${x}`).join("\n")}

## What this review does NOT establish
- Shared-blind-spot residue: ${input.doesNotEstablish.sharedBlindSpot}
- Downgraded/abstained gates: ${input.doesNotEstablish.downgradedGates}
- Unguarded criteria: ${input.doesNotEstablish.unguardedCriteria}
- Regression selection basis: ${input.doesNotEstablish.regressionBasis}
`;
}
