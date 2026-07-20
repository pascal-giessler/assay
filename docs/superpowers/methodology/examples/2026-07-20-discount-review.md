# Review Artifact — docs/superpowers/methodology/fixtures/discount/discount.py

## 1. Header

- **Changeset id:** `docs/superpowers/methodology/fixtures/discount/discount.py` (fixture: `apply_discount`)
- **Risk tier:** Tier 2 — Critical
  - Blast-radius item(s) triggered:
    - a guard / branch condition — `capped = percent if percent <= 50 else 50` is a branch condition that decides whether the raw or clamped percent is used.
    - money / quantity / unit arithmetic — `round(price * (1 - capped / 100), 2)` computes a monetary result directly from `price` and the (possibly clamped) discount percentage.
  - Per the blast-radius checklist, one qualifying touch is sufficient for Tier 2, and this changeset has two independent qualifying touches (guard + arithmetic) — the same combination as the checklist's own worked example ("Discount-cap constant change").
- **Gate 1 requirement mode:** spec mode (stated requirement: "apply the given percentage discount, capped at 50%")

## 2. Gate sections

### Gate 1 — Intent Match (spec mode) / Intent Elicitation (inference mode)

- **verdict:** pass
- **evidence:**
  - Reconstruction (prose): Written BLIND, from the code alone, before the acceptance criteria below were consulted.

    `apply_discount(price, percent)` takes a price and a discount percentage. It first determines an effective ("capped") percentage: if the given `percent` is 50 or less, the effective percentage is the given `percent` unchanged; if `percent` exceeds 50, the effective percentage is forced to exactly 50, regardless of how large the input was. It then computes the discounted price as `price * (1 - capped / 100)` — i.e. it reduces `price` by the effective percentage — and rounds that result to 2 decimal places before returning it. Net behavior: the function returns a price reduced by the requested percentage, but the reduction actually applied can never exceed 50%, no matter what percentage is passed in.

  - Flow diagram:

    ```
    input: price, percent
        |
        v
    percent <= 50 ?
        |               \
       yes                no
        |                 |
        v                 v
    capped = percent   capped = 50
        \_______________/
                |
                v
    result = round(price * (1 - capped/100), 2)
                |
                v
              return result
    ```

  - Spec mode — **criterion-table:**

    | Criterion | met / not met / not addressed | Pointer to reconstruction detail |
    |---|---|---|
    | applies the given percentage discount | met | Reconstruction: "reduces `price` by the effective percentage... `result = round(price * (1 - capped / 100), 2)`" |
    | caps the discount at 50% | met | Reconstruction: "if `percent` exceeds 50, the effective percentage is forced to exactly 50, regardless of how large the input was" (`capped = percent if percent <= 50 else 50`) |

    Both criteria are met by behavior visibly present in the code itself (not merely inferred from naming or comments), so the gate verdict is `pass`. Note per Gate 3's tier-gating: at Tier 2 this `pass` is provisional until fault injection (Task 7) confirms both criteria are actually *guarded* by a test, not just present in the source.

### Gate 2 — Architecture Conformance

- **verdict:** <pass | fail | needs-human | abstain (no-baseline)>
- **evidence:**
  - Stated architecture reference used (if any): <link, or "none supplied — abstain (no-baseline)">
  - Structural changes, each tagged:

    | Structural change | Tag |
    |---|---|
    | <change 1> | <fits existing pattern | new pattern — justified? y/n | unjudged (no-baseline)> |

### Gate 3 — Test Adequacy

- **verdict:** <pass | needs-human | fail | N/A — Tier 0 skips this gate>
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
