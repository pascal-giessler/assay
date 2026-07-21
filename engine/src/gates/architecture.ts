import type { GateResult } from "../core/verdicts.js";
import type { FlowGraph } from "../judgment/runner.js";
import { buildOverlay } from "../report/flow.js";

export function architectureGate(input: {
  flow?: FlowGraph;
  guardingTable: { criterion: string; status: "guarded" | "unguarded"; failedTests: string[] }[];
}): GateResult {
  if (!input.flow || input.flow.nodes.length === 0) {
    return { gate: 2, verdict: "abstain", subReason: "no-flow",
      evidence: { note: "flow not synthesized; architecture unjudged", structural: "unjudged" } };
  }
  const overlay = buildOverlay(input.flow, input.guardingTable);
  return { gate: 2, verdict: "needs-human", subReason: "no-baseline",
    evidence: {
      note: "no architecture baseline supplied — diagram is a comprehension aid, not a conformance judgment",
      graph: input.flow, overlay,
    } };
}
