# JSON Review Document + Branded Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a presentation-free JSON `ReviewDocument` from the engine, and render it as a branded single-review page (per `DESIGN.md`) served by `assay serve --report review.json`; remove the engine's HTML path.

**Architecture:** A new `ReviewDocument` type + `assembleReviewDocument()` serialize the driver's result. `runReview` returns it. The CLI's `--format` becomes `json|md`. `assay serve` detects a `.json` report and renders it through a new branded `src/report/dashboard.ts` (which absorbs the interactive dagre diagram + escaping from the deleted `html.ts`).

**Tech Stack:** TypeScript, Node ≥ 20, ESM (`.js` import suffixes), vitest, vendored `@dagrejs/dagre` (already present), `node:http`.

## Global Constraints

- Node ≥ 20; ESM; every relative import specifier ends in `.js`.
- The served page is self-contained per request: inlined CSS/JS, vendored dagre; `node:http` only, no framework; no `http(s)://` in output.
- Design tokens/layout come from `docs/brand/DESIGN.md` verbatim (values copied below). No ad-hoc palette. Honor its bans: no gradient-clipped text, no identical card grids, no side-stripe accents, no em dashes in copy.
- `--format` accepts exactly `json` or `md` (default `md`); any other value exits with `--format must be "json" or "md"`.
- Model-controlled fields (labels, criteria, reconstruction, test names, node ids) are escaped at every HTML/JS sink (attribute-safe escape covering `& < > " '`; JSON `<script>` block escapes `<` as `<`).
- Unit tests hermetic (no Docker/API key). Run from `engine/`. Test: `npx vitest run`. Build: `npm run build`.

**DESIGN.md tokens (copy verbatim into the dashboard `<style>`):**
```
--bg #14130f  --surface #1c1b16  --surface-2 #24221b  --line #3a3730
--ink #efece3  --ink-dim #a8a496  --ink-faint #6f6c60  --gold #c8a24a
--pass #5fb87a  --fail #d16a5a  --human #e0a63c  --abstain #7d8794  --unguarded #d16a5a
```

---

## File Structure

- `src/core/reviewDocument.ts` — **create**: `ReviewDocument` type + `assembleReviewDocument()`.
- `src/report/dashboard.ts` — **create**: `renderDashboard(doc)` branded page (dagre diagram + escaping live here).
- `src/core/driver.ts` — **modify**: build + return `document`; drop `graph`/`overlay` returns.
- `src/cli/index.ts` — **modify**: `--format json|md` (validated), `serve` JSON detection → dashboard, remove `renderReport`/html wiring.
- `src/report/html.ts` — **delete** (logic moved to dashboard.ts).
- `src/report/i18n.ts` — **modify**: add dashboard UI chrome keys.
- Tests: create `test/reviewDocument.test.ts`, `test/dashboard.test.ts`; modify `test/driver.test.ts`, `test/golden.e2e.test.ts`, `test/cli.test.ts`; delete `test/html.test.ts` (its injection test migrates to `dashboard.test.ts`).
- Docs: `engine/README.md`, `engine/GETTING_STARTED.md`.

---

### Task 1: ReviewDocument type + assembleReviewDocument

**Files:**
- Create: `src/core/reviewDocument.ts`
- Test: `test/reviewDocument.test.ts`

**Interfaces:**
- Produces: `ReviewDocument`; `assembleReviewDocument(input): ReviewDocument`.

- [ ] **Step 1: Write the failing test** (`test/reviewDocument.test.ts`)

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/reviewDocument.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/core/reviewDocument.ts`**

```ts
import type { GateResult, Tier, Verdict } from "./verdicts.js";
import type { FlowGraph, FlowOverlay } from "../judgment/runner.js";
import type { Lang } from "../report/i18n.js";

export type ReviewDocument = {
  schemaVersion: 1;
  changesetId: string;
  mode: "spec" | "inference";
  tier: Tier;
  lang: Lang;
  overall: { verdict: Verdict };
  gates: GateResult[];
  flow: { graph: FlowGraph; overlay: FlowOverlay } | null;
  synthesis: { verdict: Verdict; humanMustVerify: string[] };
  doesNotEstablish: {
    sharedBlindSpot: string; downgradedGates: string;
    unguardedCriteria: string; regressionBasis: string;
  };
};

export function assembleReviewDocument(input: {
  changesetId: string; mode: "spec" | "inference"; tier: Tier; lang: Lang;
  gates: GateResult[];
  flow: { graph: FlowGraph; overlay: FlowOverlay } | null;
  synthesis: { verdict: Verdict; humanMustVerify: string[] };
  doesNotEstablish: ReviewDocument["doesNotEstablish"];
}): ReviewDocument {
  return {
    schemaVersion: 1,
    changesetId: input.changesetId,
    mode: input.mode,
    tier: input.tier,
    lang: input.lang,
    overall: { verdict: input.synthesis.verdict },
    gates: input.gates,
    flow: input.flow,
    synthesis: input.synthesis,
    doesNotEstablish: input.doesNotEstablish,
  };
}
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run test/reviewDocument.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/reviewDocument.ts test/reviewDocument.test.ts
git commit -m "feat(engine): ReviewDocument schema + assembler"
```

---

### Task 2: Branded dashboard renderer

**Files:**
- Create: `src/report/dashboard.ts`
- Modify: `src/report/i18n.ts` (add UI chrome keys)
- Test: `test/dashboard.test.ts`

**Interfaces:**
- Consumes: `ReviewDocument` (Task 1); `t`, `Lang`, i18n keys (existing + new); `DAGRE_UMD`.
- Produces: `renderDashboard(doc: ReviewDocument): string`.

- [ ] **Step 1: Add UI chrome keys to `src/report/i18n.ts`** — add to BOTH `en` and `de` (parity test enforces equality):

en:
```
  "ui.overall": "Overall",
  "ui.humanDecision": "Human decision",
  "ui.criterion": "Criterion",
  "ui.coverage": "Coverage",
  "ui.reconstruction": "Reconstruction",
```
de:
```
  "ui.overall": "Gesamturteil",
  "ui.humanDecision": "Menschliche Entscheidung",
  "ui.criterion": "Kriterium",
  "ui.coverage": "Abdeckung",
  "ui.reconstruction": "Rekonstruktion",
```

- [ ] **Step 2: Write the failing test** (`test/dashboard.test.ts`)

```ts
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
    expect(html).not.toMatch(/https?:\/\//);
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/dashboard.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Create `src/report/dashboard.ts`**

```ts
import { DAGRE_UMD } from "./vendor/dagre.inline.js";
import { t, type Lang } from "./i18n.js";
import type { ReviewDocument } from "../core/reviewDocument.js";
import type { GateResult } from "../core/verdicts.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const verdictToken = (v: string) => `<span class="v v-${esc(v)}">${esc(v)}</span>`;

type GuardRow = { criterion: string; status: "guarded" | "unguarded"; failedTests: string[] };

function gate3Hero(g3: GateResult, lang: Lang): string {
  const rows = (g3.evidence["guarding-test-table"] as GuardRow[] | undefined) ?? [];
  const body = rows.map(r =>
    `<tr class="${r.status === "unguarded" ? "row-unguarded" : "row-guarded"}">` +
    `<td>${esc(r.criterion)}</td>` +
    `<td class="mono">${esc(t(lang, `status.${r.status}`))}</td>` +
    `<td class="mono dim">${r.failedTests.length ? r.failedTests.map(esc).join(", ") : esc(t(lang, "panel.noTest"))}</td></tr>`).join("");
  return `<table class="hero"><thead><tr>` +
    `<th>${esc(t(lang, "ui.criterion"))}</th><th>${esc(t(lang, "ui.coverage"))}</th><th>${esc(t(lang, "panel.guardedBy"))}</th>` +
    `</tr></thead><tbody>${body}</tbody></table>`;
}

function flowBlock(doc: ReviewDocument, lang: Lang): string {
  if (!doc.flow || !doc.flow.graph.nodes.length) return `<p class="dim">${esc(t(lang, "flow.notSynthesized"))}</p>`;
  const data = JSON.stringify({
    graph: doc.flow.graph, overlay: doc.flow.overlay,
    i18n: { sourceLine: t(lang, "panel.sourceLine"), status: t(lang, "panel.status"),
      guardedBy: t(lang, "panel.guardedBy"), noTest: t(lang, "panel.noTest"),
      guarded: t(lang, "status.guarded"), unguarded: t(lang, "status.unguarded"), unanalyzed: t(lang, "status.unanalyzed") },
  }).replace(/</g, "\\u003c");
  const legend = (["guarded", "unguarded", "unanalyzed"] as const)
    .map(s => `<span class="chip c-${s}">${esc(t(lang, `status.${s}`))}</span>`).join("");
  const stacked = doc.flow.graph.nodes.map((n, i) => {
    const st = doc.flow!.overlay[n.id]?.status ?? "unanalyzed";
    return `<g class="node" tabindex="0" data-node="${esc(n.id)}" data-status="${esc(st)}" transform="translate(10,${i * 56 + 8})">` +
      `<rect rx="8" width="200" height="40" class="n-${esc(st)}"/><text x="100" y="24" text-anchor="middle">${esc(n.label)}</text></g>`;
  }).join("");
  const h = doc.flow.graph.nodes.length * 56 + 16;
  return `<div class="legend">${legend}</div>` +
    `<div id="flow"><svg viewBox="0 0 220 ${h}" width="220" height="${h}" role="img">${stacked}</svg></div>` +
    `<aside id="flow-panel" hidden></aside>` +
    `<script type="application/json" id="flow-data">${data}</script>` +
    `<script>${DAGRE_UMD}</script><script>${CLIENT}</script>`;
}

function gateEvidence(g: GateResult, doc: ReviewDocument, lang: Lang): string {
  if (g.gate === 2) return flowBlock(doc, lang);
  if (g.gate === 3) return gate3Hero(g, lang);
  if (g.gate === 1) {
    const rec = g.evidence.reconstruction ?? g.evidence["inferred-intent"];
    return rec ? `<p class="rec"><span class="dim">${esc(t(lang, "ui.reconstruction"))}:</span> ${esc(rec)}</p>` : "";
  }
  return `<p class="mono dim">${esc(t(lang, "dne.regressionBasis"))}: ${esc(g.evidence["selection-basis"])}</p>`;
}

function rail(doc: ReviewDocument, lang: Lang): string {
  return doc.gates.slice().sort((a, b) => a.gate - b.gate).map(g => {
    const sub = g.subReason ? ` <span class="dim mono">(${esc(g.subReason)})</span>` : "";
    return `<section class="step step-g${g.gate}${g.gate === 3 ? " anchor" : ""}">` +
      `<div class="step-n">${g.gate}</div>` +
      `<div class="step-body"><h2>${esc(t(lang, `gate${g.gate}.name`))} ${verdictToken(g.verdict)}${sub}</h2>` +
      `${gateEvidence(g, doc, lang)}</div></section>`;
  }).join("");
}

const CLIENT = `(function(){
  var el=document.getElementById('flow-data'); if(!el) return;
  var d=JSON.parse(el.textContent), G=window.dagre;
  if(!d.graph.nodes.length||!G) return;
  var g=new G.graphlib.Graph().setGraph({rankdir:'TB',nodesep:36,ranksep:44,marginx:12,marginy:12}).setDefaultEdgeLabel(function(){return{};});
  d.graph.nodes.forEach(function(n){g.setNode(n.id,{w:Math.max(120,n.label.length*7+28),h:40,n:n});});
  d.graph.edges.forEach(function(e){g.setEdge(e.from,e.to);});
  g.nodes().forEach(function(id){var x=g.node(id);x.width=x.w;x.height=x.h;});
  G.layout(g);
  var W=g.graph().width||200,H=g.graph().height||120,svg='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" role="img">';
  g.edges().forEach(function(ed){var pts=g.edge(ed).points;svg+='<polyline class="edge" points="'+pts.map(function(p){return p.x+','+p.y;}).join(' ')+'"/>';});
  g.nodes().forEach(function(id){var n=g.node(id),s=(d.overlay[id]||{}).status||'unanalyzed';
    svg+='<g class="node" tabindex="0" data-node="'+esc(id)+'" data-status="'+esc(s)+'" transform="translate('+(n.x-n.w/2)+','+(n.y-n.h/2)+')">'
      +'<rect rx="8" width="'+n.w+'" height="'+n.h+'" class="n-'+esc(s)+'"/>'
      +'<text x="'+(n.w/2)+'" y="'+(n.h/2+4)+'" text-anchor="middle">'+esc(n.n.label)+'</text></g>';});
  svg+='</svg>';
  document.getElementById('flow').innerHTML=svg;
  var panel=document.getElementById('flow-panel');
  function show(id){var n=byId(id),o=d.overlay[id]||{status:'unanalyzed',tests:[]},L=d.i18n;
    var lines=['<strong>'+esc(n.label)+'</strong>'];
    if(n.sourceLine)lines.push(L.sourceLine+': '+n.sourceLine);
    lines.push(L.status+': '+esc(L[o.status]||o.status));
    lines.push(L.guardedBy+': '+((o.tests&&o.tests.length)?o.tests.map(esc).join(', '):L.noTest));
    panel.innerHTML=lines.join('<br>');panel.hidden=false;}
  function byId(id){return d.graph.nodes.filter(function(n){return n.id===id;})[0];}
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  Array.prototype.forEach.call(document.querySelectorAll('.node'),function(g){
    g.addEventListener('click',function(){show(g.getAttribute('data-node'));});
    g.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();show(g.getAttribute('data-node'));}});
  });
})();`;

const STYLE = `
:root{--bg:#14130f;--surface:#1c1b16;--surface-2:#24221b;--line:#3a3730;--ink:#efece3;--ink-dim:#a8a496;--ink-faint:#6f6c60;--gold:#c8a24a;--pass:#5fb87a;--fail:#d16a5a;--human:#e0a63c;--abstain:#7d8794;--unguarded:#d16a5a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 ui-sans-serif,Inter,"Segoe UI",system-ui,sans-serif}
.assay{max-width:60rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}
.mono{font-family:ui-monospace,"JetBrains Mono",monospace}
.dim{color:var(--ink-dim)}
.band{display:flex;flex-wrap:wrap;gap:1rem 1.5rem;align-items:baseline;padding:1rem 1.25rem;background:var(--surface);border:1px solid var(--line);border-radius:.6rem;margin-bottom:2rem}
.band .tier{font-family:ui-monospace,monospace;letter-spacing:.06em;color:var(--gold)}
.band .decision{flex-basis:100%;color:var(--ink-dim);font-size:.95rem}
.v{font-family:ui-monospace,monospace;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;padding:.12rem .5rem;border-radius:.3rem;border:1px solid var(--line)}
.v-pass{color:var(--pass)}.v-fail{color:var(--fail)}.v-needs-human{color:var(--human)}.v-abstain{color:var(--abstain)}
.rail{display:flex;flex-direction:column;gap:1.25rem;border-left:1px solid var(--line);margin-left:1rem;padding-left:1.75rem}
.step{position:relative}
.step-n{position:absolute;left:-2.6rem;top:0;width:1.6rem;height:1.6rem;border-radius:50%;background:var(--surface-2);border:1px solid var(--line);color:var(--ink-dim);font-family:ui-monospace,monospace;font-size:.85rem;display:flex;align-items:center;justify-content:center}
.step h2{font-size:1.05rem;font-weight:600;margin:.1rem 0 .6rem;display:flex;align-items:center;gap:.6rem}
.step.anchor .step-body{background:var(--surface);border:1px solid var(--line);border-radius:.5rem;padding:1rem 1.1rem}
.rec{color:var(--ink-dim);max-width:70ch}
table.hero{width:100%;border-collapse:collapse;font-size:.95rem}
table.hero th{text-align:left;color:var(--ink-faint);font-weight:500;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;padding:.3rem .5rem;border-bottom:1px solid var(--line)}
table.hero td{padding:.5rem .5rem;border-bottom:1px solid var(--line)}
tr.row-unguarded td{color:var(--unguarded)}
tr.row-unguarded td:first-child{font-weight:600}
.legend{margin:.2rem 0 .6rem}
.chip{font-family:ui-monospace,monospace;font-size:.72rem;padding:.05rem .4rem;border-radius:.3rem;margin-right:.4rem;border:1px solid var(--line)}
.c-guarded{color:var(--pass)}.c-unguarded{color:var(--unguarded)}.c-unanalyzed{color:var(--abstain)}
#flow{overflow-x:auto}#flow svg{max-width:100%;height:auto}
#flow .edge{fill:none;stroke:var(--line);stroke-width:1.5}
#flow text{font:12px ui-sans-serif,system-ui,sans-serif;fill:var(--ink);pointer-events:none}
#flow .node{cursor:pointer}#flow rect{stroke:var(--line)}
#flow .node:focus rect{stroke:var(--gold);stroke-width:2}
#flow .n-guarded{fill:#20301f;stroke:var(--pass)}#flow .n-unguarded{fill:#31201d;stroke:var(--unguarded)}#flow .n-unanalyzed{fill:var(--surface-2)}
#flow-panel{margin-top:.6rem;padding:.6rem .8rem;background:var(--surface);border:1px solid var(--line);border-radius:.4rem;font-size:.9rem}
.dne{margin-top:2.5rem;padding:1.1rem 1.25rem;background:var(--surface);border:1px solid var(--gold);border-radius:.5rem}
.dne h2{margin:.1rem 0 .7rem;font-size:1rem;color:var(--gold)}
.dne dl{display:grid;grid-template-columns:auto 1fr;gap:.35rem 1rem;margin:0;font-size:.92rem}
.dne dt{color:var(--ink-faint)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

export function renderDashboard(doc: ReviewDocument): string {
  const lang = doc.lang;
  const decision = doc.synthesis.humanMustVerify.map(esc).join("; ");
  const dne = doc.doesNotEstablish;
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Assay — ${esc(t(lang, "title.review"))}</title><style>${STYLE}</style></head><body>` +
    `<main class="assay">` +
    `<div class="band"><span class="tier">${esc(t(lang, `tier.${doc.tier}`))}</span>` +
    `<span>${esc(t(lang, "ui.overall"))} ${verdictToken(doc.overall.verdict)}</span>` +
    `<span class="decision">${esc(t(lang, "ui.humanDecision"))}: ${decision}</span></div>` +
    `<div class="rail">${rail(doc, lang)}</div>` +
    `<section class="dne"><h2>${esc(t(lang, "dne.name"))}</h2><dl>` +
    `<dt>${esc(t(lang, "dne.sharedBlindSpot"))}</dt><dd>${esc(dne.sharedBlindSpot)}</dd>` +
    `<dt>${esc(t(lang, "dne.downgraded"))}</dt><dd>${esc(dne.downgradedGates)}</dd>` +
    `<dt>${esc(t(lang, "dne.unguarded"))}</dt><dd>${esc(dne.unguardedCriteria)}</dd>` +
    `<dt>${esc(t(lang, "dne.regressionBasis"))}</dt><dd>${esc(dne.regressionBasis)}</dd>` +
    `</dl></section></main></body></html>`;
}
```

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run test/dashboard.test.ts test/i18n.test.ts && npm run build`
Expected: PASS (dashboard + i18n parity green); build clean (`html.ts` still present, untouched).

- [ ] **Step 6: Commit**

```bash
git add src/report/dashboard.ts src/report/i18n.ts test/dashboard.test.ts
git commit -m "feat(engine): branded single-review dashboard renderer"
```

---

### Task 3: Driver returns the ReviewDocument

**Files:**
- Modify: `src/core/driver.ts`
- Test: `test/driver.test.ts`, `test/golden.e2e.test.ts`

**Interfaces:**
- Consumes: `assembleReviewDocument` (Task 1).
- Produces: `runReview(...)` returns `{ tier: Tier; gates: GateResult[]; markdown: string; document: ReviewDocument }` (drops `graph`/`overlay`).

- [ ] **Step 1: Edit `src/core/driver.ts`**

Add import: `import { assembleReviewDocument, type ReviewDocument } from "./reviewDocument.js";`

Replace the tail of `runReview` (from the `const markdown = assembleArtifact({...})` block through the `return`) with a version that computes the shared `synthesis`/`doesNotEstablish` once and builds both outputs:

```ts
  const synthesis = { verdict: synthesisVerdict,
    humanMustVerify: unguarded.length ? [`${t(lang, "synth.leaveUntested")} ${unguarded.join(", ")}`] : [t(lang, "synth.confirmIntent")] };
  const doesNotEstablish = {
    sharedBlindSpot: t(lang, "dne.sharedBlindSpotText"),
    downgradedGates: downgraded,
    unguardedCriteria: unguarded.length ? unguarded.join(", ") : t(lang, "common.none"),
    regressionBasis: String(g4.evidence["selection-basis"]) === "full suite" ? t(lang, "regression.fullSuite") : String(g4.evidence["selection-basis"]),
  };
  const markdown = assembleArtifact({ changesetId: "discount@fixture", mode: ctx.mode, tier, gates, lang, synthesis, doesNotEstablish });
  const flow = g2.evidence.graph
    ? { graph: g2.evidence.graph as FlowGraph, overlay: g2.evidence.overlay as FlowOverlay }
    : null;
  const document = assembleReviewDocument({ changesetId: "discount@fixture", mode: ctx.mode, tier, lang, gates, flow, synthesis, doesNotEstablish });
  return { tier, gates, markdown, document };
```

Update the function's declared return type to `Promise<{ tier: Tier; gates: GateResult[]; markdown: string; document: ReviewDocument }>`. Keep the existing `FlowGraph`/`FlowOverlay` imports (still used for the `flow` cast).

- [ ] **Step 2: Update `test/driver.test.ts`**

In the test that asserted `res.overlay?.n1.status`, change it to read from the document:
```ts
    expect(res.document.flow?.overlay.n1.status).toBe("unguarded"); // mutation left suite green
    expect(res.document.overall.verdict).toBe("needs-human");
    expect(res.markdown).toMatch(/Architekturkonformität/);
```

- [ ] **Step 3: Update `test/golden.e2e.test.ts`**

The `de` block currently reads `de.overlay?.n3.status`. Change to `de.document.flow?.overlay.n3.status`. Add one document assertion to the main (en) run:
```ts
    expect(res.document.schemaVersion).toBe(1);
    expect(res.document.tier).toBe("tier-2");
    expect(res.document.flow?.overlay.n3.status).toBe("unguarded");
```
(Bind `res` from the first `runReview` if the test currently destructures only `{ markdown }` — change to `const res = await runReview(...); const { markdown } = res;`.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/driver.test.ts test/golden.e2e.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the expected build break is confined to the CLI**

Run: `npx tsc -p tsconfig.json 2>&1 | grep 'error TS' | sed -E 's/\(.*//' | sort -u`
Expected: only `src/cli/index.ts` (it still reads `res.graph`/`res.overlay` and imports `renderReport`; fixed in Task 4). If any other file errors, fix it.

- [ ] **Step 6: Commit**

```bash
git add src/core/driver.ts test/driver.test.ts test/golden.e2e.test.ts
git commit -m "feat(engine): runReview returns a ReviewDocument"
```

---

### Task 4: CLI — json/md formats, serve renders the dashboard, remove HTML

**Files:**
- Modify: `src/cli/index.ts`
- Delete: `src/report/html.ts`, `test/html.test.ts`
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: `ReviewDocument` (Task 1), `renderDashboard` (Task 2), `runReview` return (Task 3).
- Produces: `--format json|md`; `serve` renders `.json` via the dashboard. `CliDeps.runReview: (ctx, lang) => Promise<{ tier; gates; markdown; document }>`; `CliDeps` drops `renderReport`.

- [ ] **Step 1: Update `test/cli.test.ts`**

Replace the injected deps shape and add coverage. Each `buildProgram({...})` call: change `runReview` to `async (_ctx, _lang) => ({ tier: "tier-2", gates: [], markdown: "# a", document: { schemaVersion: 1, changesetId: "c", mode: "spec", tier: "tier-2", lang: "en", overall: { verdict: "needs-human" }, gates: [], flow: null, synthesis: { verdict: "needs-human", humanMustVerify: [] }, doesNotEstablish: { sharedBlindSpot: "", downgradedGates: "", unguardedCriteria: "", regressionBasis: "" } } })`, and REMOVE the `renderReport` field. Update the existing HTML test to assert JSON instead:

```ts
  it("writes the ReviewDocument as JSON when --format json", async () => {
    let written = "";
    const program = buildProgram({
      loadChangeset: async () => ({ diff: "d", requirement: "r", testCmd: "pytest", workdir: "/w", mode: "spec" }),
      runReview: async () => ({ tier: "tier-2", gates: [], markdown: "# a", document: { schemaVersion: 1, changesetId: "c", mode: "spec", tier: "tier-2", lang: "en", overall: { verdict: "pass" }, gates: [], flow: null, synthesis: { verdict: "pass", humanMustVerify: [] }, doesNotEstablish: { sharedBlindSpot: "", downgradedGates: "", unguardedCriteria: "", regressionBasis: "" } } }),
      writeOut: (_p, c) => { written = c; },
      serve: async () => {},
    });
    await program.parseAsync(["node", "review", "A..B", "--test-cmd", "pytest", "--workdir", "/w", "--format", "json"]);
    expect(JSON.parse(written).schemaVersion).toBe(1);
  });
  it("rejects an invalid --format", async () => {
    const program = buildProgram({
      loadChangeset: async () => ({ diff: "d", requirement: "r", testCmd: "pytest", workdir: "/w", mode: "spec" }),
      runReview: async () => ({ tier: "tier-2", gates: [], markdown: "x", document: { schemaVersion: 1, changesetId: "c", mode: "spec", tier: "tier-2", lang: "en", overall: { verdict: "pass" }, gates: [], flow: null, synthesis: { verdict: "pass", humanMustVerify: [] }, doesNotEstablish: { sharedBlindSpot: "", downgradedGates: "", unguardedCriteria: "", regressionBasis: "" } } }),
      writeOut: () => {}, serve: async () => {},
    });
    await expect(program.parseAsync(["node", "review", "A..B", "--workdir", "/w", "--format", "html"]))
      .rejects.toThrow(/--format must be/);
  });
```

Remove the old `--format html` test and any `renderReport` references.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL (deps type / behavior).

- [ ] **Step 3: Edit `src/cli/index.ts`**

- Remove `import type { FlowGraph, FlowOverlay } from "../judgment/runner.js";` and add `import type { ReviewDocument } from "../core/reviewDocument.js";`.
- Update `CliDeps`:
```ts
export type CliDeps = {
  loadChangeset: (o: { range: string; workdir: string; testCmd: string; requirement: string | null }) => Promise<ChangesetContext>;
  runReview: (ctx: ChangesetContext, lang: Lang) => Promise<{ tier: Tier; gates: GateResult[]; markdown: string; document: ReviewDocument }>;
  writeOut: (path: string | undefined, content: string) => void;
  serve: (o: { report?: string; port?: number }) => Promise<void>;
  resolvePr?: (o: { number: string; workdir: string; base?: string }) => Promise<PrRef>;
};
```
- Add a format validator:
```ts
function parseFormat(v: string | undefined): "json" | "md" {
  if (v === undefined || v === "md") return "md";
  if (v === "json") return "json";
  throw new Error(`--format must be "json" or "md", got "${v}"`);
}
```
- In BOTH `pr` and `review` actions: change the `--format` option help to `"json|md"`, and replace the `const content = o.format === "html" ? ... : res.markdown;` block with:
```ts
      const fmt = parseFormat(o.format);
      const content = fmt === "json" ? JSON.stringify(res.document, null, 2) : res.markdown;
      deps.writeOut(o.out, content);
```
  (drop the `title`/`renderReport` usage entirely).
- Replace `defaultServe` so a `.json` report renders the dashboard:
```ts
export function defaultServe(o: { report?: string; port?: number }): Promise<void> {
  const port = o.port ?? 8080;
  return new Promise((resolvePromise, reject) => {
    const server = createServer(async (req, res) => {
      const reportPath = o.report;
      if (!reportPath || !existsSync(reportPath)) {
        res.writeHead(404, { "content-type": "text/plain" }); res.end("report not found"); return;
      }
      const body = readFileSync(reportPath);
      if (extname(reportPath) === ".json") {
        try {
          const { renderDashboard } = await import("../report/dashboard.js");
          const html = renderDashboard(JSON.parse(body.toString()));
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html);
        } catch {
          res.writeHead(400, { "content-type": "text/plain" }); res.end("invalid review JSON");
        }
        return;
      }
      res.writeHead(200, { "content-type": MIME[extname(reportPath)] ?? "application/octet-stream" }); res.end(body);
    });
    server.on("error", reject);
    server.listen(port, () => { process.stdout.write(`Serving ${o.report ?? "(no report)"} on http://localhost:${port}\n`); resolvePromise(); });
  });
}
```
  (rename the Promise `resolve` param to `resolvePromise` to avoid shadowing the `resolve` from `node:path`; keep `MIME` for the non-JSON path.)
- In `main()`, remove `const { renderReport } = await import("../report/html.js");` and remove `renderReport,` from the `deps` object.

- [ ] **Step 4: Delete the HTML module and its test**

```bash
git rm src/report/html.ts test/html.test.ts
```

- [ ] **Step 5: Run the full suite + build**

Run: `npx vitest run && npm run build`
Expected: all green except the 2 pre-existing skips (`docker.int.test.ts`, `golden.live.int.test.ts`); build clean (zero tsc errors).

- [ ] **Step 6: Commit**

```bash
git add src/cli/index.ts test/cli.test.ts
git commit -m "feat(engine): --format json|md; serve renders branded dashboard; drop HTML path"
```

---

### Task 5: Docs

**Files:**
- Modify: `engine/README.md`, `engine/GETTING_STARTED.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update `engine/README.md`**

- In the Usage options table, change the `--format` row to `| \`--format <json\|md>\` | output format; \`md\` (default, plain text) or \`json\` (a ReviewDocument) |`.
- Remove the `--format html` example and the `assay serve --report review.html` example. Replace the serve example with:
```bash
assay review A..B --format json --out review.json
assay serve --report review.json     # opens the branded review at http://localhost:8080
```
- Update the Gate 2 / report prose to say the interactive coverage-colored diagram and the full branded review live in the served dashboard (not a standalone HTML file), and that `--format json` is the portable, importable result.

- [ ] **Step 2: Update `engine/GETTING_STARTED.md`**

Replace any `--format html` / open-the-HTML guidance with the two-step flow: produce `--format json`, then `assay serve --report review.json` to view the branded, interactive report (dark Assay theme, gate rail, Gate 3 hero, flow diagram). Keep the `--lang` note.

- [ ] **Step 3: Commit**

```bash
git add README.md GETTING_STARTED.md
git commit -m "docs(engine): --format json + assay serve dashboard"
```

---

## Self-Review

- **Spec coverage:** `ReviewDocument` + `assembleReviewDocument` (T1); branded viewer per DESIGN.md tokens/layout — summary band, gate rail, Gate 3 hero with unguarded emphasis, restyled flow diagram, weighted DNE (T2); `runReview` returns document (T3); `--format json|md` validated + `serve` JSON→dashboard + HTML removed (T4); docs (T5); security escaping carried into dashboard.ts + injection test (T2); tests across T1–T4. All spec sections mapped.
- **Type consistency:** `ReviewDocument` defined in T1, consumed by dashboard (T2), driver return (T3), CLI (T4). `runReview` return `{tier,gates,markdown,document}` defined T3, consumed T4. `flow: {graph,overlay}|null` shape identical in reviewDocument.ts, driver, and dashboard. New i18n keys (`ui.*`) added in T2 to both tables (parity test guards).
- **Placeholder scan:** none — full code in every step; the DESIGN.md tokens are copied verbatim.
- **Build window:** T3 leaves `tsc` red on `src/cli/index.ts` only (documented in T3 Step 5); T4 restores a fully green build. Per-file vitest gates pass throughout; T4 is the green checkpoint.
