const escape = (s: string) => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const badge = (s: string) =>
  s.replace(/\b(pass|fail|needs-human|abstain)\b/g, m => `<span class="v v-${m}">${m}</span>`);

const DNE_HEADING = "What this review does NOT establish";

function wrapDneSection(body: string): string {
  const marker = `<h2>${DNE_HEADING}</h2>`;
  const idx = body.indexOf(marker);
  if (idx === -1) return body;
  return `${body.slice(0, idx)}<section class="dne">${body.slice(idx)}</section>`;
}

export function renderReport(markdown: string, title = "Review Report"): string {
  const body = wrapDneSection(
    badge(escape(markdown))
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/^- (.*)$/gm, "<li>$1</li>")
      .replace(/\n/g, "\n")
  );
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;color:#111}
h1,h2{border-bottom:1px solid #ddd;padding-bottom:.2rem}
.v{padding:.1rem .4rem;border-radius:.3rem;font-weight:600}
.v-pass{background:#d7f5dd}.v-fail{background:#f8d2d2}.v-needs-human{background:#fde9c8}.v-abstain{background:#e2e2e2}
h2:last-of-type,section.dne{background:#fff8e6;border:1px solid #e6c86b;padding:.5rem 1rem;border-radius:.4rem}
pre,code{background:#f5f5f5}
</style></head><body>
<pre style="white-space:pre-wrap">${body}</pre>
</body></html>`;
}
