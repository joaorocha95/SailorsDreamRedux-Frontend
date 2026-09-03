---
name: atelier-conventions
description: The Atelier design language for this client — tokens, typography, and the motion spec. Use whenever writing or editing a .vue component, any CSS, or any transition or animation in this repo.
user-invocable: false
---

# Atelier

The visual direction, chosen over two alternatives and recorded in [ROADMAP.md](../../../ROADMAP.md).
Editorial and light: navy as ink on a near-white ground, generous whitespace, large photography.

**Premium through restraint and scale, not density.** When a choice is between more information and
more room, take more room. A specification-dense treatment is wrong here — a listing has a name, a
description, a category, a type, one or two prices and up to eight photographs, and nothing else.
There are no lengths, years or berth counts to fill columns with.

## Tokens

Every colour, size, space and easing already exists in [tokens.css](../../../src/assets/tokens.css).
Read it before writing CSS; do not invent a value that is nearly one of these.

| Group | Tokens |
| --- | --- |
| Ink | `--ink` `--ink-mid` `--ink-soft` `--ink-faint` |
| Surfaces | `--ground` `--surface` `--wash` `--rule` `--rule-soft` |
| Semantic | `--positive` `--caution` `--critical` `--critical-wash` |
| Type | `--font-display` (Instrument Serif) `--font-body` (DM Sans) `--font-mono` (JetBrains Mono) |
| Scale | `--step--1` … `--step-4`, all fluid `clamp()` |
| Space | `--sp-1` … `--sp-8`, plus `--measure` (68ch) and `--page-max` (1120px) |

Serif for names and headings, sans for body, **mono for every price** — prices are figures to compare,
and a proportional font makes columns of them ragged.

### The theming rule that is easy to break

Define every colour on bare `:root` first. The dark blocks (`@media (prefers-color-scheme: dark)`
guarded by `:root:not([data-theme='light'])`, and `:root[data-theme='dark']`) may only *redefine*
tokens.

Never let a component rule declare a colour for the first time inside a media query or a
`[data-theme]` block. The default state stamps no attribute on the root element, so such a rule
simply never applies there.

## Motion

Three curves. Direction changes the palette; it does not change how things move.

| Token | Curve | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(.23,1,.32,1)` | Anything entering or exiting. The default. |
| `--ease-in-out` | `cubic-bezier(.77,0,.175,1)` | Elements moving or morphing on screen. |
| `--ease-drawer` | `cubic-bezier(.32,.72,0,1)` | The mobile drawer, and nothing else. |

**Never `ease-in` on UI.** It delays the first frame — exactly when the user is looking hardest — so
the same duration *feels* slower.

Durations, all tokenised: `--d-press` 160ms · `--d-tooltip` 150ms · `--d-pop` 200ms ·
`--d-overlay` 280ms · `--d-image` 600ms. The image duration is slow on purpose: it should read as
the photograph breathing, not as a UI transition.

### What does not animate

- **Search and command palette.** Keyboard-initiated and high frequency; animating a repeated
  action reads as lag.
- **Filter chips.** The grid re-rendering is what answers the press.
- **Pagination.**
- **The browse grid after first paint.** Stagger it on the first paint only. Re-staggering every
  page turn makes page 4 feel slower than page 1.

### Details that compound

- Every pressable takes `transform: scale(.97)` on `:active`.
- Never enter from `scale(0)`. Start at `.95` with `opacity: 0`.
- Popovers scale from their trigger; modals stay centred.
- Animate `transform` and `opacity` only.
- Gate hover styling behind `@media (hover: hover) and (pointer: fine)`.
- Reduced motion means **gentler, not none** — shorten and reduce travel, keep the state change
  legible. An instant cut is its own kind of jarring.
- Messages arriving in a thread use `<TransitionGroup>` with **CSS transitions, not keyframes**:
  they arrive in bursts, and transitions retarget mid-flight where keyframes restart.

## Structure

- Vue 3 `<script setup>` with TypeScript, always.
- `@/` is the alias for `src/`.
- All API calls go through [http.ts](../../../src/lib/http.ts) — never a bare `fetch`. It owns
  cookies, the CSRF header, `ProblemDetail` parsing and the central 401.
- Show `ApiError.problem.detail` to the user. It is written by the backend to be read by a person;
  inventing replacement copy loses information.
- Every async surface needs its empty, loading and error state designed, not just its happy path.
