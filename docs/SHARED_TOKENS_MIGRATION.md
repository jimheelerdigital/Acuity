# Queued slice: shared design-token source of truth

**Status:** queued (seeded 2026-06-09 in the marketing-home slice).
**Owner:** Jimmy. **Parity-by-default:** this is the durable fix that keeps
app + web + (future) Android tokens from drifting.

## Problem
The Acuity design tokens (the parametric oklch palette: light/dark ×
coral/sunset/citrus/cobalt) currently live in **three hand-mirrored
places**:

1. `apps/mobile/lib/theme/tokens.ts` — `makeAcuityTokens()` (JS object the
   RN app consumes).
2. `apps/web/src/lib/theme/tokens.css` — CSS custom properties (+ Tailwind
   `acuity-*` aliases) the web app consumes.
3. The design handoff `marketing_handoff/acuity-tokens.jsx` (now the basis
   of the seed below).

They agree today, but every change must be applied in all three by hand —
exactly the kind of drift parity-by-default is meant to eliminate.

## Seed already done (this slice)
- `packages/shared/src/theme/tokens.ts` — `makeAcuityTokens()` ported
  verbatim from the handoff, typed (`AcuityTokens`, `AccentName`,
  `ACUITY_ACCENT_PRESETS`). Exported from `@acuity/shared`.
- The marketing site (page chrome + the live phone-mockup screens) imports
  `makeAcuityTokens` from `@acuity/shared` — the first real consumer.
- The 4 atmospheric tokens (`heroGrad`, `grain`, `cosmosGrad`,
  `recordGrad`) were added to **both** `@acuity/shared` and web
  `tokens.css` (the latter via `--acuity-primary-h` / `--acuity-secondary-h`
  hue vars so they stay palette-reactive).

## Target architecture
`@acuity/shared` `makeAcuityTokens` is the **single source**. Both apps
derive from it:

- **Web:** a small build step generates `tokens.css` from
  `makeAcuityTokens` (emit each `data-theme`/`data-palette` block by calling
  the fn with `{dark, accent}` and serializing the returned object to
  `--acuity-*` custom properties). Replaces the hand-maintained
  `tokens.css`.
- **Mobile:** `apps/mobile/lib/theme/tokens.ts` re-exports (or thin-wraps)
  the shared `makeAcuityTokens` instead of holding its own copy. RN
  consumes the object directly (it already does).

Depend direction: **app + web + marketing all import from
`@acuity/shared`** — nothing re-declares triplets.

## Migration steps (when picked up)
1. Add `packages/shared` codegen script: `tokens.css` emitter that iterates
   `{light,dark} × {coral,sunset,citrus,cobalt}` calling `makeAcuityTokens`
   and writing the `--acuity-*` blocks. Wire to web `prebuild`.
2. Diff generated `tokens.css` against the current hand-written one; resolve
   the **known deltas** before switching:
   - `cardBgTint`: shared/handoff uses `oklch(…, ph+5)`; web currently uses
     `color-mix(card-bg, primary N%)`. Pick one (color-mix is more
     palette-robust) and update the shared fn or the emitter.
   - Web locks dark neutral hue to `290/285` (coral) for some surfaces;
     shared derives from `sh`. Decide whether surfaces stay coral-locked or
     go palette-reactive.
3. Point `apps/mobile/lib/theme/tokens.ts` at the shared fn; delete the
   duplicate body. ⚠️ HIGH RISK (live app) — verify all 4 palettes ×
   light/dark in a build before shipping.
4. Delete `marketing_handoff/acuity-tokens.jsx` reliance; the handoff stays
   as a visual reference only.
5. Android: when it lands, it consumes the same `@acuity/shared` fn (emit a
   Compose/XML theme from it the same way web emits CSS).

## Acceptance
One edit to `packages/shared/src/theme/tokens.ts` re-tints web + mobile (+
Android) with no per-app hand-editing. No `oklch(...)` palette literals
remain in app code outside the shared generator.
