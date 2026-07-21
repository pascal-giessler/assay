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
