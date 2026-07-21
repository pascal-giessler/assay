# Security Policy

## Reporting a vulnerability

Please report security issues privately — do **not** open a public issue.

Preferred: use GitHub's
[private vulnerability reporting](https://github.com/pascal-giessler/assay/security/advisories/new)
for this repository.

Alternatively, email **pmgiessler@googlemail.com** with:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if possible),
- any affected version or commit.

You can expect an initial acknowledgement within a few days. Please allow time
for a fix to be prepared and released before any public disclosure.

## Scope notes

Assay executes an untrusted target repository's test suite and mutates its source
during a review. It does this inside a Docker sandbox with the network disabled
for test/mutation steps, and only the intent call is granted network access. When
reporting, it is especially useful to flag anything that could:

- run target code outside the sandbox or with network access it should not have,
- leave the host working tree modified after a review, or
- expose the `ANTHROPIC_API_KEY` beyond the single judgment invocation.

## Supported versions

Assay is pre-1.0 and under active development. Security fixes are applied to the
`main` branch. Pin a commit if you need stability.
