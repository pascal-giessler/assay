# Assay — Design System

## Theme

**Dark, on a warm-tinted charcoal base.** Scene: a staff engineer triaging
AI-authored PRs beside a dark IDE, scanning verdicts. Dark is chosen because the
product's core signal is *red/green fault-injection* plus four semantic verdict
colors — those data colors are most legible and most arresting on a low-lightness
tinted ground, and the surface stays calm so the exceptions pop. Not pure black:
a slightly warm charcoal so the gold accent reads as metal, not neon.

## Color

Tinted-neutral base + a reserved semantic palette. Colors are roles, not
decoration.

| Role | Value (approx) | Use |
|------|----------------|-----|
| `--bg` | `#14130f` (warm near-black) | app background |
| `--surface` | `#1c1b16` | raised panels, table rows |
| `--surface-2` | `#24221b` | hover, nested emphasis |
| `--line` | `#33302733` → solid `#3a3730` | hairline borders |
| `--ink` | `#efece3` | primary text |
| `--ink-dim` | `#a8a496` | secondary text |
| `--ink-faint` | `#6f6c60` | tertiary / captions |
| `--gold` | `#c8a24a` | brand accent, ≤10% of surface, reserved for the mark, key rules, and focus |
| `--pass` | `#5fb87a` | verdict `pass`, guarded (mutation caught) |
| `--fail` | `#d16a5a` | verdict `fail` |
| `--human` | `#e0a63c` | verdict `needs-human` — the routing signal (aligns with brand gold family, deliberately) |
| `--abstain` | `#7d8794` | verdict `abstain` / no-baseline |
| `--unguarded` | `#d16a5a` | an unguarded criterion (green-on-mutation) — rendered in the fail hue because a hidden gap is the danger |

Greens are muted (not #0f0); the palette is desaturated toward "metal and ember"
so no single verdict screams unless it should. `needs-human` (amber) is the most
common actionable verdict and shares the brand's gold family on purpose — the
product routes attention there.

## Typography

- **UI / body:** a geometric-humanist sans (system stack: `ui-sans-serif,
  Inter, "Segoe UI", …`).
- **Evidence / code / verdict tokens:** a mono (`ui-monospace, "JetBrains Mono",
  …`) — verdicts and fault-injection results read as machine output.
- Scale steps ≥1.25. Hierarchy from weight + scale, not color. Body measure
  65–75ch. Verdict labels are small-caps mono with letter-spacing.

## Layout

- The four gates render as a **vertical sequence** (a stepped rail, 1→2→3→4),
  not an identical card grid — the order is meaningful.
- A top summary band carries tier + overall verdict + the single human decision.
- Gate 3 (Test Adequacy) is the visual anchor: its guarding-test table is the
  hero, with the unguarded row emphasized.
- The "What this review does NOT establish" section is a distinct, weighted block
  at the end — bordered, not a throwaway footer.
- Vary spacing; avoid uniform padding. No nested cards. No side-stripe accents.

## Elevation & motion

- Elevation via low-lightness surface steps + hairline borders, not drop shadows.
- Motion only on reveal/hover, ease-out (quart/expo), no bounce. Never animate
  layout properties.

## Bans (from impeccable, enforced here)

No gradient-clipped text, no identical pastel card grids, no side-stripe borders,
no modal-first patterns, no em dashes in copy.
