import type { FlowGraph, FlowOverlay } from "../judgment/runner.js";
import { t, type Lang } from "./i18n.js";

export function buildOverlay(
  flow: FlowGraph,
  guardingTable: { criterion: string; status: "guarded" | "unguarded"; failedTests: string[] }[],
): FlowOverlay {
  const byCriterion = new Map(guardingTable.map(g => [g.criterion, g]));
  const overlay: FlowOverlay = {};
  for (const n of flow.nodes) {
    const g = n.criterion ? byCriterion.get(n.criterion) : undefined;
    overlay[n.id] = g ? { status: g.status, tests: g.failedTests } : { status: "unanalyzed", tests: [] };
  }
  return overlay;
}

// Text fallback for markdown: a tree walked from the entry node(s), each line
// tagged with its localized coverage marker. Unreachable nodes are listed flat.
export function renderOutline(flow: FlowGraph, overlay: FlowOverlay, lang: Lang): string {
  const marker = (id: string) => `[${t(lang, `status.${overlay[id]?.status ?? "unanalyzed"}`)}]`;
  const label = new Map(flow.nodes.map(n => [n.id, `${n.kind}: ${n.label}`]));
  const children = new Map<string, string[]>();
  const indeg = new Map<string, number>(flow.nodes.map(n => [n.id, 0]));
  for (const e of flow.edges) {
    children.set(e.from, [...(children.get(e.from) ?? []), e.to]);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const lines: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    lines.push(`${"  ".repeat(depth)}- ${label.get(id)}  ${marker(id)}`);
    for (const c of children.get(id) ?? []) walk(c, depth + 1);
  };
  for (const n of flow.nodes) if ((indeg.get(n.id) ?? 0) === 0) walk(n.id, 0);
  for (const n of flow.nodes) if (!seen.has(n.id)) walk(n.id, 0);
  return lines.join("\n");
}
