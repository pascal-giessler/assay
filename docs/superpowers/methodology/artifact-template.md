# Review Artifact Template

**Purpose:** the fill-in structure a reviewer completes for one changeset. This is the third and final step of the reviewer's order of operations (see [`README.md`](./README.md)): [`blast-radius-checklist.md`](./blast-radius-checklist.md) assigns the tier, [`reviewer-instructions.md`](./reviewer-instructions.md) runs the gates and produces field values, and this template transcribes those values into the artifact. **No field is renamed or re-derived here** — every field name below is copied verbatim from `reviewer-instructions.md`'s "Output fields" section.

Copy the template starting at "Template starts below" into a new file per changeset (see [`examples/`](./examples/) for a worked instance) and fill in every labelled slot. Slots that a gate skips at this tier are still present — mark them `N/A — <tier> collapses/skips this gate` rather than deleting them, so the artifact's shape stays identical across tiers.

---

## This template is complete when

Use this list to check the template below before it is trusted (Step 3 of Task 4 verifies every item against the text that follows). The four required top-level sections from the spec's "The artifact" section, plus the four required sub-items of the fourth section:

- [ ] **1. Header** — requirement mode, risk tier, changeset id.
- [ ] **2. Gate sections** — Gates 1–4, each with `verdict` + required evidence.
- [ ] **3. Synthesis** — overall verdict and the specific things the human must personally verify.
- [ ] **4. What this review does NOT establish** — required closing section, with all four required sub-items:
  - [ ] Shared-blind-spot residue
  - [ ] Downgraded/abstained gates
  - [ ] Unguarded criteria
  - [ ] Regression selection basis

---

## Field-name cross-check against `reviewer-instructions.md`

| Field in this template | Source in `reviewer-instructions.md` |
|---|---|
| `verdict` (every gate) | "Output fields" — `pass` / `fail` / `needs-human` / `abstain` (`no-baseline` for Gate 2) |
| `evidence` (every gate) | "Output fields" — required evidence list per gate |
| Gate 1 `criterion-table` | "Output fields" / Gate 1 spec-mode steps |
| Gate 3 `guarding-test-table` | "Output fields" / Gate 3 fault-injection loop |
| Gate 3 `unguarded-paths` | "Output fields" / Gate 3 fault-injection loop |
| Gate 4 `selection-basis` | "Output fields" / Gate 4 steps |

---

## Template starts below

```markdown
# Review Artifact — <changeset id>

## 1. Header

- **Changeset id:** <link, commit SHA, PR number, or fixture path identifying this changeset>
- **Risk tier:** <Tier 0 — Mechanical | Tier 1 — Standard | Tier 2 — Critical>
  - If Tier 2, blast-radius item(s) triggered: <list, or "N/A">
- **Gate 1 requirement mode:** <spec mode | inference mode ("Intent Elicitation")>

## 2. Gate sections

### Gate 1 — Intent Match (spec mode) / Intent Elicitation (inference mode)

- **verdict:** <pass | fail | needs-human>
  <!-- inference mode: verdict is always needs-human -->
- **evidence:**
  - Reconstruction (prose): <fill in, or link to it>
  - Flow diagram: <fill in, or link to it>
  - Spec mode — **criterion-table:**

    | Criterion | met / not met / not addressed | Pointer to reconstruction detail |
    |---|---|---|
    | <criterion 1> | <outcome> | <pointer> |

  - Inference mode only:
    - Inferred-intent statement: <"this change appears to do X, for the purpose of Y">
    - Confirm-or-correct request to human: <fill in>

### Gate 2 — Architecture Conformance

- **verdict:** <pass | fail | needs-human | abstain (no-baseline)>
- **evidence:**
  - Stated architecture reference used (if any): <link, or "none supplied — abstain (no-baseline)">
  - Structural changes, each tagged:

    | Structural change | Tag |
    |---|---|
    | <change 1> | <fits existing pattern | new pattern — justified? y/n | unjudged (no-baseline)> |

### Gate 3 — Test Adequacy

- **verdict:** <pass | needs-human | fail>
- **Fault injection run?** <yes | no (Tier 1 downgrade — claim is "tests plausibly relate to the criterion") | required at this tier>
- **evidence:**
  - **guarding-test-table:**

    | Criterion | Guarding test(s) | Injected fault | Red/Green |
    |---|---|---|---|
    | <criterion 1> | <test(s)> | <mutation applied> | <red | green> |

  - **unguarded-paths:** <list every criterion whose mutation left the suite green, or state "none" explicitly>

### Gate 4 — Regression

- **verdict:** <pass | fail | needs-human>
- **evidence:**
  - Suite run output / CI link: <fill in>
  - **selection-basis:** <full suite | tool-selected affected subset (unsound — may miss integration seams)>
  - Pass/fail outcome: <fill in>

## 3. Synthesis

- **Overall verdict:** <pass | fail | needs-human | abstain — derived from the gate verdicts above; a changeset is "reviewed" only when every mandatory gate for its tier is pass, or a human has explicitly accepted a non-pass verdict>
- **What the human must personally verify:**
  - <item 1 — e.g. confirm/correct the Gate 1 inferred-intent statement>
  - <item 2 — e.g. accept or reject the Gate 2 new-pattern justification, or supply the missing baseline>
  - <item 3 — e.g. decide whether the Gate 3 unguarded-paths list is acceptable>
  - <Tier 2 only: named human confirmation for every gate verdict marked pass>

## 4. What this review does NOT establish

*(Required. A review that cannot honestly fill this in is not complete.)*

- **Shared-blind-spot residue:** <requirement-implications that both the author-AI and reviewer-AI would miss for this specific changeset>
- **Downgraded/abstained gates:** <any gate that ran in abstain, no-baseline, or downgraded-claim mode, and why — or "none">
- **Unguarded criteria:** <behaviors from Gate 3 with no test that fails when they break — this is the same list as unguarded-paths above, repeated here for visibility — or "none">
- **Regression selection basis:** <whether the Gate 4 green signal came from the full suite or an unsound affected-subset>
```
