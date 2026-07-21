import { describe, it, expect } from "vitest";
import { buildOverlay, renderOutline } from "../src/report/flow";
import type { FlowGraph } from "../src/judgment/runner";

const flow: FlowGraph = {
  nodes: [
    { id: "n1", label: "apply_discount", kind: "entry" },
    { id: "n2", label: "percent <= 50 ?", kind: "branch", criterion: "applies percentage" },
    { id: "n3", label: "capped = 50", kind: "state", criterion: "caps at 50%" },
  ],
  edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }],
};
const guarding = [
  { criterion: "applies percentage", status: "guarded" as const, failedTests: ["test_applies"] },
  { criterion: "caps at 50%", status: "unguarded" as const, failedTests: [] },
];

describe("buildOverlay", () => {
  it("maps guarded/unguarded/unanalyzed with tests", () => {
    const o = buildOverlay(flow, guarding);
    expect(o.n1).toEqual({ status: "unanalyzed", tests: [] });
    expect(o.n2).toEqual({ status: "guarded", tests: ["test_applies"] });
    expect(o.n3).toEqual({ status: "unguarded", tests: [] });
  });
});

describe("renderOutline", () => {
  it("nests by edges and marks localized status", () => {
    const out = renderOutline(flow, buildOverlay(flow, guarding), "en");
    expect(out).toMatch(/- entry: apply_discount  \[unanalyzed\]/);
    expect(out).toMatch(/ {2}- branch: percent <= 50 \?  \[guarded\]/);
    expect(out).toMatch(/ {4}- state: capped = 50  \[unguarded\]/);
  });
  it("localizes markers in German", () => {
    expect(renderOutline(flow, buildOverlay(flow, guarding), "de")).toMatch(/\[ungesichert\]/);
  });
  it("terminates on a cyclic graph and lists every node once (flat fallback)", () => {
    const cyclic: FlowGraph = {
      nodes: [
        { id: "a", label: "loop head", kind: "branch" },
        { id: "b", label: "loop body", kind: "state" },
      ],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }],
    };
    const out = renderOutline(cyclic, buildOverlay(cyclic, []), "en");
    // No indegree-0 root exists -> nodes are reached via the flat fallback; the
    // seen-set must stop the a->b->a cycle so each node appears exactly once.
    expect(out.match(/loop head/g)).toHaveLength(1);
    expect(out.match(/loop body/g)).toHaveLength(1);
    expect(out).toMatch(/\[unanalyzed\]/);
  });
});
