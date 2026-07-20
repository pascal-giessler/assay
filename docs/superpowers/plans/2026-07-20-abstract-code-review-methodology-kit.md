# Abstract Code Review Methodology — Operational Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved methodology spec into a set of concrete, usable artifacts a reviewer follows, then empirically prove the two differentiating gates (blind intent reconstruction + fault-injection test-adequacy) actually work against a real changeset with a real test suite.

**Architecture:** This plan produces documentation artifacts plus one small validation fixture. The artifacts are the *executable* form of the methodology (a reviewer procedure, a deterministic triage checklist, an artifact template). The fixture is a tiny Python project with a deliberate coverage gap; running the methodology against it by hand is the "test" that the methodology's core claim holds — fault-injection must surface the gap that a passing green suite hides.

**Tech Stack:** Markdown for all methodology artifacts. Python 3 + `pytest` for the validation fixture (fault-injection performed by hand-editing source and observing red/green — no mutation-engine dependency required).

## Global Constraints

- **Source of truth:** `docs/superpowers/specs/2026-07-20-abstract-code-review-methodology-design.md`. Every artifact must match the spec's gate names, verdicts (`pass` / `fail` / `needs-human` / `abstain`), and section names verbatim.
- **Gate verdict vocabulary (exact):** `pass`, `fail`, `needs-human`, `abstain` (with sub-reason `no-baseline` for Gate 2).
- **Gate names (exact):** Gate 1 Intent Match (renamed "Intent Elicitation" in inference mode), Gate 2 Architecture Conformance, Gate 3 Test Adequacy, Gate 4 Regression.
- **Blast-radius items (exact, 7):** guard/branch condition; default value or constant; public or shared contract/signature; auth or permission logic; data migration or schema change; money/quantity/unit arithmetic; concurrency or transaction boundary.
- **Risk tiers (exact):** Tier 0 Mechanical, Tier 1 Standard, Tier 2 Critical.
- **No tooling in this plan.** The MCP server is a later phase. This plan stops at an operational, validated methodology kit.
- **Repo is not currently under git.** Task 0 initialises it so the plan's commit steps work.

---

## File Structure

- `docs/superpowers/methodology/blast-radius-checklist.md` — deterministic tier-assignment procedure (Task 2)
- `docs/superpowers/methodology/reviewer-instructions.md` — the gate-by-gate operating procedure an independent reviewer follows (Task 3)
- `docs/superpowers/methodology/artifact-template.md` — the fill-in review artifact template (Task 4)
- `docs/superpowers/methodology/fixtures/discount/` — Python validation fixture (Task 5)
  - `discount.py` — the function under review
  - `test_discount.py` — a passing suite with one deliberate coverage gap
- `docs/superpowers/methodology/examples/2026-07-20-discount-review.md` — the worked review artifact produced by running the methodology on the fixture (Tasks 6–8)

---

### Task 0: Initialise git and scaffold the methodology directory

**Files:**
- Create: `docs/superpowers/methodology/.gitkeep`

- [ ] **Step 1: Initialise the repository**
  Run:
  ```bash
  cd /Users/pascalgiessler/Developer/02_Personal/17_MCP_Server
  git init
  mkdir -p docs/superpowers/methodology/fixtures docs/superpowers/methodology/examples
  touch docs/superpowers/methodology/.gitkeep
  ```
  Expected: `Initialized empty Git repository`.

- [ ] **Step 2: Commit the existing spec and plan plus the scaffold**
  ```bash
  git add docs/superpowers
  git commit -m "docs: add code-review methodology spec, plan, and scaffold"
  ```

---

### Task 1: Write the kit README that indexes the methodology artifacts

**Files:**
- Create: `docs/superpowers/methodology/README.md`

**Interfaces:**
- Produces: the canonical entry point naming the three artifacts (checklist, reviewer-instructions, template) and the one-line order a reviewer applies them: assign tier → run gates → fill template.

- [ ] **Step 1: Write the validation check first (a checklist inside the README's own review)**
  Add a short "Definition of done for this kit" list to the README stating it is complete only when all three artifacts exist and the worked example validates. This is the human-checkable acceptance test for the whole plan.

- [ ] **Step 2: Write the README body**
  Index the artifacts, state the reviewer's order of operations (tier first, then gates, then template), and link to the spec as source of truth.

- [ ] **Step 3: Commit**
  ```bash
  git add docs/superpowers/methodology/README.md
  git commit -m "docs: add methodology kit README and index"
  ```

---

### Task 2: Blast-radius triage checklist (deterministic tier assignment)

**Files:**
- Create: `docs/superpowers/methodology/blast-radius-checklist.md`

**Interfaces:**
- Produces: a procedure that maps any changeset to exactly one of Tier 0 / Tier 1 / Tier 2. Reviewer-instructions (Task 3) consumes this as its first step.

- [ ] **Step 1: Write the determinism test**
  At the top of the file, include three worked mini-examples with their expected tier, chosen so a second reader must reach the same tier:
  1. A change that only reformats whitespace → **Tier 0**.
  2. A change adding a new endpoint handler that touches none of the 7 blast-radius items → **Tier 1**.
  3. A one-line change to a discount cap constant (a default value + money arithmetic) → **Tier 2**.
  These examples ARE the test: applying the checklist to each must yield the stated tier.

- [ ] **Step 2: Write the checklist procedure**
  State the rule: check the diff against the 7 blast-radius items (copied verbatim from Global Constraints). If it touches **any**, Tier 2. If it touches none but is feature code, Tier 1. If it touches none and is confined to formatting/renames/dependency-bumps/generated files, Tier 0. State explicitly: diff size only ever *lowers* effort, never raises confidence.

- [ ] **Step 3: Verify the three examples resolve correctly**
  Re-read each example against the written procedure. Expected: example 1 → Tier 0, example 2 → Tier 1, example 3 → Tier 2. If any mismatches, fix the procedure wording.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/superpowers/methodology/blast-radius-checklist.md
  git commit -m "docs: add deterministic blast-radius triage checklist"
  ```

---

### Task 3: Reviewer operating instructions (the four gates as a procedure)

**Files:**
- Create: `docs/superpowers/methodology/reviewer-instructions.md`

**Interfaces:**
- Consumes: the tier from `blast-radius-checklist.md` (Task 2).
- Produces: a gate-by-gate procedure whose output slots are exactly the fields the artifact template (Task 4) expects. The two must agree on field names: `verdict`, `evidence`, and per-gate specifics (Gate 1 `criterion-table`, Gate 3 `guarding-test-table` + `unguarded-paths`, Gate 4 `selection-basis`).

- [ ] **Step 1: Write the coverage test as an explicit checklist**
  Begin the file with a "this procedure is complete when" list: it must cover all four gates, both requirement modes for Gate 1, the `abstain`/`no-baseline` path for Gate 2, the fault-injection step for Gate 3, and the selection-basis statement for Gate 4. This list is checked in Step 3.

- [ ] **Step 2: Write the procedure**
  For each gate, write: what the reviewer is given, the exact steps, the possible verdicts, and the required evidence — all matching the spec. Critically for the two wedge gates:
  - **Gate 1:** spell out that in spec mode the reviewer reconstructs behavior *before* reading acceptance criteria (blind reconstruction), then diffs; in inference mode it produces no `pass`, only an inferred-intent statement marked `needs-human`.
  - **Gate 3:** spell out the fault-injection loop — for each criterion that matters, apply one concrete mutation to the source, run the suite, record red (guarded) or green (unguarded); a green mutation means the criterion is unguarded and goes on the unguarded-paths list.
  State the ordering: Gate 1 → 2 → 3 → 4, with tier deciding which are mandatory.

- [ ] **Step 3: Verify against the completeness checklist from Step 1**
  Confirm every item is covered. Fix gaps inline.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/superpowers/methodology/reviewer-instructions.md
  git commit -m "docs: add gate-by-gate reviewer operating instructions"
  ```

---

### Task 4: Review artifact template

**Files:**
- Create: `docs/superpowers/methodology/artifact-template.md`

**Interfaces:**
- Consumes: field names produced by `reviewer-instructions.md` (Task 3) — they must match exactly.
- Produces: the fill-in structure used by the worked example (Tasks 6–8).

- [ ] **Step 1: Write the structure test**
  List the four required top-level sections from the spec's "The artifact" section: Header (mode + tier + changeset id), Gate sections (1–4 with verdict + evidence), Synthesis, and "What this review does NOT establish" (with its four required sub-items). This list is the acceptance check.

- [ ] **Step 2: Write the template**
  Provide labelled empty slots for every field, including the four sub-items of the "does NOT establish" section (shared-blind-spot residue, downgraded/abstained gates, unguarded criteria, regression selection basis).

- [ ] **Step 3: Verify all required sections and sub-items are present**
  Cross-check against Step 1's list and the spec. Fix omissions.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/superpowers/methodology/artifact-template.md
  git commit -m "docs: add review artifact template"
  ```

---

### Task 5: Build the validation fixture with a deliberate coverage gap

**Files:**
- Create: `docs/superpowers/methodology/fixtures/discount/discount.py`
- Create: `docs/superpowers/methodology/fixtures/discount/test_discount.py`

**Interfaces:**
- Produces: `apply_discount(price: float, percent: float) -> float` with two behaviors — it applies the percentage, and it **caps** the discount at 50% (a guard). The test suite covers the percentage application but NOT the cap, so the suite is green yet the cap is unguarded. This gap is what Gate 3 must catch in Task 7.

- [ ] **Step 1: Write the fixture's own test suite (deliberately incomplete)**
  ```python
  # test_discount.py
  from discount import apply_discount

  def test_applies_percentage():
      assert apply_discount(100.0, 10.0) == 90.0

  def test_zero_percent_is_full_price():
      assert apply_discount(100.0, 0.0) == 100.0
  ```
  Note: neither test exercises a percent above 50, so the cap is untested by design.

- [ ] **Step 2: Write the implementation with the capped-discount guard**
  ```python
  # discount.py
  def apply_discount(price, percent):
      capped = percent if percent <= 50 else 50
      return round(price * (1 - capped / 100), 2)
  ```

- [ ] **Step 3: Run the suite and verify it passes green**
  Run:
  ```bash
  cd docs/superpowers/methodology/fixtures/discount && python -m pytest -q
  ```
  Expected: `2 passed`. The green suite hides the unguarded cap — exactly the situation the methodology exists to expose.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/superpowers/methodology/fixtures/discount/
  git commit -m "test: add discount fixture with deliberate coverage gap"
  ```

---

### Task 6: Dry-run Gate 1 (blind intent reconstruction) on the fixture

**Files:**
- Create: `docs/superpowers/methodology/examples/2026-07-20-discount-review.md`

**Interfaces:**
- Consumes: `artifact-template.md` (Task 4), the fixture (Task 5).
- Produces: a partially-filled artifact whose Header (Tier 2, since the fixture touches a guard + money arithmetic) and Gate 1 section are complete. Later tasks fill Gates 2–4 and the closing section.

- [ ] **Step 1: Assign the tier using the checklist**
  Apply `blast-radius-checklist.md`. Expected outcome to record: **Tier 2** (touches a guard/branch condition and money/quantity arithmetic).

- [ ] **Step 2: Write the blind reconstruction, then compare to intent**
  In the artifact, first reconstruct what `apply_discount` does *from the code alone*: "reduces price by a percentage, but never by more than 50%." Treat this fixture as **spec mode** with the stated requirement "apply the given percentage discount, capped at 50%." Fill Gate 1's criterion table: criterion "applies percentage" → met; criterion "caps at 50%" → met (the behavior exists in code). Verdict: `pass`.

- [ ] **Step 3: Verify the Header and Gate 1 section match the template fields**
  Cross-check field names against `artifact-template.md`. Fix mismatches.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/superpowers/methodology/examples/2026-07-20-discount-review.md
  git commit -m "docs: worked example — tier assignment and Gate 1 reconstruction"
  ```

---

### Task 7: Dry-run Gate 3 (fault-injection) — the core empirical validation

**Files:**
- Modify: `docs/superpowers/methodology/examples/2026-07-20-discount-review.md`
- (Temporarily edits `fixtures/discount/discount.py`, then reverts it)

**Interfaces:**
- Consumes: the fixture (Task 5), the in-progress artifact (Task 6).
- Produces: Gate 3 section filled with real red/green fault-injection results proving the cap is an **unguarded criterion**. This is the plan's central claim-check: fault-injection must catch what the green suite missed.

- [ ] **Step 1: Fault-inject the percentage behavior (should be caught → red)**
  Edit `discount.py` line `capped = ...` so the percentage is mis-applied, e.g. change `1 - capped / 100` to `1 - capped / 50`. Run:
  ```bash
  cd docs/superpowers/methodology/fixtures/discount && python -m pytest -q
  ```
  Expected: **FAIL** — `test_applies_percentage` goes red. Record in the artifact: criterion "applies percentage" → guarded (mutation caught). Revert the edit.

- [ ] **Step 2: Fault-inject the cap behavior (predicted unguarded → green)**
  Edit `discount.py` to remove the cap: change `capped = percent if percent <= 50 else 50` to `capped = percent`. Run:
  ```bash
  cd docs/superpowers/methodology/fixtures/discount && python -m pytest -q
  ```
  Expected: **PASS (2 passed)** — no test exercises percent > 50, so removing the cap is invisible. This is the unguarded criterion, caught by fault-injection but not by the green suite. Record it. Revert the edit.

- [ ] **Step 3: Confirm the fixture is back to its original green state**
  Run:
  ```bash
  cd docs/superpowers/methodology/fixtures/discount && git diff --exit-code discount.py && python -m pytest -q
  ```
  Expected: no diff, `2 passed`. The mutations left no residue.

- [ ] **Step 4: Fill Gate 3 in the artifact**
  Guarding-test table: "applies percentage" → guarded (red on mutation); "caps at 50%" → **unguarded** (green on mutation). Unguarded-paths list: `[cap-at-50% has no failing test]`. Verdict: because this is Tier 2, an unguarded criterion auto-escalates the gate to `needs-human`.

- [ ] **Step 5: Commit**
  ```bash
  git add docs/superpowers/methodology/examples/2026-07-20-discount-review.md
  git commit -m "docs: worked example — Gate 3 fault-injection surfaces unguarded cap"
  ```

---

### Task 8: Complete the artifact (Gates 2 & 4, Synthesis, "does NOT establish") and validate end-to-end

**Files:**
- Modify: `docs/superpowers/methodology/examples/2026-07-20-discount-review.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a complete worked artifact that exercises every gate verdict at least once (`pass`, `needs-human`, `abstain`), proving the template and instructions are sufficient to produce a real review.

- [ ] **Step 1: Fill Gate 2 as an abstain**
  The fixture has no architecture reference document, so Gate 2 emits `abstain (no-baseline)` and lists the one structural fact (a single pure function, no cross-boundary calls) as unjudged. This exercises the abstain path.

- [ ] **Step 2: Fill Gate 4 with an explicit selection basis**
  Record the regression run as `full suite` (2 passed), selection basis stated. Verdict `pass`.

- [ ] **Step 3: Fill Synthesis and "What this review does NOT establish"**
  Synthesis: overall `needs-human` (driven by Gate 3's unguarded cap and Gate 1 confirmation) with the one thing the human must verify — "is leaving the 50% cap untested acceptable?" The "does NOT establish" section must fill all four sub-items: shared-blind-spot residue (e.g. negative-price inputs neither AI considered), downgraded/abstained gates (Gate 2 abstained), unguarded criteria (the cap), regression selection basis (full suite).

- [ ] **Step 4: Validate the finished artifact against the spec**
  Re-read `artifact-template.md` and the spec's "The artifact" section. Confirm every required section and sub-item is present and that the gate verdicts collectively include `pass`, `needs-human`, and `abstain`. Fix any gaps.

- [ ] **Step 5: Update the kit README's definition-of-done checklist to checked**
  Mark the three artifacts + worked example as complete in `README.md`.

- [ ] **Step 6: Commit**
  ```bash
  git add docs/superpowers/methodology/
  git commit -m "docs: complete worked review example and mark kit done"
  ```

---

## Self-Review

**1. Spec coverage.** Every spec section maps to a task: core model + independence → reviewer-instructions (Task 3) and the example's "does NOT establish" (Task 8); four gates → Task 3 procedure + Tasks 6–8 dry-run; blast-radius tiering → Task 2 checklist + Task 6 assignment; the artifact → Task 4 template + Tasks 6–8; cost honesty → covered implicitly by Tier 0/1 collapse in Task 2 (not separately validated — acceptable, it is a stance not a mechanism); market positioning → not implemented (it is context, not a deliverable). No unaddressed *mechanism* gaps.

**2. Placeholder scan.** No TBD/TODO/"handle edge cases". Every step names exact files, commands, and expected output. The fixture code is shown in full.

**3. Type/name consistency.** `apply_discount(price, percent)` defined in Task 5 is used unchanged in Tasks 6–7. Field names (`verdict`, `evidence`, `guarding-test-table`, `unguarded-paths`, `selection-basis`, `criterion-table`) are introduced in Task 3's Interfaces and consumed by Task 4 and Tasks 6–8. Gate verdicts match the Global Constraints vocabulary. Tier names match. The fault-injection mutations in Task 7 (`/100`→`/50`, remove `else 50`) act on the exact source written in Task 5.

**Note on adapted TDD:** because the deliverables are methodology documents plus one fixture, "failing test first" is realised as (a) determinism/coverage/structure checklists written before each artifact, and (b) for the fixture, a real red/green pytest run. The one genuine executable test — fault-injection catching the unguarded cap while the suite stays green — is the empirical proof the methodology's core claim holds.
