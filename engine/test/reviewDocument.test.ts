import { describe, it, expect } from "vitest";
import { assembleReviewDocument } from "../src/core/reviewDocument";
import type { GateResult } from "../src/core/verdicts";

const gates: GateResult[] = [
  { gate: 1, verdict: "pass", evidence: { reconstruction: "r" } },
  { gate: 2, verdict: "needs-human", subReason: "no-baseline", evidence: { graph: { nodes: [{ id: "n1", label: "x", kind: "entry" }], edges: [] }, overlay: { n1: { status: "unanalyzed", tests: [] } } } },
  { gate: 3, verdict: "needs-human", evidence: { "guarding-test-table": [] } },
  { gate: 4, verdict: "pass", evidence: { "selection-basis": "full suite" } },
];

describe("assembleReviewDocument", () => {
  it("serializes a presentation-free document with flow from Gate 2", () => {
    const doc = assembleReviewDocument({
      changesetId: "c", mode: "spec", tier: "tier-2", lang: "de", gates,
      flow: { graph: gates[1].evidence.graph as any, overlay: gates[1].evidence.overlay as any },
      synthesis: { verdict: "needs-human", humanMustVerify: ["x"] },
      doesNotEstablish: { sharedBlindSpot: "s", downgradedGates: "d", unguardedCriteria: "u", regressionBasis: "b" },
    });
    expect(doc.schemaVersion).toBe(1);
    expect(doc.tier).toBe("tier-2");
    expect(doc.lang).toBe("de");
    expect(doc.overall.verdict).toBe("needs-human");
    expect(doc.gates).toHaveLength(4);
    expect(doc.flow?.graph.nodes[0].id).toBe("n1");
  });
  it("sets flow to null when none is supplied (no-flow)", () => {
    const doc = assembleReviewDocument({
      changesetId: "c", mode: "spec", tier: "tier-0", lang: "en", gates,
      flow: null,
      synthesis: { verdict: "pass", humanMustVerify: [] },
      doesNotEstablish: { sharedBlindSpot: "s", downgradedGates: "d", unguardedCriteria: "u", regressionBasis: "b" },
    });
    expect(doc.flow).toBeNull();
  });
});
