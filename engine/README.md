# Assay

**Independent review that proves your tests.**

Assay is an automated code-review engine that runs an abstract, four-gate review
methodology against a changeset and produces a review artifact (markdown) plus
a self-contained HTML report. Its signature move: an *assay* determines how much
real precious metal is in ore that looks valuable on the surface — Assay breaks
your code and watches whether a test actually goes red, revealing how much of a
green suite's "coverage" is real. It is the tooling implementation of the
methodology in [`../docs/superpowers/methodology/`](../docs/superpowers/methodology/)
and the spec in
[`../docs/superpowers/specs/2026-07-20-review-engine-vertical-slice-design.md`](../docs/superpowers/specs/2026-07-20-review-engine-vertical-slice-design.md).

This is the **vertical slice**: it targets **Python + pytest** repositories and
ships a **CLI** adapter. Other adapters (CI, MCP, a Claude Code skill) and other
language ecosystems are planned fast-follows that reuse the same core.

## What it does

For a changeset it runs four gates and records a verdict + evidence for each:

| Gate | Name | Kind | What it establishes |
|------|------|------|---------------------|
| 1 | Intent Match | judgment | Reconstructs what the change does *from evidence alone* (no authoring context), then compares to the requirement. In *inference mode* (no spec) it only elicits intent for a human — never auto-passes. |
| 2 | Architecture Conformance | judgment | Abstains (`no-baseline`) in this slice — real conformance needs a stated architecture reference (fast-follow). |
| 3 | Test Adequacy | mechanical | **Fault injection**: mutates the source per criterion, runs the suite. A test going red means the criterion is *guarded*; a suite staying green means it is *unguarded* — a gap the coverage number hides. |
| 4 | Regression | mechanical | Runs the suite and records pass/fail + selection basis. |

The risk **tier** (0/1/2) is assigned first by a conservative blast-radius
heuristic and decides review depth. The artifact ends with a required
"What this review does NOT establish" section.

All target-touching work runs inside a **Docker sandbox**: test runs and
mutations get **no network**; only the Gate 1 `claude -p` judgment call gets
network. The host repository is never mutated, and the engine refuses to emit a
result unless the working tree is byte-identical after fault injection.

## Prerequisites

- **Node ≥ 20** and **npm** — to build and run the engine.
- **Docker** — the engine runs all target execution in a container.
- **A sandbox image** containing Python + pytest + the `claude` CLI (see below).
- **`ANTHROPIC_API_KEY`** — only needed for the Gate 1 judgment call (the live
  path). The mechanical gates and all unit tests do not need it.

## Setup

```bash
cd engine
npm install
npm run build          # compiles TypeScript to dist/ (bin: dist/cli/index.js)
npm link               # optional: puts the `assay` command on your PATH
```

Without `npm link`, invoke the CLI as `node dist/cli/index.js` in place of
`assay` in the examples below.

### Build the sandbox image

The engine defaults to the image `review-engine-python:latest`. Build it from
the provided Dockerfile (Python + pytest + Node + the Claude Code CLI):

```bash
# from the repo root
docker build -t review-engine-python:latest engine
```

Override the image name with the `REVIEW_SANDBOX_IMAGE` environment variable if
you build or tag it differently.

## Usage

Run a review over a git range in a target repo:

```bash
assay <base>..<head> \
  --workdir /path/to/target/repo \
  --test-cmd "python -m pytest -q" \
  --spec requirement.txt \
  --format html \
  --out review.html
```

Options:

| Option | Meaning |
|--------|---------|
| `<base>..<head>` | git range to review (positional) |
| `--workdir <dir>` | the target repo (where source lives and tests run); default `.` |
| `--test-cmd "<cmd>"` | how to run the suite, e.g. `python -m pytest -q` |
| `--spec <file>` | requirement/acceptance-criteria file → **spec mode**. Omit for **inference mode**. |
| `--format md\|html` | output format; `md` (default) or a self-contained HTML report |
| `--out <path>` | write to a file; omit to print to stdout |

Environment:

| Variable | Meaning |
|----------|---------|
| `REVIEW_SANDBOX_IMAGE` | sandbox image to use (default `review-engine-python:latest`) |
| `ANTHROPIC_API_KEY` | forwarded into the Gate 1 judgment call only |

View a generated HTML report locally:

```bash
assay serve --report review.html --port 8080
```

## Testing

```bash
npm test          # unit + deterministic golden tests (no Docker, no API key)
npm run build     # type-check / compile
```

The unit suite is fully hermetic — sandbox, model, mutator, and test-runner are
all stubbed. The **deterministic golden test** (`test/golden.e2e.test.ts`) runs
the *real* triage, fault-injection, and regression logic (only the judgment gate
is stubbed) and asserts the engine reproduces the validated worked example in
`../docs/superpowers/methodology/examples/2026-07-20-discount-review.md`.

Two integration tests are **environment-gated** and skip unless their
prerequisites are present:

```bash
# Docker sandbox smoke test (needs Docker running)
RUN_INT=1 npx vitest run test/docker.int.test.ts

# Full live golden: real Docker + claude -p on the discount fixture
# (needs Docker, ANTHROPIC_API_KEY, and the sandbox image built)
RUN_INT=1 npx vitest run test/golden.live.int.test.ts
```

## Architecture

```
CLI adapter ─┐
             ├─> core: loadChangeset → runReview (driver) ─┬─ triage (mechanical)
MCP/CI/Skill ┘                                             ├─ Gate 1 intent  (judgment → JudgmentRunner)
 (fast-follow)                                             ├─ Gate 2 architecture (abstain in slice)
                                                           ├─ Gate 3 fault-injection (Mutator + TestRunner, via Sandbox)
                                                           └─ Gate 4 regression (TestRunner, via Sandbox)
                                                              → assembleArtifact (markdown) → renderReport (HTML)
```

Key seams, all injectable (which is why the engine is testable without Docker or
a model):

- **`Sandbox`** (`src/sandbox/`) — `DockerSandbox` runs commands in a container;
  `StubSandbox` for tests.
- **`JudgmentRunner`** (`src/judgment/`) — `HeadlessClaudeRunner` shells out to
  `claude -p`; `StubJudgmentRunner` for tests. The engine holds no model
  credentials of its own.
- **`Mutator` / `TestRunner`** (`src/faultinject/`) — `PythonSourceMutator` /
  `PytestRunner` for the Python target; swap these to add a language.

## Known limitations (fast-follows)

- **Triage is a conservative heuristic**, biased to over-tier (safe, since
  over-tiering only adds review). A judgment-backed triage is the main planned
  improvement.
- **Gate 2 always abstains** — real architecture conformance needs a baseline
  mechanism.
- **Mutations are applied to the mounted host workdir** (then restored, and the
  engine refuses to emit unless the tree is verified clean). A container-side
  copy is a planned hardening.
- **Per-tier gate mandatoriness is not yet enforced** — all gates run at every
  tier (correct outcomes, extra work at Tier 0/1).
- Only **Python + pytest** and the **CLI** adapter are implemented.
