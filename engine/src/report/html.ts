import { DAGRE_UMD } from "./vendor/dagre.inline.js";
import { t, type Lang } from "./i18n.js";
import type { FlowGraph, FlowOverlay } from "../judgment/runner.js";

const escape = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const badge = (s: string) =>
  s.replace(/\b(pass|fail|needs-human|abstain)\b/g, m => `<span class="v v-${m}">${m}</span>`);

function wrapDneSection(body: string, dneHeading: string): string {
  const marker = `<h2>${dneHeading}</h2>`;
  const idx = body.indexOf(marker);
  if (idx === -1) return body;
  return `${body.slice(0, idx)}<section class="dne">${body.slice(idx)}</section>`;
}

// The diagram is drawn client-side: dagre (inlined) computes coordinates, a few
// lines of vanilla JS build the SVG and wire node clicks to a side panel. The
// graph + overlay + panel labels travel in a JSON <script> block. No network.
function diagramBlock(graph: FlowGraph, overlay: FlowOverlay, lang: Lang): string {
  const data = JSON.stringify({
    graph, overlay,
    i18n: {
      sourceLine: t(lang, "panel.sourceLine"), status: t(lang, "panel.status"),
      guardedBy: t(lang, "panel.guardedBy"), noTest: t(lang, "panel.noTest"),
      guarded: t(lang, "status.guarded"), unguarded: t(lang, "status.unguarded"), unanalyzed: t(lang, "status.unanalyzed"),
    },
  });
  const legend = (["guarded", "unguarded", "unanalyzed"] as const)
    .map(s => `<span class="chip c-${s}">${escape(t(lang, `status.${s}`))}</span>`).join("");
  return `<figure class="flow-wrap">
<figcaption>${escape(t(lang, "legend.title"))}: ${legend}</figcaption>
<div id="flow">${staticDiagram(graph, overlay)}</div>
<aside id="flow-panel" hidden></aside>
</figure>
<script type="application/json" id="flow-data">${data}</script>
<script>${DAGRE_UMD}</script>
<script>${CLIENT}</script>`;
}

// Server-rendered fallback: a simple stacked SVG (no layout dependency) so the
// diagram is inspectable even without JS, and so node/status attributes are
// present in the static markup. The client script (dagre-powered) replaces
// this innerHTML with a properly laid-out graph once it runs.
function staticDiagram(graph: FlowGraph, overlay: FlowOverlay): string {
  const rowH = 56;
  const w = 220;
  const nodes = graph.nodes
    .map((n, i) => {
      const status = overlay[n.id]?.status ?? "unanalyzed";
      const y = i * rowH + 8;
      return `<g class="node" tabindex="0" data-node="${escape(n.id)}" data-status="${escape(status)}" transform="translate(10,${y})">` +
        `<rect rx="8" width="${w - 20}" height="40" class="n-${escape(status)}"/>` +
        `<text x="${(w - 20) / 2}" y="24" text-anchor="middle">${escape(n.label)}</text></g>`;
    })
    .join("");
  const h = graph.nodes.length * rowH + 16;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">${nodes}</svg>`;
}

// Static client script (no interpolation): reads #flow-data, lays out, draws SVG.
const CLIENT = `(function(){
  var el=document.getElementById('flow-data'); if(!el) return;
  var d=JSON.parse(el.textContent), G=window.dagre;
  var g=new G.graphlib.Graph().setGraph({rankdir:'TB',nodesep:36,ranksep:44,marginx:12,marginy:12}).setDefaultEdgeLabel(function(){return{};});
  d.graph.nodes.forEach(function(n){g.setNode(n.id,{w:Math.max(120,n.label.length*7+28),h:40,n:n});});
  d.graph.edges.forEach(function(e){g.setEdge(e.from,e.to);});
  g.nodes().forEach(function(id){var x=g.node(id);x.width=x.w;x.height=x.h;});
  G.layout(g);
  var W=g.graph().width||200,H=g.graph().height||120,svg='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" role="img">';
  g.edges().forEach(function(ed){var pts=g.edge(ed).points;svg+='<polyline class="edge" points="'+pts.map(function(p){return p.x+','+p.y;}).join(' ')+'"/>';});
  g.nodes().forEach(function(id){var n=g.node(id),s=(d.overlay[id]||{}).status||'unanalyzed';
    svg+='<g class="node" tabindex="0" data-node="'+id+'" data-status="'+s+'" transform="translate('+(n.x-n.w/2)+','+(n.y-n.h/2)+')">'
      +'<rect rx="8" width="'+n.w+'" height="'+n.h+'" class="n-'+s+'"/>'
      +'<text x="'+(n.w/2)+'" y="'+(n.h/2+4)+'" text-anchor="middle">'+esc(n.n.label)+'</text></g>';});
  svg+='</svg>';
  document.getElementById('flow').innerHTML=svg;
  var panel=document.getElementById('flow-panel');
  function show(id){var n=byId(id),o=d.overlay[id]||{status:'unanalyzed',tests:[]},L=d.i18n;
    var lines=['<strong>'+esc(n.label)+'</strong>'];
    if(n.sourceLine)lines.push(L.sourceLine+': '+n.sourceLine);
    lines.push(L.status+': '+(L[o.status]||o.status));
    lines.push(L.guardedBy+': '+((o.tests&&o.tests.length)?o.tests.map(esc).join(', '):L.noTest));
    panel.innerHTML=lines.join('<br>');panel.hidden=false;}
  function byId(id){return d.graph.nodes.filter(function(n){return n.id===id;})[0];}
  function esc(s){return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
  Array.prototype.forEach.call(document.querySelectorAll('.node'),function(g){
    g.addEventListener('click',function(){show(g.getAttribute('data-node'));});
    g.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();show(g.getAttribute('data-node'));}});
  });
})();`;

export function renderReport(
  markdown: string,
  opts: { title?: string; lang?: Lang; graph?: FlowGraph; overlay?: FlowOverlay } = {},
): string {
  const lang = opts.lang ?? "en";
  const title = opts.title ?? t(lang, "title.review");
  const dneHeading = t(lang, "dne.name");
  const body = wrapDneSection(
    badge(escape(markdown))
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/^- (.*)$/gm, "<li>$1</li>"),
    dneHeading,
  );
  const diagram = opts.graph && opts.graph.nodes.length
    ? diagramBlock(opts.graph, opts.overlay ?? {}, lang)
    : `<p class="flow-empty">${escape(t(lang, "flow.notSynthesized"))}</p>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;color:#111}
h1,h2{border-bottom:1px solid #ddd;padding-bottom:.2rem}
.v{padding:.1rem .4rem;border-radius:.3rem;font-weight:600}
.v-pass{background:#d7f5dd}.v-fail{background:#f8d2d2}.v-needs-human{background:#fde9c8}.v-abstain{background:#e2e2e2}
section.dne{background:#fff8e6;border:1px solid #e6c86b;padding:.5rem 1rem;border-radius:.4rem}
pre,code{background:#f5f5f5}
.flow-wrap{margin:1rem 0;border:1px solid #e2e2e2;border-radius:.5rem;padding:.75rem;overflow-x:auto}
.flow-wrap figcaption{font-size:.85rem;color:#555;margin-bottom:.5rem}
.chip{display:inline-block;padding:.05rem .4rem;border-radius:.3rem;margin-left:.35rem;font-size:.8rem}
.c-guarded{background:#d7f5dd}.c-unguarded{background:#f8d2d2}.c-unanalyzed{background:#e2e2e2}
#flow svg{max-width:100%;height:auto}
#flow .edge{fill:none;stroke:#9aa;stroke-width:1.5}
#flow text{font:12px system-ui,sans-serif;fill:#111;pointer-events:none}
#flow .node{cursor:pointer}
#flow .node:focus rect{stroke:#333;stroke-width:2}
#flow rect{stroke:#8a8a8a;stroke-width:1}
#flow .n-guarded{fill:#d7f5dd}.n-unguarded{fill:#f8d2d2}.n-unanalyzed{fill:#eee}
#flow-panel{margin-top:.5rem;padding:.5rem .75rem;background:#fafafa;border:1px solid #e2e2e2;border-radius:.4rem;font-size:.9rem}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head><body>
${diagram}
<pre style="white-space:pre-wrap">${body}</pre>
</body></html>`;
}
