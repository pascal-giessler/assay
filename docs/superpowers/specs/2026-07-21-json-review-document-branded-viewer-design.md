# JSON Review Document + Branded `assay serve` Viewer — Design

**Status:** approved (brainstorming), ready for planning
**Date:** 2026-07-21
**Depends on:** [`2026-07-21-gate2-flow-synthesis-i18n-design.md`](2026-07-21-gate2-flow-synthesis-i18n-design.md), [`../brand/DESIGN.md`](../brand/DESIGN.md)

## Problem

The engine's HTML report is bare markdown-to-HTML: it ignores the existing
Assay design system entirely and looks unfinished. Presentation is also welded
into the engine (`src/report/html.ts`), so the review result cannot be consumed
by any other UI.

This design splits the two concerns. The engine emits a **presentation-free
JSON review document** (the canonical result), and a **branded viewer served by
`assay serve`** renders that document following [`DESIGN.md`](../brand/DESIGN.md).
The engine stops producing HTML.

## Scope

**In:**
- A versioned `ReviewDocument` JSON schema and `--format json` output.
- `assembleReviewDocument()` building it from the same inputs `assembleArtifact()`
  uses.
- `assay serve --report review.json`: detect JSON, render the branded
  **single-review detail page** per `DESIGN.md`.
- A new `src/report/dashboard.ts` render module (the interactive flow diagram +
  its XSS-safe escaping move here from `html.ts`).
- Removal of `--format html` and `src/report/html.ts`.
- Tests: schema shape, dashboard render (layout + injection-safety), serve-renders-JSON,
  CLI, updated goldens.

**Out (documented fast-follows):**
- Multi-review **queue index** (`assay serve --dir reviews/` → the list view
  `docs/brand/dashboard.html` prototypes).
- Live light/dark theme toggle (the viewer commits to the DESIGN.md dark theme).
- Persisting/uploading reviews to a remote service.

## Global constraints

- Node ≥ 20, TypeScript, ESM with explicit `.js` import extensions.
- The served page is self-contained per request (inlined CSS/JS, vendored dagre);
  `node:http` only, no web framework.
- Design tokens and layout come from `DESIGN.md` verbatim — no ad-hoc palette.
- Model-controlled fields (labels, criteria, reconstruction, test names) are
  escaped at every HTML/JS sink (carry the `html.ts` escaping approach over).
- `--format` accepts exactly `json` or `md`. Default stays `md`.
- The engine holds no model credentials; unit tests are hermetic.

## Data model — `ReviewDocument`

New module `src/core/reviewDocument.ts`:

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
  gates: GateResult[];                       // gate, verdict, subReason?, evidence
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
}): ReviewDocument;
```

- The document is language-recorded but chrome-free: gate *names*, section
  headings, and status words are the viewer's job (via `i18n.ts`). The document
  carries raw verdicts, evidence, criteria, and the flow.
- `overall.verdict` is the synthesis verdict (kept at top level for the summary
  band and any future index).
- `flow` is `null` when Gate 2 abstained with `no-flow`.

The driver already computes every input. `runReview` gains a returned
`document: ReviewDocument` (built via `assembleReviewDocument`) alongside the
existing `markdown`. The `doesNotEstablish` and `synthesis` values are the same
localized strings the markdown uses (so the JSON is internally consistent with
`--format md`).

## Engine / CLI changes

- `--format` becomes `json | md` (was `md | html`); default `md`. The value is
  validated: anything other than `json`/`md` (including the removed `html`) exits
  with a clear error (`--format must be "json" or "md"`). `src/report/html.ts`,
  `CliDeps.renderReport`, and the engine's HTML path are removed.
- `--format json` writes `JSON.stringify(document, null, 2)`.
- `runReview` returns `{ tier, gates, markdown, document }` (drop the separate
  `graph`/`overlay` returns — they now live inside `document.flow`).
- Both `review` and `pr` commands: `--format md` → markdown; `--format json` →
  the document JSON. `--out` and `--lang` behave as before. Neither command
  emits HTML; to view a review, run `assay serve --report review.json`.

## Server / viewer — `assay serve --report review.json`

`src/report/dashboard.ts` exports `renderDashboard(doc: ReviewDocument): string`
returning a complete branded HTML page. `defaultServe` (in `src/cli/index.ts`)
changes:

```ts
// if the report path ends in .json → parse ReviewDocument, render dashboard;
// otherwise serve the raw file (md/plain) as today.
```

- `serve` reads the file per request (unchanged), and for `.json` responds
  `text/html; charset=utf-8` with `renderDashboard(JSON.parse(body))`. Malformed
  JSON → `400` with a clear message; missing file → `404` (as today).
- The served page is self-contained: inlined `<style>` (DESIGN.md tokens),
  inlined vendored dagre, inlined client script for the diagram.

### Applying DESIGN.md

Encode the tokens as CSS custom properties exactly as specified:

```
--bg #14130f  --surface #1c1b16  --surface-2 #24221b
--line #3a3730  --ink #efece3  --ink-dim #a8a496  --ink-faint #6f6c60
--gold #c8a24a  --pass #5fb87a  --fail #d16a5a  --human #e0a63c
--abstain #7d8794  --unguarded #d16a5a
```

Layout, per DESIGN.md "Layout":
1. **Summary band** — tier chip + overall verdict token + the single human
   decision (from `synthesis.humanMustVerify`). Mono verdict tokens, small-caps,
   letter-spaced.
2. **Gate rail** — the four gates as a vertical stepped sequence 1→2→3→4 (not a
   card grid); each step shows its localized name, verdict token, and evidence.
   Order is meaningful; connect the steps with a hairline rail.
3. **Gate 3 hero** — the guarding-test table is the visual anchor: criterion →
   guarded/unguarded, the **unguarded row emphasized** in `--unguarded` (fail
   hue). This is the largest, highest-contrast element.
4. **Gate 2 flow diagram** — the interactive SVG (dagre), nodes tinted
   `--pass` / `--unguarded` / `--abstain` by overlay status; click a node → panel
   with source line, status, guarding test. Restyled to the tokens (no light-mode
   colors).
5. **"Does NOT establish"** — a distinct bordered, weighted block at the end (not
   a footer).

Typography: geometric-humanist sans for UI, mono for verdicts/evidence/code.
Elevation via surface steps + hairline borders (no drop shadows). Motion only on
hover/reveal, ease-out. Honor the DESIGN.md bans (no gradient text, no card
grids, no side-stripe accents, no em dashes).

The viewer localizes its chrome via `i18n.ts` using `doc.lang` (so a `de`
document renders German gate names and status words); model prose in the
document is shown as-is.

## Security

Every model-controlled string (`node.label`, `criterion`, `reconstruction`,
`overlay[*].tests[*]`, node `id`) is escaped at each sink in `dashboard.ts`:
- HTML text nodes and attributes → an attribute-safe `escape` (covers
  `& < > " '`).
- The flow graph/overlay embedded in a `<script type="application/json">` block
  → escape `<` as `<` to prevent `</script>` breakout.
- The client script escapes `id`/`status`/labels before building SVG/panel markup.
These are the exact mitigations already proven in `html.ts` (commit history);
they move with the code and are re-covered by an injection test here.

## Testing

- **`assembleReviewDocument`** — from a stubbed run, asserts the document shape:
  `schemaVersion`, tier, `overall.verdict` equals synthesis verdict, four gates
  with verdicts/evidence, `flow` present when a graph exists and `null` on
  `no-flow`, DNE fields populated.
- **`renderDashboard`** — asserts: DESIGN.md tokens present (`--bg`, `--unguarded`,
  …); the gate rail renders all four gates in order; Gate 3's table marks the
  unguarded criterion with the `--unguarded`/fail treatment; the flow diagram
  data + dagre blob are embedded; the DNE block is a distinct bordered section;
  German chrome when `doc.lang === "de"`; no `http(s)://` (self-contained).
- **injection** — a `ReviewDocument` whose node `id`/`label` and a criterion
  contain `</script>` and `"` produces no script/attribute breakout (the same
  assertions as the current `html.test.ts`).
- **serve** — serving a `.json` path returns the dashboard HTML (rendered), and a
  malformed JSON returns `400`; a `.md`/other path still serves raw (injected
  `readFile`/response doubles; no real socket).
- **CLI** — `--format json` writes the document JSON; `--format md` writes
  markdown; `--format html` (and any other value) exits with the validation error.
- **goldens** — `golden.e2e.test.ts`: assert the deterministic run's
  `document` (tier, gate verdicts, `flow.overlay` cap `unguarded`, `lang`);
  the removed HTML assertions are dropped. `golden.live.int.test.ts` unchanged
  except it no longer references HTML.

## Files

- Create: `src/core/reviewDocument.ts`, `src/report/dashboard.ts`,
  `test/reviewDocument.test.ts`, `test/dashboard.test.ts`.
- Modify: `src/core/driver.ts` (return `document`), `src/cli/index.ts`
  (`--format json|md`, `serve` JSON detection, drop HTML wiring),
  `test/cli.test.ts`, `test/golden.e2e.test.ts`, `test/serve` coverage
  (fold into `cli.test.ts` or a small `serve.test.ts`).
- Move: vendored dagre + diagram client logic from `src/report/html.ts` into
  `src/report/dashboard.ts` (keep `src/report/vendor/dagre.inline.ts` as-is).
- Remove: `src/report/html.ts`, `test/html.test.ts` (its injection test migrates
  to `dashboard.test.ts`).
- Docs: update `engine/README.md` + `engine/GETTING_STARTED.md` for
  `--format json` + `assay serve --report review.json` (replacing the
  `--format html` guidance).

## Open questions

None blocking. The single-review page establishes the schema and the branded
renderer; the queue index reuses both.
