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

- **verdict:** needs-human
- **Fault injection run?** yes — required at this tier (Tier 2)
- **evidence:**
  - **guarding-test-table:**

    | Criterion | Guarding test(s) | Injected fault | Red/Green |
    |---|---|---|---|
    | applies the given percentage discount | `test_applies_percentage` | Changed `1 - capped / 100` to `1 - capped / 50` in the return statement | red — `test_applies_percentage` failed (`assert 80.0 == 90.0`); `test_zero_percent_is_full_price` still passed since 0% is unaffected by the divisor change |
    | caps the discount at 50% | none | Changed `capped = percent if percent <= 50 else 50` to `capped = percent` (cap removed entirely) | green — `2 passed`, full suite still green; no test exercises `percent > 50`, so the cap's removal is invisible to the suite |

  - **unguarded-paths:** cap-at-50% has no failing test — removing the `percent <= 50 else 50` clamp entirely leaves the suite green because neither `test_applies_percentage` (percent=10.0) nor `test_zero_percent_is_full_price` (percent=0.0) ever passes a `percent` value above 50.

  - Both mutations were reverted immediately after their run; the fixture was confirmed byte-identical to its committed state (`git diff --exit-code discount.py` — no diff) and green (`2 passed`) before this record was written. See `task-7-report.md` for verbatim pytest output of both runs.
  - Per the tier-gating rule (Tier 2: any unguarded criterion auto-escalates Gate 3 to `needs-human`, regardless of how many other criteria are guarded), the single unguarded criterion above forces this gate's verdict to `needs-human` even though the percentage criterion is solidly guarded.

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
