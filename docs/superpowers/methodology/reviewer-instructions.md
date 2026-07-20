# Reviewer Operating Instructions

**Purpose:** the four review gates expressed as a step-by-step procedure an independent reviewer follows, in order, to produce a verdict plus evidence for each mandatory gate. This document is Step 2 of the review: it *consumes* the risk tier assigned by [`blast-radius-checklist.md`](./blast-radius-checklist.md) and *produces* the field values that [`artifact-template.md`](./artifact-template.md) (Task 4) transcribes into the final artifact. Field names are shared verbatim across both documents — see "Output fields" below.

**Reviewer stance (from the spec's Core model):** the reviewer is given only the diff, the requirement source (if any), and the test results — **never** the conversation, prompt, or agent session that produced the code. The reviewer's task is not to read the diff line-by-line but to reconstruct what the change actually does from evidence and run that reconstruction through the gates below.

---

## This procedure is complete when

Use this list to check the procedure below before it is trusted (Step 3 of this task verifies every item against the text that follows):

- [ ] All four gates are covered — Gate 1 Intent Match, Gate 2 Architecture Conformance, Gate 3 Test Adequacy, Gate 4 Regression — each with: what the reviewer is given, exact steps, possible verdicts, and required evidence.
- [ ] Both Gate 1 requirement modes are covered: spec mode (blind reconstruction, then diff against acceptance criteria) and inference mode (renamed "Intent Elicitation," produces no `pass`, only an inferred-intent statement marked `needs-human`).
- [ ] Gate 2's `abstain` / `no-baseline` path is covered, including the explicit rule that it must NOT infer conventions from surrounding code.
- [ ] Gate 3's fault-injection loop is covered: for each criterion that matters, mutate the source, run the suite, record red (guarded) or green (unguarded); tier-gating of when fault injection is required; the downgrade to "tests plausibly relate" when not run.
- [ ] Gate 4's selection-basis statement is covered: full suite vs. tool-selected affected subset, and that the latter is unsound.
- [ ] The gate ordering (1 → 2 → 3 → 4) and tier-based mandatoriness are stated.
- [ ] The output field names (`verdict`, `evidence`, and the per-gate specifics) are stated exactly as required by the artifact template.

---

## Step 0 — Assign the risk tier (input to everything below)

Before running any gate, apply [`blast-radius-checklist.md`](./blast-radius-checklist.md) to the changeset. It returns exactly one of:

- **Tier 0 — Mechanical**
- **Tier 1 — Standard**
- **Tier 2 — Critical**

This tier is the single input that decides, for every gate below, whether it is mandatory, collapsed, or requires escalation. Record the tier (and, if Tier 2, the specific blast-radius item(s) triggered) at the top of the review — it is the artifact's `tier` header field and does not change once the gates begin.

---

## Gate ordering and tier-gating

Gates run **in fixed order: Gate 1 → Gate 2 → Gate 3 → Gate 4.** Do not run them out of order and do not skip ahead — Gate 2 assumes Gate 1's reconstruction is in hand, Gate 3 assumes the criteria list from Gate 1, and Gate 4 is the final check regardless of what the earlier gates found.

Whether a gate is *mandatory* for this changeset depends on the tier assigned in Step 0:

| Gate | Tier 0 — Mechanical | Tier 1 — Standard | Tier 2 — Critical |
|---|---|---|---|
| Gate 1 — Intent Match | Collapses to a one-line intent statement | Mandatory | Mandatory; every `pass` requires named human confirmation |
| Gate 2 — Architecture Conformance | Skipped | Mandatory | Mandatory; every `pass` requires named human confirmation |
| Gate 3 — Test Adequacy | Skipped | Mandatory; fault injection optional (claim downgrades if skipped) | Mandatory; **fault injection required**; any unguarded criterion auto-escalates to `needs-human` |
| Gate 4 — Regression | Mandatory | Mandatory | Mandatory; every `pass` requires named human confirmation |

A changeset is "reviewed" only when every mandatory gate for its tier is `pass`, or a human has explicitly accepted a non-pass verdict. Diff size never changes this table — only the tier does.

---

## Output fields (shared with the artifact template)

Every gate emits, at minimum:

- `verdict` — one of `pass` / `fail` / `needs-human` / `abstain` (Gate 2's abstain reason is specifically `no-baseline`).
- `evidence` — the artifacts listed under that gate below. A verdict without its evidence is invalid and must not be recorded.

Per-gate additional fields (these exact names are what the artifact template mirrors):

- **Gate 1:** `criterion-table` — the criterion-by-criterion met / not met / not addressed table (spec mode only).
- **Gate 3:** `guarding-test-table` — criterion → guarding test → injected fault → red/green result; `unguarded-paths` — the list of criteria whose mutation stayed green.
- **Gate 4:** `selection-basis` — `full suite` or `tool-selected affected subset (unsound — may miss integration seams)`.

---

## Gate 1 — Intent Match (spec mode) / Intent Elicitation (inference mode)

**What the reviewer is given:** the diff, and — if it exists — the requirement source (ticket, spec, acceptance criteria). The reviewer is never given the author's prompt or session.

**Which mode applies** is decided by whether a requirement source exists for this changeset, not by reviewer preference. State the mode explicitly at the top of the gate's output.

### Spec mode

**Exact steps, in order:**

1. **Blind reconstruction first.** Before reading the acceptance criteria, read only the diff (and code it touches) and write a from-scratch reconstruction of the change's behavior: the user-visible / domain flows as prose, plus a flow diagram. This step is BLIND — the acceptance criteria must not be opened, read, or referenced until the reconstruction is written down. Reconstructing after reading the criteria lets the criteria's wording silently shape what gets "found" in the code, which defeats the purpose of an independent reconstruction.
2. **Then, and only then, read the acceptance criteria** and diff the reconstruction against them.
3. For each criterion, record one of three outcomes: **met** (the reconstruction shows behavior that satisfies it), **not met** (the reconstruction shows behavior that contradicts or falls short of it), or **not addressed** (the reconstruction shows no behavior related to it at all).
4. Assemble the `criterion-table`: one row per acceptance criterion, with its met / not met / not addressed outcome and a one-line pointer to the reconstruction detail that justifies it.

**Possible verdicts:**

- `pass` — every criterion is met.
- `fail` — one or more criteria are not met.
- `needs-human` — one or more criteria are not addressed, or the reconstruction surfaces behavior the criteria don't mention (potential scope drift) and a human should judge whether that's acceptable.

**Required evidence:** the written reconstruction (prose), the flow diagram, and the `criterion-table`.

### Inference mode → renamed "Intent Elicitation"

No requirement source exists. Reconstructing intent from the diff and then checking the diff against that same reconstruction is circular — the code will always "match" an intent that was inferred from the code itself. This gate therefore does **not** run the diff-then-compare procedure above and does **not** ever produce a `pass` verdict. Presenting a self-consistent reconstruction as a passed check would manufacture false confidence exactly where the requirement is weakest (there isn't one) — this procedure explicitly refuses to do that.

**Exact steps, in order:**

1. Read the diff and reconstruct the user-visible / domain flows, same as the blind-reconstruction step above.
2. From that reconstruction, write a stated **inferred-intent statement**: "this change appears to do X, for the purpose of Y" in the reviewer's own words, not the author's.
3. Package the inferred-intent statement together with an explicit **confirm-or-correct request** addressed to a human: state plainly that the reviewer cannot verify this intent is correct and ask the human to confirm it or supply the correction.

**Possible verdict:** `needs-human` — by definition, always, until a human confirms or corrects the inferred intent. There is no `pass` path for this gate in inference mode.

**Required evidence:** the inferred-intent statement, the reconstructed flows, and the explicit confirm-or-correct request.

---

## Gate 2 — Architecture Conformance

**What the reviewer is given:** the diff, and — if it exists — a **stated** architecture reference (a module-boundary doc, dependency policy, or ADRs). The reviewer does not go looking for one beyond what is stated/provided; if none is supplied, treat none as existing.

**Exact steps, in order:**

1. Enumerate the structural changes in the diff: new seams, cross-boundary calls, new dependencies, or new responsibilities added to already-large units.
2. **If a stated architecture reference exists:** check each structural change against it and tag it `fits existing pattern` or `new pattern — justified? y/n`.
3. **If no stated architecture reference exists:** do **not** infer "the existing pattern" from surrounding code. Inferring conventions from what's already there merely ratifies existing drift — it would bless the tenth violation of a rule because the previous nine made it look normal. Instead, tag every structural change `unjudged (no baseline)` and, optionally, propose a boundary rule worth adopting for the future. Honest abstention beats false blessing.

**Possible verdicts:**

- `pass` — every structural change fits the stated reference, or is a justified new pattern.
- `fail` — a structural change violates the stated reference without justification.
- `needs-human` — a new pattern's justification is arguable and a human should decide.
- `abstain` (`no-baseline`) — no architecture reference exists; the structural changes are listed as unjudged rather than approved or rejected. This is the only verdict this gate may emit when there is no reference — it must never fall back to reading surrounding code and inferring one.

**Required evidence:** the list of structural changes, each tagged `fits existing pattern` / `new pattern — justified? y/n` / `unjudged (no baseline)`.

---

## Gate 3 — Test Adequacy

**What the reviewer is given:** the diff, the test suite, the criteria list from Gate 1 (acceptance criteria in spec mode; the inferred-intent statement's implied behaviors in inference mode), and the tier from Step 0 (this decides whether fault injection is required).

Gate 3 proves the tests are **meaningful** — distinct from "tests pass," which is Gate 4's job. Reading a test and asserting "this would catch a regression of criterion X" without running anything is plausible-but-unverifiable reasoning, and it is exactly the kind of claim AI generates easily and wrongly. The only sound proof is fault injection.

**Exact steps (the fault-injection loop), in order:**

1. For each criterion from Gate 1 that matters (at minimum, every criterion tagged `met` or `not addressed` needs a check — a `not met` criterion is already known-broken and doesn't need proving), identify which test(s) claim to guard it.
2. Apply **one concrete mutation** to the source that should break that criterion if the guarding logic exists: flip a guard/condition, break a default, swap an operator, or an equivalent single-fault change.
3. Run the test suite against the mutated source.
4. Record the observed result for that criterion:
   - **Red** (a test failed) → the criterion is **guarded**. Record the specific test(s) that went red and the mutation applied.
   - **Green** (the suite still passed) → the criterion is **unguarded**. Record the mutation applied and that no test caught it.
5. Revert the mutation before moving to the next criterion (mutations are applied one at a time, never left in place).
6. Assemble the `guarding-test-table`: one row per criterion, listing the guarding test(s), the injected fault, and the red/green result.
7. Assemble the `unguarded-paths` list: every criterion whose mutation left the suite green. This list is required even when empty — state "none" explicitly rather than omitting the section.

**Tier-gating of fault injection:**

- **Tier 0:** Gate 3 is skipped entirely.
- **Tier 1:** fault injection is optional. If it is not run, the gate's claim must be explicitly downgraded to **"tests plausibly relate to the criterion"** — the words "tests are meaningful" or equivalent must never appear without fault-injection evidence backing them.
- **Tier 2:** fault injection is **required** for every criterion that matters. Skipping it is not an option at this tier. Any criterion that ends up on `unguarded-paths` **auto-escalates the gate's verdict to `needs-human`** regardless of how many other criteria are guarded.

**Possible verdicts:**

- `pass` — (Tier 1/2 with fault injection run) every criterion that matters is guarded; `unguarded-paths` is empty.
- `needs-human` — any criterion is unguarded (mandatory at Tier 2 per the auto-escalation rule above; a reviewer may also choose it at Tier 1 if the unguarded criteria look important).
- `fail` — fault injection surfaces that the test suite itself is broken or self-contradictory in a way that blocks assessment (rare; prefer `needs-human` when in doubt).
- Downgraded pass-like state at Tier 1 without fault injection is **not** a `pass` on "meaningful tests" — record it as `needs-human` or `pass` only against the weaker "plausibly relate" claim, and say so explicitly in `evidence`.

**Required evidence:** the `guarding-test-table` (criterion, guarding test, injected fault, red/green result) and the explicit `unguarded-paths` list (or "none").

---

## Gate 4 — Regression

**What the reviewer is given:** the CI run or affected-test-suite run for the changeset, including which selection strategy produced it.

Gate 4 records the CI / affected-suite result rather than re-deriving it — it is not this gate's job to re-run or second-guess individual test outcomes, only to capture and characterize the signal.

**Exact steps, in order:**

1. Obtain the suite run output or CI link for the changeset.
2. Determine and state the **selection basis** — which tests were actually run:
   - `full suite` — every test in the project ran. Sound signal, but slower.
   - `tool-selected affected subset (unsound — may miss integration seams)` — a tool computed a subset believed to be affected by the diff. This selection is **unsound in general** (dynamic dispatch, dependency injection, reflection, and integration seams can all cause a truly-affected test to be excluded), so it must be labeled as unsound rather than presented as equivalent to a full-suite green.
3. Record the pass/fail outcome of that run.

**Possible verdicts:**

- `pass` — the selected suite (state which) ran green.
- `fail` — the selected suite ran red.
- `needs-human` — the run is stale, flaky, inconclusive, or the selection basis is unknown/unverifiable.

**Required evidence:** the suite run output or CI link, the `selection-basis`, and the pass/fail outcome.

---

## Assembling the review

After all mandatory gates for the assigned tier have run, in order, the reviewer has: the tier (Step 0), and for each gate a `verdict` plus its required evidence (including the gate-specific fields above). These transcribe directly into [`artifact-template.md`](./artifact-template.md)'s Header, Gate sections, Synthesis, and "What this review does NOT establish" sections — no field is renamed or re-derived between this procedure and the template.
