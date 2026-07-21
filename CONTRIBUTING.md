# Contributing to Assay

Thanks for your interest in Assay. This guide covers how to get set up, the
standards the codebase holds itself to, and how to propose changes.

## Development setup

The engine lives in [`engine/`](engine/) and is a TypeScript/Node package.

```bash
cd engine
npm install
npm run build     # type-check + compile to dist/
npm test          # unit + deterministic golden tests (no Docker, no API key)
```

Integration tests are environment-gated and skip unless their prerequisites are
present:

```bash
# Docker sandbox smoke test (needs Docker running)
RUN_INT=1 npx vitest run test/docker.int.test.ts

# Full live path: real Docker + claude -p (needs Docker, ANTHROPIC_API_KEY,
# and the sandbox image: docker build -t review-engine-python:latest engine)
RUN_INT=1 ANTHROPIC_API_KEY=... npx vitest run test/golden.live.int.test.ts
```

## Standards

- **Test-driven.** Write the failing test first, watch it fail, implement the
  minimal code to pass. Every behavior change ships with a test that would fail
  if the behavior regressed.
- **Small, focused units.** Each file has one clear responsibility and a
  well-defined interface. The gates, sandbox, judgment runner, and mutator/test
  runner are all injectable seams — keep them that way so the engine stays
  testable without Docker or a model.
- **Vocabulary is exact.** Gate names, verdicts (`pass` / `fail` / `needs-human`
  / `abstain`), tiers, and artifact field names must match the methodology in
  [`docs/superpowers/methodology/`](docs/superpowers/methodology/) verbatim.
- **The suite must stay green** (`npm test`) and the build clean (`npm run
  build`) before you open a PR.

## Proposing changes

1. Open an issue describing the problem or proposal first for anything
   non-trivial, so the approach can be agreed before code is written.
2. Branch from `main`. Keep the change focused; unrelated refactors belong in
   their own PR.
3. Follow the existing commit style (`type: summary`, e.g. `feat:`, `fix:`,
   `docs:`, `test:`, `chore:`).
4. Ensure `npm run build` and `npm test` pass. Note in the PR whether you ran the
   integration tests and in what environment.
5. Open the PR against `main`. A code owner (see
   [`.github/CODEOWNERS`](.github/CODEOWNERS)) will be requested for review.

## Where to start

Good first contributions map to the documented fast-follows in
[`engine/README.md`](engine/README.md#known-limitations-fast-follows) — for
example a judgment-backed triage, a new language's `Mutator`/`TestRunner`, or a
CI/MCP adapter.

By contributing, you agree that your contributions are licensed under the
project's [MIT license](LICENSE).
