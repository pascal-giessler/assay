# Abstract Code Review Methodology — Kit

This kit turns the approved methodology design into documents a human (or a
tool built to the same rules) can pick up and run. It is **not** tooling — it
is a documentation kit: a checklist, a set of reviewer instructions, and a
fill-in artifact template, plus one worked example that exercises all of it
end to end.

**Source of truth:** [`../specs/2026-07-20-abstract-code-review-methodology-design.md`](../specs/2026-07-20-abstract-code-review-methodology-design.md).
If anything in this kit and the spec disagree, the spec wins — file names,
gate names, verdict vocabulary, and tier definitions are all copied from it
verbatim.

## The artifacts

| # | Artifact | Purpose |
|---|----------|---------|
| 1 | [`blast-radius-checklist.md`](./blast-radius-checklist.md) | Deterministic procedure that assigns every changeset to exactly one risk tier (Tier 0 Mechanical / Tier 1 Standard / Tier 2 Critical). |
| 2 | [`reviewer-instructions.md`](./reviewer-instructions.md) | Gate-by-gate operating procedure for Gate 1 Intent Match (renamed "Intent Elicitation" in inference mode), Gate 2 Architecture Conformance, Gate 3 Test Adequacy, and Gate 4 Regression — what the reviewer is given, the exact steps, the possible verdicts, and the required evidence for each. |
| 3 | [`artifact-template.md`](./artifact-template.md) | The fill-in structure a reviewer completes per changeset: Header, Gate sections, Synthesis, and "What this review does NOT establish." |

A worked example that fills in the template end to end for a real (small,
fixture) change lives under [`examples/`](./examples/).

## Reviewer's order of operations

A reviewer applies these artifacts in one fixed order:

1. **Assign tier** — run the changeset through `blast-radius-checklist.md` to get Tier 0, 1, or 2. This decides which gates below are mandatory and how deep Gate 3's fault injection must go.
2. **Run gates** — follow `reviewer-instructions.md` in gate order (Gate 1 → Gate 2 → Gate 3 → Gate 4), producing a verdict (`pass` / `fail` / `needs-human` / `abstain`, with `no-baseline` as Gate 2's abstain sub-reason) plus required evidence for each mandatory gate.
3. **Fill template** — transcribe the header, gate verdicts, evidence, Synthesis, and the "What this review does NOT establish" section into `artifact-template.md` to produce the final review artifact for the changeset.

Field names are shared across steps 2 and 3 so nothing is re-derived: `verdict`,
`evidence`, and the per-gate specifics (Gate 1 `criterion-table`; Gate 3
`guarding-test-table` + `unguarded-paths`; Gate 4 `selection-basis`) mean the
same thing in the instructions and in the template.

## Definition of done for this kit

This kit is complete only when all of the following are true:

- [x] `blast-radius-checklist.md` exists and its three worked mini-examples resolve to the tiers they claim.
- [x] `reviewer-instructions.md` exists and covers all four gates, both Gate 1 requirement modes, the Gate 2 `abstain`/`no-baseline` path, and the Gate 3 fault-injection loop.
- [x] `artifact-template.md` exists with labelled slots for every required section and sub-item from the spec's "The artifact" section.
- [x] A worked example under `examples/` fills in the template end to end for a real (fixture) change, exercising `pass`, `needs-human`, and `abstain` verdicts.
