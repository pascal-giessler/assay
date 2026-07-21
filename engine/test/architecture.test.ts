import { describe, it, expect } from "vitest";
import { architectureGate } from "../src/gates/architecture";
import type { FlowGraph } from "../src/judgment/runner";

const flow: FlowGraph = {
  nodes: [{ id: "n1", label: "cap", kind: "branch", criterion: "caps at 50%" }],
  edges: [],
};

describe("architectureGate", () => {
  it("abstains with no-flow when no graph is supplied", () => {
    const g = architectureGate({ guardingTable: [] });
    expect(g.verdict).toBe("abstain");
    expect(g.subReason).toBe("no-flow");
  });
  it("needs-human with graph + overlay when a flow is supplied", () => {
    const g = architectureGate({ flow, guardingTable: [{ criterion: "caps at 50%", status: "unguarded", failedTests: [] }] });
    expect(g.verdict).toBe("needs-human");
    expect(g.subReason).toBe("no-baseline");
    expect((g.evidence.overlay as Record<string, { status: string }>).n1.status).toBe("unguarded");
    expect((g.evidence.graph as FlowGraph).nodes).toHaveLength(1);
  });
});
