import { describe, it, expect } from "vitest";
import { renderDashboard } from "../src/report/dashboard";
import type { ReviewDocument } from "../src/core/reviewDocument";

const doc: ReviewDocument = {
  schemaVersion: 1, changesetId: "discount@fixture", mode: "spec", tier: "tier-2", lang: "en",
  overall: { verdict: "needs-human" },
  gates: [
    { gate: 1, verdict: "pass", evidence: { reconstruction: "reduces price, capped at 50%" } },
    { gate: 2, verdict: "needs-human", subReason: "no-baseline", evidence: {
      graph: { nodes: [{ id: "n1", label: "cap", kind: "branch", criterion: "caps at 50%" }], edges: [] },
      overlay: { n1: { status: "unguarded", tests: [] } } } },
    { gate: 3, verdict: "needs-human", evidence: { "guarding-test-table": [
      { criterion: "applies percentage", status: "guarded", failedTests: ["test_applies"] },
      { criterion: "caps at 50%", status: "unguarded", failedTests: [] } ] } },
    { gate: 4, verdict: "pass", evidence: { "selection-basis": "full suite" } },
  ],
  flow: { graph: { nodes: [{ id: "n1", label: "cap", kind: "branch", criterion: "caps at 50%" }], edges: [] }, overlay: { n1: { status: "unguarded", tests: [] } } },
  synthesis: { verdict: "needs-human", humanMustVerify: ["is leaving these untested acceptable? caps at 50%"] },
  doesNotEstablish: { sharedBlindSpot: "s", downgradedGates: "d", unguardedCriteria: "caps at 50%", regressionBasis: "full suite" },
};

describe("renderDashboard", () => {
  it("applies the DESIGN.md tokens and dark theme", () => {
    const html = renderDashboard(doc);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("--bg:#14130f");
    expect(html).toContain("--unguarded:#d16a5a");
    // Self-contained: no external *loadable* refs (dagre is inlined). A bare
    // /https?:/ check false-matches an inert comment URL inside the vendored
    // dagre blob, so assert absence of loaders specifically.
    expect(html).not.toMatch(/<script\s+src=|href=["']https?:|<link[\s>]|fetch\(|XMLHttpRequest/);
  });
  it("renders the four gates as an ordered rail and the overall verdict", () => {
    const html = renderDashboard(doc);
    const i1 = html.indexOf("Gate 1"), i2 = html.indexOf("Gate 2"), i3 = html.indexOf("Gate 3"), i4 = html.indexOf("Gate 4");
    expect(i1).toBeGreaterThan(-1);
    expect(i1 < i2 && i2 < i3 && i3 < i4).toBe(true);
    expect(html).toContain("v-needs-human"); // overall verdict token
  });
  it("marks the unguarded criterion in the Gate 3 hero table", () => {
    const html = renderDashboard(doc);
    expect(html).toMatch(/row-unguarded[\s\S]*caps at 50%/);
  });
  it("embeds the interactive diagram (dagre + flow data)", () => {
    const html = renderDashboard(doc);
    expect(html).toContain('id="flow-data"');
    expect(html).toMatch(/dagre|graphlib/);
    expect(html).toContain('data-node="n1"');
  });
  it("localizes chrome for a German document", () => {
    expect(renderDashboard({ ...doc, lang: "de" })).toMatch(/Architekturkonformität/);
  });
  it("neutralizes injection from model-controlled fields", () => {
    const evil: ReviewDocument = { ...doc, lang: "en",
      gates: doc.gates.map(g => g.gate === 1 ? { ...g, evidence: { reconstruction: "</script><img src=x>" } } : g),
      flow: { graph: { nodes: [{ id: 'n"1</script><script>bad()</script>', label: "</script>", kind: "entry" }], edges: [] }, overlay: {} } };
    const html = renderDashboard(evil);
    const after = html.split('id="flow-data">')[1];
    expect(after.slice(0, after.indexOf("</script>"))).not.toContain("</script");
    expect(html).not.toContain('data-node="n"1');
    expect(html).not.toContain("</script><img");
  });
});
