import type { GateResult } from "../core/verdicts";
export function architectureGate(): GateResult {
  return { gate: 2, verdict: "abstain", subReason: "no-baseline",
    evidence: { note: "no architecture reference supplied; surrounding code not consulted", structural: "unjudged" } };
}
