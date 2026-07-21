import { describe, it, expect } from "vitest";
import { renderReport } from "../src/report/html";
import type { FlowGraph, FlowOverlay } from "../src/judgment/runner";

const md = "# Review Artifact\n## Gate 2 — Architecture Conformance\n- verdict: needs-human\n";
const graph: FlowGraph = {
  nodes: [{ id: "n1", label: "cap", kind: "branch", criterion: "caps at 50%", sourceLine: 3 }],
  edges: [],
};
const overlay: FlowOverlay = { n1: { status: "unguarded", tests: [] } };

describe("renderReport", () => {
  it("wraps markdown and stays self-contained (no http links)", () => {
    const html = renderReport(md, { lang: "en" });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).not.toMatch(/https?:\/\//);
  });
  it("embeds the diagram: dagre blob, svg container, node data, legend", () => {
    const html = renderReport(md, { lang: "en", graph, overlay });
    expect(html).toMatch(/DAGRE_UMD|dagre\.layout|graphlib/); // inlined library present
    expect(html).toContain('id="flow"');
    expect(html).toContain('data-node="n1"');
    expect(html).toContain('data-status="unguarded"');
    expect(html).toMatch(/Coverage/); // legend title (en)
  });
  it("renders the localized not-synthesized note when no graph", () => {
    expect(renderReport(md, { lang: "de" })).toMatch(/Ablauf nicht erzeugt/);
  });
  it("neutralizes script/attribute injection from model-controlled graph fields", () => {
    const evilId = 'n"1</script><script>bad()</script>';
    const evil: FlowGraph = {
      nodes: [{ id: evilId, label: "</script><img src=x onerror=bad()>", kind: "entry" }],
      edges: [],
    };
    const overlay: FlowOverlay = { [evilId]: { status: "unanalyzed", tests: [] } };
    const out = renderReport(md, { lang: "en", graph: evil, overlay });
    const afterData = out.split('id="flow-data">')[1];
    const dataBlock = afterData.slice(0, afterData.indexOf("</script>"));
    expect(dataBlock).not.toContain("</script");      // JSON block cannot break out
    expect(out).not.toContain('data-node="n"1');       // no attribute breakout server-side
    expect(out).not.toContain("</script><img");        // raw label markup never emitted
  });
});
