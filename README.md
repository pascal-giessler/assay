<h1 align="center">Assay</h1>

<p align="center"><strong>Independent review that proves your tests.</strong></p>

<p align="center">
  <a href="https://github.com/pascal-giessler/assay/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pascal-giessler/assay/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

---

When AI writes most of the code, the bottleneck moves from writing to reviewing —
and line-by-line diff reading is the wrong altitude. Assay reviews a changeset at
the level that actually matters: **does it do what was asked, does it fit, and are
the tests meaningful?**

Its signature move is an *assay* in the original sense — the test that determines
how much real precious metal is in ore that looks valuable on the surface. A green
test suite looks like coverage; Assay **breaks your code on purpose and watches
whether a test goes red**, revealing how much of that coverage is real.

## How it works

Assay runs four gates over a changeset and records a verdict + evidence for each,
after assigning a risk **tier** by semantic blast radius:

| Gate | Establishes |
|------|-------------|
| **Intent Match** | Reconstructs what the change does *from evidence alone* (no authoring context), then compares to the requirement. |
| **Architecture Conformance** | Whether the change fits a stated architecture baseline (abstains when none exists). |
| **Test Adequacy** | **Fault injection** — mutates the source per criterion and checks a test actually goes red. Green-on-mutation = an *unguarded* behavior your coverage number hides. |
| **Regression** | Runs the suite and records the result and its selection basis. |

Every review ends with a required **"What this review does NOT establish"**
section — Assay is deliberate about not overclaiming. All target execution runs in
a **Docker sandbox** (tests with no network; only the intent call gets network),
and the host repository is never mutated.

## Repository layout

| Path | What's there |
|------|--------------|
| [`engine/`](engine/) | The TypeScript review engine + CLI. Start with [`engine/GETTING_STARTED.md`](engine/GETTING_STARTED.md). |
| [`docs/superpowers/methodology/`](docs/superpowers/methodology/) | The methodology the engine implements, with a validated worked example. |
| [`docs/superpowers/specs/`](docs/superpowers/specs/) | Design specs (methodology + engine vertical slice). |
| [`docs/superpowers/plans/`](docs/superpowers/plans/) | Implementation plans. |

## Quick start

```bash
cd engine
npm install
npm run build
npm test          # reproduces a validated review with no Docker or API key
```

Then follow [`engine/GETTING_STARTED.md`](engine/GETTING_STARTED.md) to build the
sandbox image and run a real review.

## Status

This is the **Python + pytest** vertical slice with a **CLI** adapter. Other
languages and adapters (CI, MCP, a Claude Code skill) are planned and reuse the
same core. Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Pascal Giessler
