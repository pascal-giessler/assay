# Review Artifact — docs/superpowers/methodology/fixtures/discount/discount.py

## 1. Header

- **Changeset id:** `docs/superpowers/methodology/fixtures/discount/discount.py` (fixture: `apply_discount`)
- **Risk tier:** Tier 2 — Critical
  - Blast-radius item(s) triggered:
    - a guard / branch condition — `capped = percent if percent <= 50 else 50` is a branch condition that decides whether the raw or clamped percent is used.
    - money / quantity / unit arithmetic — `round(price * (1 - capped / 100), 2)` computes a monetary result directly from `price` and the (possibly clamped) discount percentage.
  - Per the blast-radius checklist, one qualifying touch is sufficient for Tier 2, and this changeset has two independent qualifying touches (guard + arithmetic), which also lands in Tier 2, sharing the money-arithmetic trigger with the checklist's example 3 ("Discount-cap constant change").
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

- **verdict:** abstain (no-baseline)
- **evidence:**
  - Stated architecture reference used (if any): none supplied — abstain (no-baseline)
  - Structural changes, each tagged:

    | Structural change | Tag |
    |---|---|
    | `apply_discount(price, percent)` is a single pure function — no new module seams, no cross-boundary calls (no I/O, no imports beyond the module itself, no calls into other subsystems) | unjudged (no-baseline) |

  Per Gate 2's procedure, no stated architecture reference (module-boundary doc, dependency policy, ADR) was supplied for this fixture, and surrounding code was **not** consulted to infer one — inferring conventions from what's already there would merely ratify existing drift. The one structural fact present (a single pure function with no cross-boundary calls) is recorded as unjudged rather than approved or rejected. This is the only verdict Gate 2 may emit when there is no reference.

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

  - Both mutations were reverted immediately after their run; the fixture was confirmed byte-identical to its committed state (`git diff --exit-code discount.py` — no diff) and green (`2 passed`) before this record was written. The first mutation (divisor change) produced `assert 80.0 == 90.0` (red); the second mutation (cap removal) produced `2 passed` (green).
  - Per the tier-gating rule (Tier 2: any unguarded criterion auto-escalates Gate 3 to `needs-human`, regardless of how many other criteria are guarded), the single unguarded criterion above forces this gate's verdict to `needs-human` even though the percentage criterion is solidly guarded.

### Gate 4 — Regression

- **verdict:** pass
- **evidence:**
  - Suite run output / CI link:

    ```
    $ python -m pytest -q
    ..                                                                       [100%]
    2 passed in 0.00s
    ```

    (fixture confirmed byte-identical to its committed state via `git diff --exit-code discount.py` — no diff — immediately before this run; see Gate 3 for the mutation runs this final run follows.)
  - **selection-basis:** full suite — both tests in `test_discount.py` (`test_applies_percentage`, `test_zero_percent_is_full_price`) ran; the fixture's entire test suite is these two tests, so "full suite" and "every test that exists for this changeset" coincide here. No tool-selected subset was used.
  - Pass/fail outcome: pass — `2 passed`, no failures.

## 3. Synthesis

- **Overall verdict:** needs-human — Gate 1 is `pass`, Gate 2 is `abstain (no-baseline)`, Gate 4 is `pass`, but Gate 3 is `needs-human` (its Tier 2 unguarded-criterion auto-escalation). Per the gate-ordering rule, a changeset is "reviewed" only when every mandatory gate for its tier is `pass`, or a human has explicitly accepted a non-pass verdict; Gate 3's `needs-human` has not yet been accepted by a human, so the overall verdict is driven down to `needs-human` even though Gate 1 confirmed intent and Gate 4 confirmed regression safety.
- **What the human must personally verify:**
  - The one thing the human must verify: **is leaving the 50% cap untested acceptable?** — fault injection (Gate 3) proved that removing the `percent <= 50 else 50` clamp entirely leaves the full test suite green (`2 passed`); no test currently exercises any `percent > 50` input, so a future regression that silently drops the cap would ship undetected. The human must decide whether to accept this gap as-is or require a guarding test (e.g. `apply_discount(100.0, 75.0) == 50.0`) before treating this changeset as reviewed.
  - Confirm the Gate 2 abstention is appropriate: no architecture reference exists for this fixture, so the single structural fact (a pure function, no cross-boundary calls) was left `unjudged (no-baseline)` rather than approved. If an architecture reference is later supplied for this codebase, Gate 2 should be re-run against it.
  - Tier 2 requirement: named human confirmation is required for every gate verdict marked `pass` — Gate 1 (`pass`) and Gate 4 (`pass`) both require this confirmation before the changeset can be considered reviewed, even though the overall verdict is already `needs-human` on Gate 3's grounds alone.

## 4. What this review does NOT establish

*(Required. A review that cannot honestly fill this in is not complete.)*

- **Shared-blind-spot residue:** neither the author-AI (Task 5, which wrote `discount.py` and its tests) nor this reviewer-AI considered negative-price or negative-percent inputs (e.g. `apply_discount(-10.0, 10.0)` or `apply_discount(100.0, -20.0)`). The stated requirement ("apply the given percentage discount, capped at 50%") says nothing about valid ranges for `price` or `percent`, and both AIs reconstructed/implemented behavior only for the "normal" positive-value case implied by the two existing tests. This is a shared blind spot precisely because it sits outside what either AI's context (author's task, reviewer's diff-plus-criteria) prompted either of them to consider — it would need a human or a separate spec pass to surface.
- **Downgraded/abstained gates:** Gate 2 ran in `abstain (no-baseline)` mode — no stated architecture reference exists for this fixture, so its one structural fact (a single pure function, no cross-boundary calls) was recorded as unjudged rather than approved or rejected, per the rule that Gate 2 must never infer a baseline from surrounding code.
- **Unguarded criteria:** the "caps the discount at 50%" criterion has no guarding test — this is the same finding as Gate 3's `unguarded-paths` above: removing the `percent <= 50 else 50` clamp entirely leaves the full suite green (`2 passed`), because neither existing test ever passes a `percent` value above 50.
- **Regression selection basis:** the Gate 4 green signal (`2 passed`) came from the **full suite**, not a tool-selected affected subset — both tests that exist for this fixture were run. This is a sound signal by Gate 4's own criteria, but it is still bounded by what tests exist: the full suite being green says nothing about the missing percent>50 test noted above, since that test simply does not exist to be run.
