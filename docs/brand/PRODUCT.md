# Assay — Product Context

register: product

## Product purpose

Assay is a code-review engine for the era when AI writes most of the code. It
reviews a changeset at an abstract-but-actionable altitude — does it match
intent, does it fit the architecture, and *are the tests meaningful* — instead of
line-by-line diff reading. Its signature capability is **fault injection**: it
breaks the code on purpose and checks whether a test actually goes red, exposing
"coverage" that a green suite hides. Every review ends by stating what it does
**not** establish.

## Users

- **Staff / senior engineers and tech leads** triaging AI-authored pull requests.
  They are technical, skeptical of green checkmarks, and time-poor. They want to
  know, at a glance, *which changes need their judgment* and *where the tests
  lie*.
- **Reviewers in CI** who receive the artifact as a build output.

They read verdicts, not prose. A `needs-human` verdict is a routing signal, not a
failure.

## Brand & tone

- **Precise, earned, unshowy.** The brand metaphor is assaying — the rigorous
  test that reveals how much real metal is in ore that looks valuable. Confidence
  through evidence, never through reassurance.
- **Honest by construction.** The product's differentiator is that it refuses to
  overclaim; the UI must foreground limits, not bury them.
- Visual language: engineered, structural, a hallmark-stamp mark. Charcoal ink
  with a restrained assayer's-gold accent.

## Anti-references (avoid)

- Generic SaaS-review-tool look: cream backgrounds, rounded pastel cards in
  identical grids, a big gradient hero number, friendly blob illustrations.
- "Everything is fine" green-dominant dashboards. Assay's job is to surface the
  *not*-fine, so green must never dominate the surface.
- Anthropomorphized-AI cutesiness. This is an instrument, not an assistant
  persona.

## Strategic principles

1. **The verdict is the interface.** Tier and per-gate verdict must be the first
   thing read; evidence expands underneath.
2. **Elevate the gap.** Unguarded criteria and the "does NOT establish" section
   get real visual weight — they are the product's reason to exist.
3. **Red/green is data, not decoration.** The fault-injection outcome is the
   hero; its color carries meaning and must be reserved for it.
4. **Route attention.** The design should make "what must a human decide here"
   unmissable.
