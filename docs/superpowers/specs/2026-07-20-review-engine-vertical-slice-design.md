# Review Engine (Vertical Slice) — Design

**Date:** 2026-07-20
**Status:** Draft for review
**Depends on:** `2026-07-20-abstract-code-review-methodology-design.md` (the methodology this engine automates) and the operational kit under `docs/superpowers/methodology/`.

## Goal

A running tool that executes the review methodology end-to-end for one ecosystem (Python + pytest) via a CLI, produces the methodology's artifact, and renders it as a viewable report. The proof of correctness is that running the engine on the existing `discount` fixture reproduces the already-validated worked example — the golden output.

## Why a vertical slice

The methodology has four gates and could target many languages and invocation surfaces. Building all of that first would delay the only question that matters: *does the engine actually reproduce the validated review, including the fault-injection wedge, without a human hand-running it?* The slice answers that with the smallest complete path: core + one adapter (CLI) + all gates but only for Python/pytest + a report. Everything else (other adapters, polyglot runners, real architecture conformance) is a fast-follow that reuses the same core.

## Architecture: clean core + thin adapters

An invocation-agnostic **core** implements the gate contracts, the driver that sequences them, and the artifact assembler. **Adapters** translate a surface's input into the core's changeset object and route the artifact out. The core never knows which adapter called it.

- **Core** (this slice): changeset model, gate contracts, driver, artifact assembler, report renderer.
- **CLI adapter** (this slice): `review`, `review serve`.
- **Fast-follow adapters** (out of slice): CI/CD templates, a Claude Code Skill/Command that dispatches a fresh reviewer subagent, an MCP adapter exposing the driver/gates as tools.

The engine is a **TypeScript/Node package**. The engine's implementation language is independent of the target ecosystem it reviews: fault-injection reaches the target only through the `Mutator` and `TestRunner` interfaces (file edits + a subprocess like `python -m pytest`), so a TypeScript engine reviewing Python code is clean. TypeScript is chosen because the planned fast-follow adapters land in its ecosystem — the official MCP SDK is TypeScript/Node, and the Skill/Command adapter and the HTML report renderer are natural there — while `claude -p` shell-out and CLI tooling (commander/oclif) are mature in Node. (If AST-aware mutation targeting is wanted later, tree-sitter has Node bindings for the target languages; the slice uses targeted text mutation and does not need it.)

## The gates in this slice

Each gate is a pure function over the changeset context returning `{verdict, evidence}` in the methodology's exact vocabulary (`pass` / `fail` / `needs-human` / `abstain` / `no-baseline`). Two kinds:

**Mechanical (no model, run inline in core):**
- `triage(diff) -> tier` — applies the blast-radius checklist deterministically → Tier 0/1/2.
- `fault_inject(target, mutation, test_cmd) -> {red|green}` — applies a targeted mutation to source, runs the test command, reports whether a test went red (guarded) or the suite stayed green (unguarded). See "Fault-injection design" below.
- `regression(test_cmd) -> {verdict, selection-basis}` — runs the suite, records pass/fail and the selection basis (`full suite` for the slice).

**Judgment (delegated to a model context — the core holds no credentials):**
- `intent(bundle)` — spec mode: blind reconstruction of behavior from the evidence bundle, then criterion diff (met / not met / not addressed). Inference mode: elicitation only, no `pass`, `needs-human` by definition.
- `architecture(bundle, reference?)` — in the slice there is no architecture reference mechanism yet, so this gate emits `abstain (no-baseline)` and lists structural facts as unjudged. (Real conformance checking is a fast-follow.) This keeps the abstain path exercised without building baseline parsing.

The **driver** sequences gates 1→2→3→4 honoring the tier's mandatoriness rules, assembles the artifact, and appends the required "What this review does NOT establish" section.

## Judgment delegation

The core never calls a model directly. For a judgment gate it builds a **blind evidence bundle** — the diff, the spec/requirement (if any), and the test results — and *deliberately excludes any authoring context*. It hands the bundle plus the gate prompt to whichever model context is driving:

- When the engine runs under an agent (fast-follow Skill/Command/Agent, or MCP), the ambient fresh subagent executes the prompt.
- In CLI/CI mode with no ambient agent, the core shells out to a headless `claude -p` invocation with the same bundle and prompt.

One code path, one bundle format. Independence (Gate 1's blindness) is structural: CI jobs and fresh subagents carry no authoring history, and the bundle never contains it regardless.

**Delegation interface:** the core defines a `JudgmentRunner` with a single method `run(bundle, prompt) -> structured_result`. The slice ships one implementation: `HeadlessClaudeRunner` (shells out to `claude -p`, expects structured output). An `AgentContextRunner` (uses the ambient agent) is a fast-follow for the Skill/MCP adapters.

## Fault-injection design (the wedge)

Fault-injection is language- and runner-specific, so the core defines two interfaces and the slice ships one concrete pair:

- `Mutator` — given a mutation target (file + code location) and a mutation directive, produce a mutated working tree and guarantee restoration afterward.
- `TestRunner` — run the test command and parse pass/fail, including which test failed.

Slice implementations: `PythonSourceMutator` (edits Python source in place, restores from a saved copy — never commits the mutated state) and `PytestRunner`.

**Targeting mode (a):** the engine does *not* auto-locate mutation points (that is full mutation-testing territory, e.g. mutmut, and is heavier than the methodology needs). Instead, for each criterion "that matters," the **judgment context names the mutation target and the concrete mutation** (e.g. "in `discount.py`, remove the `else 50` cap"), and the engine mechanically applies it, runs the suite, and records red/green. Fault-injection stays *targeted verification of specific criteria*, not blanket mutation. A criterion whose mutation leaves the suite green is recorded as an **unguarded criterion**; at Tier 2 that auto-escalates Gate 3 to `needs-human`.

**Hygiene guarantee:** the `Mutator` restores the working tree after every mutation; the engine asserts the tree is byte-identical to its pre-run state before producing the artifact, and refuses to emit a result if restoration failed. (This mirrors the discipline the manual worked example had to follow by hand.)

## The changeset context

The core's input object, built by an adapter:
- `diff` — the changeset (`git diff base..head`).
- `requirement` — spec/ticket text if supplied (`--spec`), else `None` → inference mode.
- `test_cmd` — how to run the suite (`--test-cmd`).
- `workdir` — where source lives and mutations/tests run.

## Output and viewing

- **Artifact (canonical):** markdown matching the methodology's template exactly — the same shape as `docs/superpowers/methodology/examples/2026-07-20-discount-review.md`.
- **Report:** a self-contained HTML rendering of the artifact (inlined CSS, no external assets), suitable as a CI build artifact and openable standalone. Verdicts are visually distinguished; the "does NOT establish" section is prominent.
- **`review serve`:** a thin command that serves the latest generated report over localhost for browsing. No persistence, no multi-review state — just a viewer over the report file.

## CLI surface (the slice)

```
review <base>..<head> --test-cmd "<cmd>" [--spec <file>] [--workdir <dir>] [--format md|html] [--out <path>]
review serve [--report <path>] [--port <n>]
```

## Testing strategy

- **Golden end-to-end test — two variants to separate determinism from realism:**
  - *Deterministic (default CI):* run the engine on the `discount` fixture with a **stub `JudgmentRunner`** returning a canned intent result (blind reconstruction + criterion table for the two known criteria). Assert the produced artifact matches the validated `discount-review.md` exactly on structure and verdicts: Tier 2, Gate 1 `pass`, Gate 2 `abstain (no-baseline)`, Gate 3 `needs-human` with the 50% cap on the unguarded-paths list, Gate 4 `pass` (full suite), Synthesis `needs-human`, all four "does NOT establish" sub-items populated. This is deterministic because the only non-deterministic gate (intent) is stubbed while triage, fault-injection, and regression run for real.
  - *Live (behind an integration flag):* the same run with the real `HeadlessClaudeRunner`, asserting on structure + verdicts + the unguarded-cap fact only, not on prose wording (the model's reconstruction phrasing will vary between runs).
- **Fault-injection unit tests:** the percentage mutation yields red (guarded); the cap-removal mutation yields green (unguarded); the working tree is restored byte-identical after each; the engine refuses to emit if restoration fails.
- **Triage unit tests:** the checklist's three worked examples resolve to Tier 0/1/2.
- **Judgment delegation:** tested with a stub `JudgmentRunner` (deterministic canned bundle→result) so the driver and artifact assembly are testable without a live model; the real `HeadlessClaudeRunner` gets a thin integration test behind a flag.

## Out of scope (fast-follows)

- Adapters other than CLI (CI templates, Skill/Command via Agent, MCP).
- Ecosystems other than Python/pytest (the `Mutator`/`TestRunner` interfaces exist so these slot in without core changes).
- Real architecture-conformance checking (Gate 2 beyond `abstain`) — needs a baseline/ADR mechanism.
- Stateful multi-review dashboards or history (the slice serves one report).
- Auto-located mutation points / full mutation-testing coverage.

## Open questions for the plan

- Exact structured-output contract between the core and the `JudgmentRunner` (schema for the reconstruction, criterion table, and per-criterion mutation directives).
- How strict the golden test's "structurally matches" comparison should be (section/verdict presence vs. near-verbatim), given the judgment gate's wording will vary between model runs — likely assert on structure + verdicts + the unguarded-cap fact, not prose.
