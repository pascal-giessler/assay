# Gate 2 Flow Synthesis + German (de) i18n — Design

**Status:** approved (brainstorming), ready for planning
**Date:** 2026-07-21
**Depends on:** [`2026-07-20-review-engine-vertical-slice-design.md`](2026-07-20-review-engine-vertical-slice-design.md)

## Problem

Gate 2 (Architecture Conformance) currently returns a static
`abstain (no-baseline)` because the vertical slice ships no architecture
reference. That is honest but inert: a reviewer facing a Tier 2 change gets no
help understanding the control flow, and the "50% cap is untested" finding from
Gate 3 lives only in a text table. Separately, the report is English-only.

This design makes Gate 2 *comprehend* the change — it synthesizes an
interactive flow / state diagram of the changed code and overlays Gate 3's
guarded/unguarded verdict onto it, so untested branches are visible at a
glance — and adds a German (`de`) rendering of the report.

Gate 2 does **not** start establishing architecture conformance (that still
needs a baseline mechanism, a documented fast-follow). Its verdict stays
`needs-human`; the diagram is a comprehension aid, and the "no baseline" fact
becomes an explicit note rather than silence.

## Scope

**In:**
- A `FlowGraph` returned by the existing `claude -p` judgment call (no new
  model round-trip).
- Gate 2 rewrite: build a coverage **overlay** joining flow nodes to Gate 3's
  guarding table; emit graph + overlay as evidence.
- Interactive SVG diagram in the HTML report (dagre layout, vendored inline;
  bespoke rendering; click-to-inspect panel).
- Text-fallback flow outline in the markdown artifact.
- `en`/`de` i18n string tables and a `--lang de|en` CLI flag threaded through
  assembly, rendering, and the judgment prompt.

**Out (fast-follows, noted where relevant):**
- Real architecture-conformance judgment (needs a baseline).
- In-report bilingual toggle (this slice is single-language per run).
- Languages beyond `en`/`de`.
- Non-Python source adapters (the model-synthesized graph is already
  language-agnostic, but only Python is wired).

## Global constraints

- **Node ≥ 20**, TypeScript, ESM with explicit `.js` import extensions.
- The HTML report stays a **single self-contained, offline, CSP-safe file** —
  no network fetches, no CDN. Any JS dependency is vendored and inlined.
- **Default language is `en`.** `--lang` accepts exactly `en` or `de`.
- The engine holds no model credentials; judgment goes through
  `JudgmentRunner`.
- All new engine code is covered by tests (unit + golden); model-backed paths
  are tested through stubs so the suite stays hermetic (no Docker, no API key).

## Data model

New types in `src/judgment/runner.ts`:

```ts
export type FlowNode = {
  id: string;                                   // stable, unique within the graph
  label: string;                                // short human label for the node
  kind: "entry" | "branch" | "state" | "exit";
  sourceLine?: number;                          // 1-based line in the changed file, if known
  criterion?: string;                           // join key → criterionTable[].criterion
};
export type FlowEdge = { from: string; to: string; label?: string };
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };
```

`IntentResult` gains one optional field:

```ts
export type IntentResult = {
  reconstruction: string;
  criterionTable: { criterion: string; status: "met" | "not met" | "not addressed" }[];
  mutations: { criterion: string; file: string; find: string; replace: string }[];
  flow?: FlowGraph;   // NEW — omitted/invalid → Gate 2 degrades to abstain(no-flow)
};
```

`node.criterion` is the join key. It matches `criterionTable[].criterion`
(Gate 1) which is the same string Gate 3's `guarding-test-table` is keyed on.
That one field is the entire coupling between the diagram and coverage.

## Overlay status

For each node the overlay computes one status:

| Status | Meaning |
|---|---|
| `guarded` | node's `criterion` is `guarded` in Gate 3's table |
| `unguarded` | node's `criterion` is `unguarded` in Gate 3's table |
| `unanalyzed` | node has no `criterion`, or its criterion is absent from Gate 3's table |

Overlay type — each entry carries the status **and** the guarding test names,
so the HTML click-panel can name the guarding test without re-joining to Gate 3:

```ts
export type OverlayStatus = "guarded" | "unguarded" | "unanalyzed";
export type OverlayEntry = { status: OverlayStatus; tests: string[] }; // tests: guarding test names, [] if none
export type FlowOverlay = Record<string, OverlayEntry>;                // nodeId → entry
```

## Gate 2 rewrite

`src/gates/architecture.ts`:

```ts
export function architectureGate(input: {
  flow?: FlowGraph;
  // exactly Gate 3's `guarding-test-table` shape, passed straight through
  guardingTable: { criterion: string; status: "guarded" | "unguarded"; failedTests: string[] }[];
}): GateResult;
```

Behavior:
- **No / empty `flow`** → `{ gate: 2, verdict: "abstain", subReason: "no-flow",
  evidence: { note: "flow not synthesized; architecture unjudged", structural: "unjudged" } }`.
- **Valid `flow`** → build `overlay` (`nodeId → { status, tests }`) by joining
  each `node.criterion` to `guardingTable` (`tests` = that criterion's
  `failedTests`, `[]` for `unanalyzed`); return
  `{ gate: 2, verdict: "needs-human", subReason: "no-baseline",
     evidence: { graph, overlay, note: "no architecture baseline supplied — diagram is a comprehension aid, not a conformance judgment" } }`.

The verdict never becomes `pass`/`fail`: Gate 2 still does not establish
conformance. `needs-human` with a diagram is strictly more informative than the
old silent `abstain`.

## Driver reordering

`src/core/driver.ts` runs gates so Gate 3 precedes Gate 2:

```
triage → baseline → g1 (intent, returns flow+mutations)
       → g3 (fault inject, from g1.mutations)
       → g2 (architectureGate({ flow: g1.flow, guardingTable: g3.table }))
       → verifyClean → g4 (regression)
```

`gates` array order in the artifact is unchanged (`[g1, g2, g3, g4]`); only the
computation order moves so g3's guarding table is available to g2.

The `doesNotEstablish.downgradedGates` line reflects the new subReason: for
`no-flow` it reads "Gate 2 abstained (flow not synthesized)"; for `no-baseline`
with a diagram it reads "Gate 2: no architecture baseline (diagram is
comprehension-only)".

## Rendering — two surfaces, one data model

### HTML report (`src/report/html.ts`)

`renderReport` today takes only the markdown string. It gains a structured
input so it can draw the diagram: the CLI already receives `{ tier, gates,
markdown }` from `runReview` and will pass Gate 2's `graph` + `overlay` (from
`gates[1].evidence`) and the `lang`. New signature:
`renderReport(markdown, { title, lang, graph, overlay })` (graph/overlay
optional — absent → render the localized "flow not synthesized" note). The
`CliDeps.renderReport` type and both call sites update accordingly. The panel's
guarding test names come from `overlay[nodeId].tests`, so the renderer never
re-joins to Gate 3.

- Layout: **dagre**, vendored as an inlined minified UMD string
  (`src/report/vendor/dagre.inline.ts` exporting the library source as a
  string constant, with the upstream version and MIT license recorded in a
  header comment). Inlined into the report's `<script>`; no network.
- Draw: bespoke SVG built from dagre's computed node/edge coordinates, styled
  with Assay's existing report tokens; theme-aware (light/dark).
- Overlay: node fill/stroke tinted by status — `guarded` (positive),
  `unguarded` (critical), `unanalyzed` (neutral). Semantic colors, distinct
  from the accent.
- Interactive: clicking a node opens a side panel showing the node label, its
  `sourceLine` (if present), its overlay status, and the guarding test name(s)
  from `overlay[nodeId].tests` (or the localized "no test guards this path"
  when empty).
  Hover highlights the node and its incident edges. Keyboard-focusable nodes
  with a visible focus state; respects `prefers-reduced-motion`.
- A legend maps the three status colors to their localized labels.

### Markdown artifact (`src/core/artifact.ts`)

Gate 2's markdown section renders a **text flow outline** from the same
`graph` + `overlay`:

```
## Gate 2 — Architecture Conformance
- verdict: needs-human (no-baseline)
- flow:
  - entry: apply_discount(price, percent)  [unanalyzed]
  - branch: percent <= 50 ?                [guarded]
    - state: capped = percent              [guarded]
    - state: capped = 50                   [unguarded]
  - exit: return round(price*(1-capped/100), 2)  [unanalyzed]
- (interactive diagram in the HTML report)
```

Outline nesting follows edges from the entry node; unreachable nodes are listed
flat after the tree. Status markers are localized.

## i18n

New `src/report/i18n.ts`:

```ts
export type Lang = "en" | "de";
export type Strings = Record<string, string>;   // flat key → translated text
export const TABLES: Record<Lang, Strings>;
export function t(lang: Lang, key: string): string; // throws on missing key
```

- Keys cover every chrome string: gate names, section headings, verdict/label
  words, overlay status words, panel labels, legend, the "does NOT establish"
  section, and the "no test guards this path" message.
- `assembleArtifact` and `renderReport` take a `lang: Lang` and resolve all
  chrome through `t(lang, …)`. No hardcoded English literals remain in either
  renderer.

### `--lang` flag and prompt language

- CLI gains `--lang <en|de>` (default `en`) on both `review` and `pr`
  subcommands; invalid values error with a clear message.
- `lang` threads: CLI → `loadChangeset`/`runReview` context → `assembleArtifact`
  + `renderReport`.
- The judgment prompt (`src/gates/intent.ts`) appends a language instruction:
  for `de`, "Respond with all human-readable text fields (reconstruction,
  criterion descriptions) in German; keep JSON keys and enum values in
  English." JSON keys/enums stay English so parsing and the overlay join are
  language-independent.

## Error handling

- Model returns no `flow`, malformed `flow`, or `flow` failing schema
  validation → Gate 2 → `abstain (no-flow)`; the run still completes.
- `parseClaudeResult` validates `flow` if present: nodes have `id`+`label`+
  `kind`; edges reference existing node ids. Invalid → treat as absent (log a
  note), do not throw.
- Node with unknown/absent `criterion` → `unanalyzed`.
- HTML render with an empty/absent graph → render the localized "flow not
  synthesized" note instead of an SVG; never emit a broken `<svg>`.

## Testing

Every new unit is covered; model-backed paths use `StubJudgmentRunner`.

- **i18n parity** — every key present in `en` also present in `de` and
  vice-versa; `t()` throws on a missing key.
- **flow schema validation** (`parseClaudeResult`) — valid graph parses; edge
  referencing a missing node → flow dropped, no throw; absent flow → `undefined`.
- **overlay join** — guarded/unguarded/unanalyzed each produced from a
  criterion present-guarded / present-unguarded / absent-or-missing.
- **Gate 2** — no flow → `abstain(no-flow)`; valid flow → `needs-human`,
  evidence carries `graph` + `overlay` with correct statuses (stubbed).
- **driver order** — g2 evidence overlay reflects g3's guarding table
  (integration with stubs).
- **markdown fallback golden** — outline renders with localized status markers
  and the HTML pointer line.
- **HTML render** — output contains an `<svg>`, the inlined dagre blob, the
  correct-language chrome, the legend, node elements carrying overlay-status
  data attributes, and panel wiring; empty-graph path renders the note.
- **`--lang de` CLI** (injected deps) — German chrome selected; the judgment
  prompt handed to the runner contains the German-language instruction.
- **deterministic golden** (`golden.e2e.test.ts`) — extend the discount example
  to assert the flow outline + overlay (cap node `unguarded`).
- **live golden** (`golden.live.int.test.ts`, env-gated) — real `claude -p`
  returns a `flow`; assert Gate 2 emits a non-empty graph.

## Files

- Modify: `src/judgment/runner.ts` (types), `src/judgment/headless.ts`
  (parse+validate `flow`), `src/gates/intent.ts` (prompt language + pass flow
  through), `src/gates/architecture.ts` (rewrite), `src/core/driver.ts`
  (reorder + thread lang), `src/core/artifact.ts` (outline + i18n),
  `src/report/html.ts` (SVG/dagre/panel + i18n), `src/cli/index.ts`
  (`--lang` flag).
- Create: `src/report/i18n.ts`, `src/report/vendor/dagre.inline.ts`,
  `src/report/flow.ts` (overlay + outline helpers, shared by both renderers).
- Tests: new `test/i18n.test.ts`, `test/flow.test.ts`,
  `test/architecture.test.ts`; extend `test/headless.test.ts`,
  `test/cli.test.ts`, `test/golden.e2e.test.ts`,
  `test/golden.live.int.test.ts`, and the HTML report test.

## Open questions

None blocking. Dagre's exact vendored version is chosen at implementation time
(latest stable `@dagrejs/dagre`), recorded in the vendor file header.
