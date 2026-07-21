<!-- Thanks for contributing to Assay. Keep the PR focused; unrelated changes belong in their own PR. -->

## What & why

<!-- What does this change do, and why? Link any related issue: Closes #123 -->

## How it was verified

- [ ] `npm run build` passes (from `engine/`)
- [ ] `npm test` passes (unit + deterministic golden)
- [ ] Integration tests run? (state environment, or N/A)

<!-- Paste the relevant test output or summarize it. -->

## Checklist

- [ ] Behavior changes ship with a test that would fail if the behavior regressed
- [ ] Gate names / verdicts / tiers / artifact field names match the methodology verbatim
- [ ] Docs updated if user-facing behavior or the CLI changed
- [ ] Commit messages follow `type: summary`
