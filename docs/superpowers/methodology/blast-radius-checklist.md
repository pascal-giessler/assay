# Blast-Radius Triage Checklist

**Purpose:** deterministically map any changeset to exactly one risk tier — Tier 0 (Mechanical), Tier 1 (Standard), or Tier 2 (Critical) — *before* any review gate runs. Two independent readers applying this checklist to the same changeset must reach the same tier. This checklist is Step 1 of the reviewer instructions.

Risk is keyed off **semantic blast radius, not diff size**. The most dangerous changes (a flipped boolean, a removed guard, a changed default) are often the smallest.

---

## Determinism test (worked mini-examples)

Apply the procedure below to each of these before trusting it on real changesets. Each must resolve to the stated tier.

1. **Whitespace-only reformat.** A formatter re-indents a file and normalizes line endings; no token other than whitespace changes. → **Tier 0**
2. **New endpoint handler, no blast-radius touch.** A new `GET /widgets/:id/notes` handler is added. It is purely additive (no existing signature is changed or removed), reads from an existing repository method, returns plain data with no guard/branch logic beyond routing, introduces no new default/constant, performs no auth check (route sits behind existing middleware, unmodified), touches no migration or schema, does no money/quantity arithmetic, and opens no new transaction or concurrency boundary. → **Tier 1**
3. **Discount-cap constant change.** A one-line change edits `MAX_DISCOUNT_PERCENT = 20` to `MAX_DISCOUNT_PERCENT = 25`. This is simultaneously a default-value/constant change and money/quantity arithmetic input. → **Tier 2**

(Verification of these three against the procedure below is recorded in the task report; see `task-2-report.md`.)

---

## The 7 blast-radius items

A changeset touches the blast radius if it touches **any** of the following (verbatim):

- a guard / branch condition
- a default value or constant
- a public or shared contract / signature
- auth or permission logic
- a data migration or schema change
- money / quantity / unit arithmetic
- a concurrency or transaction boundary

**Note on "public or shared contract / signature":** this item is triggered by **changing or removing** an existing signature/contract that other code already depends on (parameters, return shape, route path, wire format, exported type). It is **not** triggered merely by the act of introducing a brand-new endpoint, function, or type that nothing yet depends on — a wholly new, purely additive surface has no existing caller to break. If the new surface changes an *existing* contract to make room for itself (e.g. widening a shared interface, changing an existing route's response shape), that edit is in scope and counts.

---

## Procedure

1. **Enumerate.** List every distinct change in the diff (files, hunks, symbols touched).
2. **Check against the 7 items.** For each change, ask: does it touch any of the 7 blast-radius items above? Use the note on contracts/signatures to resolve additive-vs-modifying ambiguity.
3. **Assign the tier** using this rule, in order:
   - **Touches ANY of the 7 items → Tier 2 — Critical.** One qualifying touch anywhere in the changeset is sufficient; the rest of the diff cannot dilute it.
   - **Touches NONE of the 7 items, but is feature code** (adds or changes behavior, even trivially) **→ Tier 1 — Standard.**
   - **Touches NONE of the 7 items, and is confined to** formatting, renames, dependency version bumps, or generated files **→ Tier 0 — Mechanical.**
4. **Diff size is not a factor in this decision.** A one-line change and a thousand-line change are triaged identically by this procedure. Diff size may only ever *lower* the effort spent once a tier is assigned (e.g. skimming a large but Tier-0 dependency-bump diff) — it may never *raise confidence* or justify downgrading a tier that a blast-radius touch would otherwise require.
5. **Record the result.** State the assigned tier and, for Tier 2, name the specific blast-radius item(s) triggered. This becomes the changeset's risk tier for all downstream gates.

---

## Verification of the determinism test

- **Example 1 (whitespace reformat):** No blast-radius item is touched (no logic, values, contracts, auth, migration, arithmetic, or concurrency changed). Not feature code — confined to formatting. → **Tier 0.** ✓ matches stated expectation.
- **Example 2 (new endpoint, no blast-radius touch):** By construction touches none of the 7 items (per the contract/signature note, a purely additive new route does not count). It is feature code (adds new user-visible behavior). → **Tier 1.** ✓ matches stated expectation.
- **Example 3 (discount-cap constant change):** Touches "a default value or constant" and "money / quantity / unit arithmetic" simultaneously — two qualifying items. → **Tier 2.** ✓ matches stated expectation.

All three examples resolve to their stated tier; no wording changes were required.
