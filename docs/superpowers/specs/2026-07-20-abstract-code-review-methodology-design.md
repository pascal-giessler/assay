# Abstract Code Review Methodology — Design

**Date:** 2026-07-20
**Status:** Draft for review
**Deliverable of this document:** a methodology (process + artifact definition), not tooling. A later phase may implement it as an MCP server, a Claude Code command, or a human checklist; the methodology is written to be executable by any of the three without changing its rules.

## Problem

AI now writes most of the code in a changeset. The scarce, expensive resource has shifted from *writing* to *reviewing*, and line-by-line diff reading is both the bottleneck and the wrong altitude: a diff shows syntax, not flow, and rewards checking that the code is well-formed over checking that it does what was asked. The judgment worth a human's attention is:

1. **Intent conformance** — does the change do what the requirement (or intended flow) says?
2. **Architecture fit** — does the change belong in the structure, or does it silently introduce a new pattern/dependency/responsibility?
3. **Test meaning + regression** — do the tests actually pin down the new behavior (would they fail if it broke?), and is nothing existing broken?

This methodology defines *how a review establishes those three things with evidence*, at an abstraction above the diff but with enough detail to act on.

## Non-goals

- Not a linter, style checker, or line-level bug finder — those layers already exist and are assumed to run separately.
- Not a replacement for CI. CI proves the suite *passes*; this methodology proves the tests are *meaningful* and, in spec mode, that the change *matches the stated intent* (in inference mode it elicits intent for a human to confirm rather than asserting a match).
- Not a guarantee of correctness. See "What this review does NOT establish."

## Core model

**Unit of review:** a **changeset** — a branch/PR-sized diff.

**Reviewer:** an **independent reviewer** given only the diff, the requirement source (if any), and the test results — **never** the conversation, prompt, or agent session that produced the code. Its task is not to read the code line-by-line but to **reconstruct what the change actually does from evidence** and run that reconstruction through a sequence of gates.

**Two framing inputs**, both stated at the top of every artifact:

- **Requirement mode.**
  - *Spec mode* — a ticket / spec / acceptance criteria exists; the review verifies the change against it.
  - *Inference mode* — no spec exists; the review reconstructs intent and requires a human to confirm it (see Gate 1).
- **Risk tier** — assigned per changeset from a semantic blast-radius checklist (see Risk Tiering), deciding review depth and which gates are mandatory.

### What independence does and does not do

Separating the reviewer's *context* from the author's defeats **self-justification**: a fresh reviewer cannot inherit rationalizations it never heard, and reconstructing intent from evidence alone surfaces intent-drift naturally.

It does **not** defeat **shared blind spots**. The author-AI and the reviewer-AI draw on the same training distribution, so a requirement-implication that both would miss — a concurrency edge, an unhandled locale, an unstated invariant — survives the review. The methodology's purpose is to *narrow* what escapes down to that shared-ignorance residue and to make the residue **visible** (see Section: "What this review does NOT establish"), not to pretend it is zero. Any claim that an independent AI reviewer makes AI code "safe" is overclaiming and is out of scope for this design.

## The gates

A review is an ordered pass through gates. Each gate emits a verdict — `pass` / `fail` / `needs-human` / `abstain` — **plus required evidence**. A verdict without its evidence is invalid. A changeset is "reviewed" only when every *mandatory* gate for its tier is `pass`, or a human has explicitly accepted a non-pass verdict.

### Gate 1 — Intent Match

**Spec mode.** The reviewer writes a from-scratch reconstruction of the change's behavior — the user-visible / domain flows as prose plus a flow diagram — then diffs the reconstruction against the acceptance criteria, listing each criterion as **met / not met / not addressed**.
*Evidence:* the reconstruction, the flow diagram, the criterion-by-criterion table.

**Inference mode → renamed "Intent Elicitation."** Reconstructing intent from the diff and then checking the diff against that reconstruction is circular — the code always matches the intent inferred from the code. Therefore this gate produces **no `pass` verdict**. Its sole output is a stated *inferred intent* for a human to confirm or correct, and it is `needs-human` by definition until they do. The methodology explicitly refuses to present this as a passed check; doing so would manufacture false confidence exactly where requirements are weakest.
*Evidence:* the inferred-intent statement, the reconstructed flows, the explicit "confirm or correct" request.

### Gate 2 — Architecture Conformance

Checks the change against a **stated** architecture reference — a module-boundary doc, dependency policy, or ADRs. Names any new seams, cross-boundary calls, new dependencies, or responsibilities added to already-large units.

**If no architecture reference exists,** the gate does **not** infer "the existing pattern" from surrounding code — inferred conventions merely ratify existing drift, so the gate would bless the tenth violation of a rule because the previous nine made it look normal. Instead it emits **`abstain` (`no-baseline`)**, lists the structural changes as *unjudged*, and may propose a boundary rule worth adopting. Honest abstention beats false blessing.
*Evidence:* list of structural changes, each tagged `fits existing pattern` / `new pattern — justified? y/n` / `unjudged (no baseline)`.

### Gate 3 — Test Adequacy

Proves the tests are **meaningful**, which is distinct from "tests pass" (Gate 4's job).

Reading a test and asserting "this would catch a regression of criterion X" is plausible-but-unverifiable reasoning that AI generates easily and wrongly. The only sound proof is **fault injection**: for the criteria that matter, mutate the behavior (flip the guard, break the default, swap the operator) and confirm that a test actually goes **red**. A criterion whose mutation leaves the suite green is an **unguarded criterion** and is reported as such.

Fault injection is expensive, so it is **tier-gated** (see Risk Tiering). Where it is *not* run, the gate's claim is explicitly downgraded to "tests *plausibly relate* to the criterion" — never "tests are meaningful." The strong claim requires the strong evidence.
*Evidence:* criterion → guarding-test table with the injected fault and the observed red/green result; an explicit **unguarded-paths list**.

### Gate 4 — Regression

Records the CI / affected-suite result rather than re-deriving it.

Computing the *truly* affected test set from a diff is unsound in general (dynamic dispatch, dependency injection, reflection, integration seams). The gate therefore states its **selection basis** so the human knows the strength of the green: `full suite` (sound, slow) or `tool-selected affected subset (unsound — may miss integration seams)`.
*Evidence:* suite run output / CI link, the selection basis, pass or fail.

## Risk tiering

Assigned **before** the gates run. Keyed off **semantic blast radius, not diff size** — the most dangerous changes (a flipped boolean, a removed guard, a changed default) are often the smallest.

A change escalates when it touches **any** of:

- a guard / branch condition
- a default value or constant
- a public or shared contract / signature
- auth or permission logic
- a data migration or schema change
- money / quantity / unit arithmetic
- a concurrency or transaction boundary

**Tiers:**

- **Tier 0 — Mechanical.** Touches none of the above and is confined to formatting, renames, dependency bumps, or generated files. Gates 2–3 skipped; Gate 1 collapses to a one-line intent statement; Gate 4 mandatory. The artifact *replaces* code reading and collapses to near-nothing.
- **Tier 1 — Standard.** Feature code touching none of the blast-radius items. All four gates mandatory; Gate 3 fault injection optional (claim downgraded if skipped). The artifact is a **map for selective reading** — Gate 1 points the human at the 2–3 files carrying the real decisions.
- **Tier 2 — Critical.** Touches any blast-radius item. All gates mandatory; **Gate 3 fault injection required**; every `pass` requires a named human confirmation; any unguarded criterion from Gate 3 auto-escalates to `needs-human`.

The checklist is deterministic and stated so a human or a tool applies it identically every time. Diff size only ever *lowers* effort — never raises confidence.

## The artifact

One artifact per changeset:

1. **Header** — requirement mode, risk tier, changeset id.
2. **Gate sections** — Gates 1–4, each with verdict + required evidence.
3. **Synthesis** — overall verdict and the specific things the human must personally verify.
4. **What this review does NOT establish** (required; see below).

## The human's job

The human's role shifts from "read the diff" to "**adjudicate the gates**": confirm intent where Gate 1 flags it, accept or reject architecture deviations (or supply the missing baseline for Gate 2), and decide whether the unguarded-paths list from Gate 3 is acceptable. The methodology is deliberately generator-agnostic so the same adjudication works whether the artifact was produced by a human, a command, or an MCP server.

## Cost honesty

On Tier 0/1 changes, generating and reading a multi-section artifact can cost more attention than reading the tight diff would have. The methodology earns its keep on **Tier 2** and on changes where intent is non-obvious. For mechanical changes the artifact collapses to near-nothing by design. If artifact generation ever costs more attention than it saves at a given tier, that tier should drop the artifact. The methodology is a tool, not a ritual.

## What this review does NOT establish

A **required** closing section of every artifact, listing for this specific changeset:

- **Shared-blind-spot residue** — the review cannot catch requirement-implications that both the author-AI and reviewer-AI would miss.
- **Downgraded/abstained gates** — any gate that ran in `abstain`, `no-baseline`, or downgraded-claim mode, and why.
- **Unguarded criteria** — behaviors from Gate 3 with no test that fails when they break.
- **Regression selection basis** — whether the green signal came from the full suite or an unsound affected-subset.

This section is the mechanism that converts hidden holes into eyes-open, signed-off tradeoffs. A review that cannot honestly fill it in is not complete.

## Market positioning (2026 landscape)

Market research confirms the *combination* this methodology defines is unoccupied, even though each pillar exists somewhere individually. The four capabilities and their incumbents:

- **Intent conformance (Gate 1)** — crowded. Qodo Merge, Greptile, Panto, One Horizon, and Aviator Verify all check a diff against a linked ticket. **But every one treats the ticket as ground truth and checks code against it.** None do the *blind reconstruction* this methodology specifies (reconstruct intent from diff + tests *without* the author's prompt, then compare to the spec to surface divergence). CodeRabbit is closest in language but explicitly reconstructs "how the author would explain it" — i.e., it adopts the author's framing rather than being blind to it.
- **Test meaning via fault injection (Gate 3)** — a clean gap. Mutation-testing engines exist (Stryker for JS/TS, PIT for Java, mutmut / Cosmic Ray for Python) and the 2026 consensus is they should run diff-scoped at PR time, but **no code-review product integrates mutation/fault-injection as a native gate.** Qodo *generates* missing tests but never proves they would fail on a mutant. Test-impact-analysis tools (Datadog, Azure, Parasoft) select affected tests *for speed*, which is orthogonal to proving tests are meaningful.
- **Semantic blast-radius tiering (Risk Tiering)** — exists only internally or as adjacent primitives. Meta's internal RADAR is the strongest published match (LLM semantic change classification feeding a risk score) but tiers for *auto-approval throughput*, not to route human attention by semantic category. Baz's AST breaking-change detection covers the *contract* slice only.
- **Independence** — validated as a real need but under-implemented. In the market "independence" means *different vendor*, not *blinded from the author's prompt*. The blind-reconstruction form here is a stronger independence than anyone ships.

**Wedge:** lean on the two genuinely open pillars — **fault-injection as the Test-Adequacy gate** (no review product does this) and **blind intent reconstruction** (stronger than vendor-separation). Intent-conformance and blast-radius tiering have partial incumbents, so they are table stakes rather than differentiators. An MCP-server delivery is viable and uncrowded: existing code-review MCP servers are all thin LLM-over-diff wrappers with none of these four capabilities.

**Demand signals.** Qodo's 2025 research found **65% of developers rank missing context as the biggest problem with AI-generated code — above hallucinations**; "noise-to-signal ratio" is repeatedly cited as the metric that predicts whether an AI review tool gets kept or disabled; and multiple sources report that high line coverage masks low *behavioral* coverage on AI-generated code (the direct case for a mutation gate). A January 2026 study ("More Code, Less Reuse") measured that agent-generated PRs carried ~2x redundancy yet drew *fewer* negative reviewer reactions than human PRs — a measured reviewer blind spot that validates both the independence and the "what this review does NOT establish" premises.

> **Citation caveat.** The specific URLs, figures, and the RADAR arXiv id in the research above were gathered by an automated agent and are **not yet independently verified**. Treat the *direction* (genuine gap, two open pillars, real demand) as well-supported by convergent evidence, but verify individual numbers and sources before using any of them in external/marketing material.

## Open questions for later phases

- Fault injection (Gate 3) presumes a runnable test suite and a way to apply mutations; the tooling phase must decide whether to lean on existing mutation-testing frameworks (Stryker/PIT/mutmut) or a lighter targeted-mutation approach.
- The architecture reference (Gate 2) presumes such a document exists; teams without one get `abstain` until they write one. Whether the methodology should help *bootstrap* that reference is out of scope here.
