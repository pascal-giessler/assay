# Getting started with Assay

**Independent review that proves your tests.**

This is a hands-on walkthrough. In ~10 minutes you'll install Assay, watch it
reproduce a validated review with no external services, then run it for real
against a repository. For the full reference (every flag, the architecture,
limitations) see [README.md](README.md).

---

## What Assay does, in one breath

You give it a changeset. It assigns a **risk tier**, then runs four gates and
records a verdict + evidence for each:

1. **Intent Match** — reconstructs what the change *does* from the diff and tests
   alone (no authoring context), then compares it to your requirement.
2. **Architecture Conformance** — abstains here unless you supply an architecture
   baseline (planned).
3. **Test Adequacy** — the wedge: it **breaks the code on purpose** and watches
   whether a test goes red. A test that stays green means that behavior is
   *unguarded* — a gap your coverage number hides.
4. **Regression** — runs the suite and records the result.

You get a markdown artifact and an HTML report, ending with a required
"**What this review does NOT establish**" section — the honest limits of the run.

Everything that touches the target repo runs in a **Docker sandbox** (tests with
no network; only the intent call gets network), and the host repo is never
mutated.

---

## Step 0 — Prerequisites

- **Node ≥ 20** and **npm**
- **Docker** (running)
- An **Anthropic API key** — only for the live intent gate. You can do Step 2
  with no key.

Check:

```bash
node --version && docker --version
```

---

## Step 1 — Install and build

```bash
cd engine
npm install
npm run build     # compiles to dist/ (bin: dist/cli/index.js)
npm link          # optional: puts the `assay` command on your PATH
```

> Skipping `npm link`? Use `node dist/cli/index.js` wherever you see `assay`.

---

## Step 2 — See it work, with nothing external (no Docker, no key)

Assay ships a **deterministic golden test**: it runs the real triage,
fault-injection, and regression logic against a fixture with a deliberate
coverage gap, and asserts the engine reproduces a hand-validated review.

```bash
npm test
```

You should see `27 passed | 2 skipped`. The two skips are the environment-gated
integration tests (Step 4). The golden test proves the core claim: the fixture's
test suite is green, but Assay's fault injection surfaces an **untested 50% cap**
and escalates the review to `needs-human` — exactly what a human reviewer would
want flagged and what a coverage percentage would not show.

Open [`../docs/superpowers/methodology/examples/2026-07-20-discount-review.md`](../docs/superpowers/methodology/examples/2026-07-20-discount-review.md)
to read the review the engine reproduces.

---

## Step 3 — Build the sandbox image

The live path runs tests and the intent call inside a container that has Python +
pytest + Node + the `claude` CLI. Build it once:

```bash
# from the repo root (one level up from engine/)
docker build -t review-engine-python:latest engine
```

Tagged something else? Point Assay at it with `REVIEW_SANDBOX_IMAGE`.

---

## Step 4 — Run a real review

Assay reviews a **git range** in a target repository. You provide the range, how
to run the tests, and (optionally) the requirement the change should satisfy.

```bash
export ANTHROPIC_API_KEY=sk-ant-...

assay <base>..<head> \
  --workdir /path/to/your/repo \
  --test-cmd "python -m pytest -q" \
  --spec requirement.txt \
  --format html \
  --out review.html
```

- **`--spec requirement.txt`** puts Assay in *spec mode* — it checks the change
  against your stated acceptance criteria. Omit it for *inference mode*, where
  Assay reconstructs the likely intent and hands it to you to confirm (it never
  auto-approves an inferred intent).
- **`--format md`** (default) prints/writes markdown instead of HTML.
- Omit **`--out`** to write to stdout.

Then browse the report:

```bash
assay serve --report review.html --port 8080
# open http://localhost:8080
```

### Reading the result

The report leads with the tier and each gate's verdict. Focus on two things:

- **Gate 3's `unguarded-paths`** — behaviors with no test that fails when they
  break. These are your real coverage gaps.
- **"What this review does NOT establish"** — what Assay could *not* verify (a
  shared blind spot, an abstained gate, the regression selection basis). Assay is
  deliberate about not overclaiming.

A verdict of `needs-human` is not a failure — it's Assay routing your attention
to the decision only a person should make.

---

## Step 5 (optional) — Prove the whole live path end-to-end

Run the environment-gated live golden against the bundled fixture. It exercises
the real Docker sandbox **and** a real `claude -p` intent call:

```bash
RUN_INT=1 ANTHROPIC_API_KEY=sk-ant-... \
  npx vitest run test/golden.live.int.test.ts
```

It asserts that, on a repo whose suite is green, Assay still surfaces the
unguarded 50% cap. This is the same claim as Step 2, now proven through the full
live stack instead of stubs.

---

## Where to go next

- **Reference:** [README.md](README.md) — full CLI, architecture, and the
  injectable seams (`Sandbox`, `JudgmentRunner`, `Mutator`/`TestRunner`).
- **The methodology behind the gates:**
  [`../docs/superpowers/methodology/`](../docs/superpowers/methodology/).
- **Design decisions and scope:**
  [`../docs/superpowers/specs/2026-07-20-review-engine-vertical-slice-design.md`](../docs/superpowers/specs/2026-07-20-review-engine-vertical-slice-design.md).

### Good to know

- This is the **Python + pytest** slice with a **CLI**. Other languages and
  adapters (CI, MCP, a Claude Code skill) are planned and reuse the same core.
- **Triage is conservative** — it errs toward a higher tier (more review), never
  false confidence.
- Assay reviews AI-written code without sharing the author's context, but it
  cannot catch a mistake that both the author and the reviewer would miss — which
  is precisely why every report states what it does not establish.
