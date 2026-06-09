# Product drift audit (marketing-home rebuild, 2026-06-09)

Drifts found while rebuilding the marketing home from the design handoff
(`marketing_handoff/`). These are **documentation / copy / feature**
drifts beyond design tokens — the marketing prototype is older than the
live app, so the live app is the source of truth for the marketing
mockups (parity-by-default).

After the marketing slice ships, **triage each prototype-only feature**:
either build it (put on the roadmap) or explicitly cut it. "Undefined"
is not an acceptable end state.

## Drifts

| # | Surface | Prototype (handoff) | Live app (source of truth) | Marketing copy resolution |
|---|---------|---------------------|----------------------------|---------------------------|
| 1 | **Life Matrix axes** | **12** axes (Career, Health, Family, Friends, Romance, Money, Growth, **Creativity, Body, Mind, Joy**, Purpose) | **10** axes — `DEFAULT_LIFE_AREAS` (Career, Money, Romance, Family, Friends, Physical Health, Mental Health, Growth, Fun, Purpose). Source: `packages/shared/src/constants.ts`. Note the older JSON-LD FAQ claimed **6** ("Health, Wealth, Relationships, Spirituality, Career, Growth"). | Mockup built on **10** live axes; copy says "every life area" (no "12-axis" claim). FAQ corrected to derive the count from `DEFAULT_LIFE_AREAS.length`. |
| 2 | **Theme Map** | Orbital cosmos with a **3-up segmented control** ("Theme Map \| Matrix \| Trends") + up to **9** hardcoded planets | **No segmented tabs** (Theme Map / Matrix / Trends are separate routes); planets are dynamic, capped at **6** (mentionCount ≥ 2). Source: `apps/web/src/app/insights/theme-map/` + `components/acuity/OrbitalCosmos`. | Mockup drops the tabs, shows ≤6 planets. |
| 3 | **Home hero card** | "**Life Matrix · 67**" overall-score ring hero card | No Life Matrix score on Home — `TodayStatsRow` = streak ring + entries-7d sparkbar + minutes (Life Matrix lives in Insights). Source: `apps/mobile/components/home/today-stats-row.tsx`. | Hero phone shows the live `TodayStatsRow` (fixed in `e855052`). |

## Triage candidates (prototype-designed, not shipped)
Decide ship-or-cut after this slice:
- **12-axis Life Matrix** — prototype added Creativity / Body / Mind / Joy on top of the live 10. (constants.ts notes a "12-axis onboarding carousel not yet landed".) Ship the extra 2 axes, or stay at 10 and retire the 12-axis design?
- **3-tab Theme Map / Matrix / Trends** as one screen — currently separate routes. Consolidate into tabs, or keep routed + retire the tab design?

(Append new drifts here as Batch B/C surfaces them.)
