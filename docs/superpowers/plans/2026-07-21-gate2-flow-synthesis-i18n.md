# Gate 2 Flow Synthesis + German (de) i18n — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Gate 2 from a silent `abstain` into an interactive, coverage-overlaid flow diagram synthesized from the change, and render the whole report in English or German.

**Architecture:** The existing `claude -p` judgment call returns a `FlowGraph` (nodes/edges, each node optionally keyed to a criterion). Gate 3's guarding table is joined onto the graph to produce a coverage `overlay`. Gate 2 emits graph + overlay; the HTML report draws an interactive SVG (dagre layout, vendored inline), the markdown emits a text outline. A `--lang` flag selects an i18n table for chrome and instructs the model to answer in that language.

**Tech Stack:** TypeScript, Node ≥ 20, ESM (explicit `.js` import extensions), vitest, `@dagrejs/dagre` (vendored inline as a string, dev-only dependency).

## Global Constraints

- Node ≥ 20; ESM; every relative import specifier ends in `.js`.
- The HTML report is a single self-contained, offline, CSP-safe file: no network, no CDN, all JS inlined.
- `--lang` accepts exactly `en` or `de`; default is `en`.
- JSON keys and enum values stay English in every language (parsing and the criterion-join must be language-independent).
- Judgment goes through `JudgmentRunner`; the engine holds no credentials.
- All new engine code is covered by tests; model-backed paths are tested through `StubJudgmentRunner` so the suite stays hermetic (no Docker, no API key).
- Run all commands from `engine/`. Test: `npx vitest run`. Build: `npm run build`.

---

## File Structure

- `src/judgment/runner.ts` — **modify**: add `FlowNode`/`FlowEdge`/`FlowGraph`, `OverlayStatus`/`OverlayEntry`/`FlowOverlay`, `IntentResult.flow`.
- `src/judgment/headless.ts` — **modify**: validate `flow` in `parseClaudeResult`.
- `src/core/verdicts.ts` — **modify**: widen `GateResult.subReason` to `"no-baseline" | "no-flow"`.
- `src/report/i18n.ts` — **create**: `Lang`, `TABLES`, `t()`.
- `src/report/flow.ts` — **create**: `buildOverlay`, `renderOutline`.
- `src/report/vendor/dagre.inline.ts` — **create (generated)**: vendored dagre UMD as a string.
- `src/gates/architecture.ts` — **modify**: rewrite to consume flow + guarding table.
- `src/gates/intent.ts` — **modify**: request `flow`, add language instruction, surface `flow`.
- `src/core/driver.ts` — **modify**: reorder g3 before g2, thread `lang`, return `graph`/`overlay`.
- `src/core/artifact.ts` — **modify**: i18n chrome + Gate 2 outline.
- `src/report/html.ts` — **modify**: new signature; interactive SVG diagram + panel + i18n.
- `src/cli/index.ts` — **modify**: `--lang` flag; thread lang; pass graph/overlay to renderReport.
- Tests: create `test/i18n.test.ts`, `test/flow.test.ts`; extend `test/headless.test.ts`, `test/architecture.test.ts`, `test/intent.test.ts`, `test/driver.test.ts`, `test/html.test.ts`, `test/cli.test.ts`, `test/golden.e2e.test.ts`, `test/golden.live.int.test.ts`.

---

### Task 1: Flow types + schema validation

**Files:**
- Modify: `src/judgment/runner.ts`
- Modify: `src/core/verdicts.ts`
- Modify: `src/judgment/headless.ts`
- Test: `test/headless.test.ts`

**Interfaces:**
- Produces: `FlowNode`, `FlowEdge`, `FlowGraph`, `OverlayStatus`, `OverlayEntry`, `FlowOverlay`, `IntentResult.flow?: FlowGraph`; `GateResult.subReason: "no-baseline" | "no-flow"`; `parseClaudeResult` returns `IntentResult` with a validated (or `undefined`) `flow`.

- [ ] **Step 1: Write the failing test** (append to `test/headless.test.ts`)

```ts
it("parses and validates a flow graph in the result", () => {
  const withFlow = { ...intent, flow: {
    nodes: [{ id: "n1", label: "entry", kind: "entry" }, { id: "n2", label: "cap", kind: "branch", criterion: "caps at 50%" }],
    edges: [{ from: "n1", to: "n2" }],
  } };
  const envelope = JSON.stringify({ type: "result", is_error: false, result: JSON.stringify(withFlow) });
  const out = parseClaudeResult(envelope);
  expect(out.flow?.nodes).toHaveLength(2);
  expect(out.flow?.nodes[1].criterion).toBe("caps at 50%");
});

it("drops an invalid flow (edge referencing a missing node) without throwing", () => {
  const bad = { ...intent, flow: { nodes: [{ id: "n1", label: "e", kind: "entry" }], edges: [{ from: "n1", to: "ghost" }] } };
  const envelope = JSON.stringify({ type: "result", is_error: false, result: JSON.stringify(bad) });
  expect(parseClaudeResult(envelope).flow).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/headless.test.ts`
Expected: FAIL (`out.flow` undefined / property not present).

- [ ] **Step 3: Add types to `src/judgment/runner.ts`**

Add above `IntentResult`:

```ts
export type FlowNode = {
  id: string;
  label: string;
  kind: "entry" | "branch" | "state" | "exit";
  sourceLine?: number;
  criterion?: string;
};
export type FlowEdge = { from: string; to: string; label?: string };
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };

export type OverlayStatus = "guarded" | "unguarded" | "unanalyzed";
export type OverlayEntry = { status: OverlayStatus; tests: string[] };
export type FlowOverlay = Record<string, OverlayEntry>;
```

Add `flow?: FlowGraph;` as the last field of `IntentResult`.

- [ ] **Step 4: Widen subReason in `src/core/verdicts.ts`**

Change `subReason?: "no-baseline";` to `subReason?: "no-baseline" | "no-flow";`.

- [ ] **Step 5: Validate flow in `src/judgment/headless.ts`**

Add `import type { ... FlowGraph, FlowNode, FlowEdge } from "./runner.js";` (extend the existing import). Add this helper above `parseClaudeResult`:

```ts
function validateFlow(raw: unknown): FlowGraph | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const g = raw as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) return undefined;
  const kinds = new Set(["entry", "branch", "state", "exit"]);
  const nodes: FlowNode[] = [];
  for (const n of g.nodes) {
    if (!n || typeof n !== "object") return undefined;
    const nn = n as Record<string, unknown>;
    if (typeof nn.id !== "string" || typeof nn.label !== "string" || !kinds.has(nn.kind as string)) return undefined;
    nodes.push({ id: nn.id, label: nn.label, kind: nn.kind as FlowNode["kind"],
      sourceLine: typeof nn.sourceLine === "number" ? nn.sourceLine : undefined,
      criterion: typeof nn.criterion === "string" ? nn.criterion : undefined });
  }
  if (nodes.length === 0) return undefined;
  const ids = new Set(nodes.map(n => n.id));
  const edges: FlowEdge[] = [];
  for (const e of g.edges) {
    if (!e || typeof e !== "object") return undefined;
    const ee = e as Record<string, unknown>;
    if (typeof ee.from !== "string" || typeof ee.to !== "string") return undefined;
    if (!ids.has(ee.from) || !ids.has(ee.to)) return undefined;
    edges.push({ from: ee.from, to: ee.to, label: typeof ee.label === "string" ? ee.label : undefined });
  }
  return { nodes, edges };
}
```

Change the final parse in `parseClaudeResult` from:

```ts
  try { return JSON.parse(inner) as IntentResult; }
  catch { throw new Error(`claude judgment JSON was malformed: ${inner.slice(0, 300)}`); }
```

to:

```ts
  let parsed: IntentResult;
  try { parsed = JSON.parse(inner) as IntentResult; }
  catch { throw new Error(`claude judgment JSON was malformed: ${inner.slice(0, 300)}`); }
  parsed.flow = validateFlow((parsed as { flow?: unknown }).flow);
  return parsed;
```

- [ ] **Step 6: Run tests + build**

Run: `npx vitest run test/headless.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 7: Commit**

```bash
git add src/judgment/runner.ts src/core/verdicts.ts src/judgment/headless.ts test/headless.test.ts
git commit -m "feat(engine): flow graph types + validated parsing"
```

---

### Task 2: i18n string tables

**Files:**
- Create: `src/report/i18n.ts`
- Test: `test/i18n.test.ts`

**Interfaces:**
- Produces: `export type Lang = "en" | "de"`; `export const TABLES: Record<Lang, Record<string,string>>`; `export function t(lang: Lang, key: string): string` (throws on missing key).

- [ ] **Step 1: Write the failing test** (`test/i18n.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { TABLES, t } from "../src/report/i18n";

describe("i18n", () => {
  it("has identical key sets in en and de", () => {
    const en = Object.keys(TABLES.en).sort();
    const de = Object.keys(TABLES.de).sort();
    expect(de).toEqual(en);
  });
  it("resolves a key per language", () => {
    expect(t("en", "gate2.name")).toMatch(/Architecture/);
    expect(t("de", "gate2.name")).toMatch(/Architektur/);
  });
  it("throws on a missing key", () => {
    expect(() => t("en", "nope.nope")).toThrow(/missing i18n key/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/i18n.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/report/i18n.ts`**

```ts
export type Lang = "en" | "de";
export type Strings = Record<string, string>;

const en: Strings = {
  "title.review": "Review Artifact",
  "header.changesetId": "Changeset id",
  "header.mode": "Requirement mode",
  "header.tier": "Risk tier",
  "tier.tier-0": "Tier 0 Mechanical",
  "tier.tier-1": "Tier 1 Standard",
  "tier.tier-2": "Tier 2 Critical",
  "gate1.name": "Gate 1 — Intent Match",
  "gate2.name": "Gate 2 — Architecture Conformance",
  "gate3.name": "Gate 3 — Test Adequacy",
  "gate4.name": "Gate 4 — Regression",
  "label.verdict": "verdict",
  "label.evidence": "evidence",
  "label.flow": "flow",
  "status.guarded": "guarded",
  "status.unguarded": "unguarded",
  "status.unanalyzed": "unanalyzed",
  "synthesis.name": "Synthesis",
  "synthesis.mustVerify": "The human must personally verify:",
  "dne.name": "What this review does NOT establish",
  "dne.sharedBlindSpot": "Shared-blind-spot residue",
  "dne.downgraded": "Downgraded/abstained gates",
  "dne.unguarded": "Unguarded criteria",
  "dne.regressionBasis": "Regression selection basis",
  "flow.notSynthesized": "flow not synthesized",
  "flow.htmlPointer": "(interactive diagram in the HTML report)",
  "panel.sourceLine": "Source line",
  "panel.status": "Coverage",
  "panel.guardedBy": "Guarded by",
  "panel.noTest": "no test guards this path",
  "legend.title": "Coverage",
};

const de: Strings = {
  "title.review": "Review-Artefakt",
  "header.changesetId": "Änderungs-ID",
  "header.mode": "Anforderungsmodus",
  "header.tier": "Risikostufe",
  "tier.tier-0": "Stufe 0 Mechanisch",
  "tier.tier-1": "Stufe 1 Standard",
  "tier.tier-2": "Stufe 2 Kritisch",
  "gate1.name": "Tor 1 — Absichtsabgleich",
  "gate2.name": "Tor 2 — Architekturkonformität",
  "gate3.name": "Tor 3 — Testabdeckung",
  "gate4.name": "Tor 4 — Regression",
  "label.verdict": "Urteil",
  "label.evidence": "Belege",
  "label.flow": "Ablauf",
  "status.guarded": "abgesichert",
  "status.unguarded": "ungesichert",
  "status.unanalyzed": "nicht analysiert",
  "synthesis.name": "Synthese",
  "synthesis.mustVerify": "Der Mensch muss persönlich prüfen:",
  "dne.name": "Was diese Prüfung NICHT belegt",
  "dne.sharedBlindSpot": "Gemeinsamer blinder Fleck",
  "dne.downgraded": "Herabgestufte/enthaltene Tore",
  "dne.unguarded": "Ungesicherte Kriterien",
  "dne.regressionBasis": "Regressions-Auswahlbasis",
  "flow.notSynthesized": "Ablauf nicht erzeugt",
  "flow.htmlPointer": "(interaktives Diagramm im HTML-Bericht)",
  "panel.sourceLine": "Quellzeile",
  "panel.status": "Abdeckung",
  "panel.guardedBy": "Abgesichert durch",
  "panel.noTest": "kein Test sichert diesen Pfad ab",
  "legend.title": "Abdeckung",
};

export const TABLES: Record<Lang, Strings> = { en, de };

export function t(lang: Lang, key: string): string {
  const v = TABLES[lang][key];
  if (v === undefined) throw new Error(`missing i18n key: ${key} (${lang})`);
  return v;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/i18n.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report/i18n.ts test/i18n.test.ts
git commit -m "feat(engine): en/de i18n string tables"
```

---

### Task 3: Flow helpers — overlay + outline

**Files:**
- Create: `src/report/flow.ts`
- Test: `test/flow.test.ts`

**Interfaces:**
- Consumes: `FlowGraph`, `FlowOverlay` (Task 1); `t`, `Lang` (Task 2).
- Produces: `buildOverlay(flow, guardingTable): FlowOverlay`; `renderOutline(flow, overlay, lang): string`.

- [ ] **Step 1: Write the failing test** (`test/flow.test.ts`)

```ts
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
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/flow.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/report/flow.ts`**

```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report/flow.ts test/flow.test.ts
git commit -m "feat(engine): coverage overlay + markdown flow outline"
```

---

### Task 4: Gate 2 rewrite

**Files:**
- Modify: `src/gates/architecture.ts`
- Test: `test/architecture.test.ts`

**Interfaces:**
- Consumes: `FlowGraph` (Task 1), `buildOverlay` (Task 3).
- Produces: `architectureGate({ flow?, guardingTable }): GateResult` — `abstain(no-flow)` with no flow; `needs-human(no-baseline)` with `evidence: { note, graph, overlay }` otherwise.

- [ ] **Step 1: Write the failing test** (replace `test/architecture.test.ts`)

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/architecture.test.ts`
Expected: FAIL (`architectureGate` takes no args / wrong shape).

- [ ] **Step 3: Rewrite `src/gates/architecture.ts`**

```ts
import type { GateResult } from "../core/verdicts.js";
import type { FlowGraph } from "../judgment/runner.js";
import { buildOverlay } from "../report/flow.js";

export function architectureGate(input: {
  flow?: FlowGraph;
  guardingTable: { criterion: string; status: "guarded" | "unguarded"; failedTests: string[] }[];
}): GateResult {
  if (!input.flow || input.flow.nodes.length === 0) {
    return { gate: 2, verdict: "abstain", subReason: "no-flow",
      evidence: { note: "flow not synthesized; architecture unjudged", structural: "unjudged" } };
  }
  const overlay = buildOverlay(input.flow, input.guardingTable);
  return { gate: 2, verdict: "needs-human", subReason: "no-baseline",
    evidence: {
      note: "no architecture baseline supplied — diagram is a comprehension aid, not a conformance judgment",
      graph: input.flow, overlay,
    } };
}
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run test/architecture.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/gates/architecture.ts test/architecture.test.ts
git commit -m "feat(engine): Gate 2 emits flow graph + coverage overlay"
```

---

### Task 5: Intent gate — request flow + language instruction

**Files:**
- Modify: `src/gates/intent.ts`
- Test: `test/intent.test.ts`

**Interfaces:**
- Consumes: `FlowGraph`, `Lang`.
- Produces: `intentGate(ctx, runner, lang?: Lang): Promise<{ result: GateResult; mutations; flow?: FlowGraph }>`; the prompt requests a flow and, for `de`, appends a German-output instruction.

- [ ] **Step 1: Write the failing test** (append to `test/intent.test.ts`)

```ts
import type { JudgmentRunner, IntentResult } from "../src/judgment/runner";
it("requests a flow and adds a German instruction for lang=de", async () => {
  let seenPrompt = "";
  const runner: JudgmentRunner = { async intent(req) { seenPrompt = req.prompt; return {
    reconstruction: "x", criterionTable: [{ criterion: "c", status: "met" }], mutations: [],
    flow: { nodes: [{ id: "n1", label: "e", kind: "entry" }], edges: [] },
  } as IntentResult; } };
  const ctx = { diff: "d", requirement: "r", testCmd: "t", workdir: "/w", mode: "spec" as const };
  const out = await intentGate(ctx, runner, "de");
  expect(seenPrompt).toMatch(/flow/i);
  expect(seenPrompt).toMatch(/German/);
  expect(out.flow?.nodes).toHaveLength(1);
});
```

(Adjust the `import { intentGate }` line at the top of the file if not already present.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/intent.test.ts`
Expected: FAIL (`intentGate` arity / prompt lacks "flow").

- [ ] **Step 3: Edit `src/gates/intent.ts`**

Add to imports: `import type { JudgmentRunner, IntentResult, FlowGraph } from "../judgment/runner.js";` and `import type { Lang } from "../report/i18n.js";`.

Replace the `PROMPT` constant with a base prompt that also asks for the flow:

```ts
const PROMPT = "You are an INDEPENDENT reviewer. From evidence bundle ONLY (you did not write this code and have no authoring context), reconstruct what change does, then compare requirement. Return JSON {reconstruction, criterionTable:[{criterion,status:'met'|'not met'|'not addressed'}], mutations:[{criterion,file,find,replace}], flow:{nodes:[{id,label,kind:'entry'|'branch'|'state'|'exit',sourceLine?,criterion?}],edges:[{from,to,label?}]}} where each mutation is a single, uniquely-matching source edit that would break that criterion, and flow models the control flow of the change with each node.criterion set to the criterion string it implements when applicable.";

function langInstruction(lang: Lang): string {
  return lang === "de"
    ? " Respond with all human-readable text fields (reconstruction, criterion descriptions, node labels) in German; keep JSON keys and enum values in English."
    : "";
}
```

Change the signature and body:

```ts
export async function intentGate(ctx: ChangesetContext, runner: JudgmentRunner, lang: Lang = "en"): Promise<{ result: GateResult; mutations: IntentResult["mutations"]; flow?: FlowGraph }> {
  const r = await runner.intent({
    bundle: { diff: ctx.diff, requirement: ctx.requirement, testResults: "" },
    prompt: PROMPT + langInstruction(lang),
  });
```

At both `return` sites add `flow: r.flow` to the returned object (inference-mode branch and spec-mode branch).

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run test/intent.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/gates/intent.ts test/intent.test.ts
git commit -m "feat(engine): intent gate requests flow + honors language"
```

---

### Task 6: Artifact — i18n chrome + Gate 2 outline

**Files:**
- Modify: `src/core/artifact.ts`
- Test: `test/golden.e2e.test.ts` (touched again in Task 9; here just keep it compiling via the driver in Task 7 — no direct artifact unit test needed beyond the golden).

**Interfaces:**
- Consumes: `t`, `Lang` (Task 2); `renderOutline` (Task 3); `FlowGraph`, `FlowOverlay` (Task 1).
- Produces: `assembleArtifact(input & { lang: Lang }): string` with localized chrome and a Gate 2 flow outline when a graph is present.

- [ ] **Step 1: Rewrite `src/core/artifact.ts`**

```ts
import type { GateResult, Tier, Verdict } from "./verdicts.js";
import type { FlowGraph, FlowOverlay } from "../judgment/runner.js";
import { t, type Lang } from "../report/i18n.js";
import { renderOutline } from "../report/flow.js";

export function assembleArtifact(input: {
  changesetId: string; mode: "spec" | "inference"; tier: Tier; gates: GateResult[]; lang: Lang;
  synthesis: { verdict: Verdict; humanMustVerify: string[] };
  doesNotEstablish: { sharedBlindSpot: string; downgradedGates: string; unguardedCriteria: string; regressionBasis: string };
}): string {
  const L = input.lang;
  const g = (n: number) => input.gates.find(x => x.gate === n)!;
  const ev = (n: number) => "```json\n" + JSON.stringify(g(n).evidence, null, 2) + "\n```";
  const sub = (n: number) => g(n).subReason ? ` (${g(n).subReason})` : "";
  const gate = (n: number) =>
    `## ${t(L, `gate${n}.name`)}\n- ${t(L, "label.verdict")}: ${g(n).verdict}${sub(n)}\n- ${t(L, "label.evidence")}:\n${ev(n)}`;

  // Gate 2 gets the flow outline when a graph is present; otherwise plain evidence.
  const g2 = g(2);
  const graph = g2.evidence.graph as FlowGraph | undefined;
  const gate2 = graph
    ? `## ${t(L, "gate2.name")}\n- ${t(L, "label.verdict")}: ${g2.verdict}${sub(2)}\n- ${t(L, "label.flow")}:\n`
      + renderOutline(graph, g2.evidence.overlay as FlowOverlay, L).split("\n").map(l => "  " + l).join("\n")
      + `\n- ${t(L, "flow.htmlPointer")}`
    : gate(2);

  return `# ${t(L, "title.review")}

## Header
- ${t(L, "header.changesetId")}: ${input.changesetId}
- ${t(L, "header.mode")}: ${input.mode}
- ${t(L, "header.tier")}: ${t(L, `tier.${input.tier}`)}

${gate(1)}

${gate2}

${gate(3)}

${gate(4)}

## ${t(L, "synthesis.name")}
- ${t(L, "label.verdict")}: ${input.synthesis.verdict}
- ${t(L, "synthesis.mustVerify")}
${input.synthesis.humanMustVerify.map(x => `  - ${x}`).join("\n")}

## ${t(L, "dne.name")}
- ${t(L, "dne.sharedBlindSpot")}: ${input.doesNotEstablish.sharedBlindSpot}
- ${t(L, "dne.downgraded")}: ${input.doesNotEstablish.downgradedGates}
- ${t(L, "dne.unguarded")}: ${input.doesNotEstablish.unguardedCriteria}
- ${t(L, "dne.regressionBasis")}: ${input.doesNotEstablish.regressionBasis}
`;
}
```

- [ ] **Step 2: Build to verify types**

Run: `npm run build`
Expected: FAIL — `driver.ts` still calls `assembleArtifact` without `lang`. That is fixed in Task 7 (this task's deliverable is the artifact function; the driver call site is Task 7's).

> Note for the executor: Tasks 6 and 7 are a paired change (function + its only caller). Commit Task 6 together with Task 7 if your build gate requires a green `tsc` per commit; otherwise commit here and complete the caller next. The reviewer should treat Task 7's build as the gate for both.

- [ ] **Step 3: Commit**

```bash
git add src/core/artifact.ts
git commit -m "feat(engine): localize artifact chrome + Gate 2 flow outline"
```

---

### Task 7: Driver — reorder, thread lang, return graph/overlay

**Files:**
- Modify: `src/core/driver.ts`
- Test: `test/driver.test.ts`

**Interfaces:**
- Consumes: `intentGate(ctx, runner, lang)` (Task 5), `architectureGate({flow, guardingTable})` (Task 4), `assembleArtifact({..., lang})` (Task 6).
- Produces: `runReview(ctx, deps, opts?: { lang?: Lang }): Promise<{ tier; gates; markdown; graph?: FlowGraph; overlay?: FlowOverlay }>`.

- [ ] **Step 1: Write the failing test** (append to `test/driver.test.ts`)

```ts
it("returns Gate 2 graph/overlay and overlays g3 guarding, honoring lang", async () => {
  const runner = new StubJudgmentRunner({
    reconstruction: "r", criterionTable: [{ criterion: "caps at 50%", status: "met" }],
    mutations: [{ criterion: "caps at 50%", file: "d.py", find: "x", replace: "" }],
    flow: { nodes: [{ id: "n1", label: "cap", kind: "branch", criterion: "caps at 50%" }], edges: [] },
  });
  const ctx = { diff: "d", requirement: "r", testCmd: "t", workdir: "/w", mode: "spec" as const };
  const mutator = { async apply() { return async () => {}; } };
  const testRunner = { async run() { return { passed: true, failedTests: [], raw: "2 passed" }; } };
  const res = await runReview(ctx, { runner, mutator, testRunner,
    sandbox: new StubSandbox(() => ({ stdout: "2 passed", stderr: "", exitCode: 0 })),
    verifyClean: async () => true }, { lang: "de" });
  expect(res.overlay?.n1.status).toBe("unguarded"); // mutation left suite green
  expect(res.markdown).toMatch(/Architekturkonformität/);
});
```

(Reuse the file's existing imports for `runReview`, `StubJudgmentRunner`, `StubSandbox`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/driver.test.ts`
Expected: FAIL (`opts`/`overlay` unknown, `assembleArtifact` lang missing).

- [ ] **Step 3: Edit `src/core/driver.ts`**

Add imports: `import type { FlowGraph, FlowOverlay } from "../judgment/runner.js";` and `import type { Lang } from "../report/i18n.js";`.

Change the signature to accept `opts` and return graph/overlay:

```ts
export async function runReview(
  ctx: ChangesetContext,
  deps: {
    runner: JudgmentRunner; mutator: Mutator; testRunner: TestRunner; sandbox: Sandbox;
    verifyClean?: (workdir: string) => Promise<boolean>;
  },
  opts: { lang?: Lang } = {},
): Promise<{ tier: Tier; gates: GateResult[]; markdown: string; graph?: FlowGraph; overlay?: FlowOverlay }> {
  const lang = opts.lang ?? "en";
  const verifyClean = deps.verifyClean ?? gitVerifyClean;
  const { tier } = triage(ctx.diff);
  const baseline = await deps.testRunner.run(ctx.testCmd, ctx.workdir, deps.sandbox);
  const g1 = await intentGate(ctx, deps.runner, lang);
  const g3 = await faultInjectGate({
    criteria: g1.mutations.map(m => ({ criterion: m.criterion, mutation: { file: m.file, find: m.find, replace: m.replace } })),
    baselineOutcome: baseline, testCmd: ctx.testCmd, workdir: ctx.workdir, tier,
    mutator: deps.mutator, runner: deps.testRunner, sandbox: deps.sandbox,
  });
  if (!(await verifyClean(ctx.workdir))) {
    throw new Error("workdir not restored to a clean state after fault injection; refusing to emit review");
  }
  const g3table = (g3.evidence["guarding-test-table"] as { criterion: string; status: "guarded" | "unguarded"; failedTests: string[] }[]) ?? [];
  const g2 = architectureGate({ flow: g1.flow, guardingTable: g3table });
  const g4 = await regressionGate({ testCmd: ctx.testCmd, workdir: ctx.workdir, runner: deps.testRunner, sandbox: deps.sandbox });
  const gates = [g1.result, g2, g3, g4];
  const unguarded = (g3.evidence["unguarded-paths"] as string[]) ?? [];
  const synthesisVerdict: Verdict =
    gates.some(g => g.verdict === "needs-human") ? "needs-human"
    : gates.some(g => g.verdict === "fail") ? "fail" : "pass";
  const downgraded =
    g2.subReason === "no-flow" ? "Gate 2 abstained (flow not synthesized)"
    : g2.subReason === "no-baseline" ? "Gate 2: no architecture baseline (diagram is comprehension-only)"
    : "none";
  const markdown = assembleArtifact({
    changesetId: "discount@fixture", mode: ctx.mode, tier, gates, lang,
    synthesis: { verdict: synthesisVerdict,
      humanMustVerify: unguarded.length ? [`is leaving these untested acceptable? ${unguarded.join(", ")}`] : ["confirm intent"] },
    doesNotEstablish: {
      sharedBlindSpot: "inputs neither author nor reviewer considered (e.g. negative price/percent)",
      downgradedGates: downgraded,
      unguardedCriteria: unguarded.length ? unguarded.join(", ") : "none",
      regressionBasis: String(g4.evidence["selection-basis"]),
    },
  });
  return { tier, gates, markdown, graph: g2.evidence.graph as FlowGraph | undefined, overlay: g2.evidence.overlay as FlowOverlay | undefined };
}
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run test/driver.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/driver.ts test/driver.test.ts
git commit -m "feat(engine): driver overlays g3 onto Gate 2, threads lang, returns graph"
```

---

### Task 8: HTML report — vendored dagre + interactive SVG diagram

**Files:**
- Create (generated): `src/report/vendor/dagre.inline.ts`
- Modify: `src/report/html.ts`
- Modify: `package.json` (dev dependency `@dagrejs/dagre`)
- Test: `test/html.test.ts`

**Interfaces:**
- Consumes: `FlowGraph`, `FlowOverlay` (Task 1); `t`, `Lang` (Task 2).
- Produces: `renderReport(markdown: string, opts?: { title?: string; lang?: Lang; graph?: FlowGraph; overlay?: FlowOverlay }): string`.

- [ ] **Step 1: Vendor dagre as an inlined string**

```bash
npm i -D @dagrejs/dagre@1.1.4
mkdir -p src/report/vendor
node -e "const fs=require('fs');const p=require('@dagrejs/dagre/package.json');const src=fs.readFileSync(require.resolve('@dagrejs/dagre/dist/dagre.min.js'),'utf8');fs.writeFileSync('src/report/vendor/dagre.inline.ts','// vendored @dagrejs/dagre (MIT license). Generated file — do not edit by hand.\n// version: '+p.version+'\n/* eslint-disable */\nexport const DAGRE_UMD: string = '+JSON.stringify(src)+';\n');"
```

Verify the file exists and starts with the version header:

Run: `head -2 src/report/vendor/dagre.inline.ts`
Expected: the comment header naming the version.

- [ ] **Step 2: Write the failing test** (replace `test/html.test.ts`)

```ts
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
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/html.test.ts`
Expected: FAIL (new signature / no diagram).

- [ ] **Step 4: Rewrite `src/report/html.ts`**

```ts
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
<div id="flow"></div>
<aside id="flow-panel" hidden></aside>
</figure>
<script type="application/json" id="flow-data">${data}</script>
<script>${DAGRE_UMD}</script>
<script>${CLIENT}</script>`;
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
```

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run test/html.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 6: Commit**

```bash
git add src/report/vendor/dagre.inline.ts src/report/html.ts package.json package-lock.json test/html.test.ts
git commit -m "feat(engine): interactive self-contained flow diagram in HTML report"
```

---

### Task 9: CLI — `--lang` flag + thread graph/overlay to renderReport

**Files:**
- Modify: `src/cli/index.ts`
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: `runReview(ctx, deps, {lang})` return shape (Task 7); `renderReport(md, {title, lang, graph, overlay})` (Task 8).
- Produces: `--lang <en|de>` on `review` and `pr`; `CliDeps.runReview: (o, lang) => Promise<{tier;gates;markdown;graph?;overlay?}>`; `CliDeps.renderReport: (md, opts) => string`.

- [ ] **Step 1: Update `test/cli.test.ts`**

Every existing test builds `deps` with `renderReport: (md) => \`<html>${md}</html>\``. Change those to accept the options object: `renderReport: (md, _opts) => \`<html>${md}</html>\``. Change `runReview: async () => (...)` to `runReview: async (_ctx, _lang) => (...)`. Then add:

```ts
it("passes lang and graph/overlay through to the HTML renderer", async () => {
  let seen: { lang?: string; hasGraph?: boolean } = {};
  const program = buildProgram({
    loadChangeset: async () => ({ diff: "d", requirement: "r", testCmd: "pytest", workdir: "/w", mode: "spec" }),
    runReview: async (_ctx, lang) => { seen.lang = lang; return { tier: "tier-2", gates: [], markdown: "# a",
      graph: { nodes: [{ id: "n1", label: "x", kind: "entry" }], edges: [] }, overlay: { n1: { status: "unanalyzed", tests: [] } } }; },
    renderReport: (_md, opts) => { seen.hasGraph = !!opts.graph; return "<html>"; },
    writeOut: () => {}, serve: async () => {},
  });
  await program.parseAsync(["node", "review", "A..B", "--test-cmd", "pytest", "--workdir", "/w", "--format", "html", "--lang", "de"]);
  expect(seen.lang).toBe("de");
  expect(seen.hasGraph).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL (lang undefined; renderReport signature).

- [ ] **Step 3: Edit `src/cli/index.ts`**

Add `import type { FlowGraph, FlowOverlay } from "../judgment/runner.js";` and `import { type Lang } from "../report/i18n.js";`.

Update `CliDeps`:

```ts
export type CliDeps = {
  loadChangeset: (o: { range: string; workdir: string; testCmd: string; requirement: string | null }) => Promise<ChangesetContext>;
  runReview: (ctx: ChangesetContext, lang: Lang) => Promise<{ tier: Tier; gates: GateResult[]; markdown: string; graph?: FlowGraph; overlay?: FlowOverlay }>;
  renderReport: (md: string, opts: { title?: string; lang?: Lang; graph?: FlowGraph; overlay?: FlowOverlay }) => string;
  writeOut: (path: string | undefined, content: string) => void;
  serve: (o: { report?: string; port?: number }) => Promise<void>;
  resolvePr?: (o: { number: string; workdir: string; base?: string }) => Promise<PrRef>;
};
```

Add a helper and use it in both actions:

```ts
function parseLang(v: string | undefined): Lang {
  if (v === undefined || v === "en") return "en";
  if (v === "de") return "de";
  throw new Error(`--lang must be "en" or "de", got "${v}"`);
}
```

In the `pr` command: add `.option("--lang <lang>", "report language: en|de", "en")`; in its action:

```ts
const lang = parseLang(o.lang);
const { range, requirement, title } = await deps.resolvePr({ number, workdir, base: o.base });
const ctx = await deps.loadChangeset({ range, workdir, testCmd: o.testCmd, requirement });
const res = await deps.runReview(ctx, lang);
const content = o.format === "html"
  ? deps.renderReport(res.markdown, { title: `Review — ${title}`, lang, graph: res.graph, overlay: res.overlay })
  : res.markdown;
deps.writeOut(o.out, content);
```

In the `review` command: add `.option("--lang <lang>", "report language: en|de", "en")`; in its action:

```ts
if (!range) return;
const workdir = resolve(o.workdir);
const lang = parseLang(o.lang);
const ctx = await deps.loadChangeset({ range, workdir, testCmd: o.testCmd, requirement: o.spec ?? null });
const res = await deps.runReview(ctx, lang);
const content = o.format === "html"
  ? deps.renderReport(res.markdown, { title: "Review Report", lang, graph: res.graph, overlay: res.overlay })
  : res.markdown;
deps.writeOut(o.out, content);
```

In `main()`, update the wiring:

```ts
runReview: (ctx, lang) => runReview(ctx, { runner, mutator, testRunner, sandbox }, { lang }),
renderReport,
```

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run test/cli.test.ts && npm run build`
Expected: PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/cli/index.ts test/cli.test.ts
git commit -m "feat(engine): --lang flag; pass graph/overlay to HTML report"
```

---

### Task 10: Goldens — deterministic + live

**Files:**
- Modify: `test/golden.e2e.test.ts`
- Modify: `test/golden.live.int.test.ts`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Update the deterministic golden** (`test/golden.e2e.test.ts`)

Add a `flow` to the `StubJudgmentRunner` canned result (after `mutations`):

```ts
      flow: {
        nodes: [
          { id: "n1", label: "apply_discount", kind: "entry" },
          { id: "n2", label: "percent <= 50 ?", kind: "branch", criterion: "applies percentage" },
          { id: "n3", label: "capped = 50", kind: "state", criterion: "caps at 50%" },
        ],
        edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }],
      },
```

Replace the Gate 2 assertion. The old line asserted `abstain ... no-baseline`; Gate 2 now emits a flow outline and `needs-human`:

```ts
    expect(markdown).toMatch(/Gate 2[\s\S]*needs-human[\s\S]*no-baseline/i);
    expect(markdown).toMatch(/flow:[\s\S]*capped = 50  \[unguarded\]/i);
```

Add a German-chrome assertion using the same stub:

```ts
    const de = await runReview(ctx, { runner, mutator, testRunner,
      sandbox: new StubSandbox(() => ({ stdout: "2 passed", stderr: "", exitCode: 0 })),
      verifyClean: async () => true }, { lang: "de" });
    expect(de.markdown).toMatch(/Architekturkonformität/);
    expect(de.markdown).toMatch(/\[ungesichert\]/);
    expect(de.overlay?.n3.status).toBe("unguarded");
```

- [ ] **Step 2: Run the deterministic golden**

Run: `npx vitest run test/golden.e2e.test.ts`
Expected: PASS.

- [ ] **Step 3: Extend the live golden** (`test/golden.live.int.test.ts`)

After the existing assertions on the live result, add a check that the real model produced a usable graph (guarded behind the same `RUN_INT` gate the file already uses):

```ts
    // Gate 2 should now carry a synthesized flow graph.
    const g2 = gates.find(g => g.gate === 2)!;
    expect(g2.evidence.graph ? (g2.evidence.graph as { nodes: unknown[] }).nodes.length : 0).toBeGreaterThan(0);
```

(Bind `gates` from the `runReview` result if the file does not already; the file already runs `runReview` on the discount fixture.)

- [ ] **Step 4: Run the full suite + build**

Run: `npx vitest run && npm run build`
Expected: PASS (live golden stays skipped without `RUN_INT`); build clean.

- [ ] **Step 5: Commit**

```bash
git add test/golden.e2e.test.ts test/golden.live.int.test.ts
git commit -m "test(engine): goldens cover flow graph, overlay, and de chrome"
```

---

## Post-plan: docs

After Task 10, update `engine/README.md` and `engine/GETTING_STARTED.md`: document `--lang en|de`, the interactive Gate 2 diagram, and note that the report stays self-contained (dagre vendored inline). This is a docs-only follow-up, folded into the final whole-branch review rather than a separate task.

## Self-Review

- **Spec coverage:** FlowGraph from judgment (T1, T5); Gate 2 rewrite + overlay (T3, T4); driver reorder (T7); HTML interactive diagram + dagre inline (T8); markdown outline (T3, T6); i18n + `--lang` + prompt language (T2, T5, T6, T9); error handling — invalid flow dropped (T1), `no-flow` abstain (T4), empty-graph note (T8); testing across T1–T10. All spec sections map to tasks.
- **Type consistency:** `guardingTable` shape `{criterion,status,failedTests}` is identical in T3 (`buildOverlay`), T4 (`architectureGate`), and T7 (extracted from `g3.evidence["guarding-test-table"]`). `renderReport` new signature defined in T8 and consumed in T9. `runReview` return type defined in T7 and consumed in T9. `subReason` union widened in T1 before T4 uses `"no-flow"`.
- **Placeholder scan:** none — every code step is complete; the dagre vendor step is concrete commands, not a stub.
- **Paired-commit note:** T6/T7 flagged (function + only caller) so a per-commit build gate does not trip the reviewer.
