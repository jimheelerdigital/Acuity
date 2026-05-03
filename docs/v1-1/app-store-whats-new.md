# App Store Connect — "What's New in This Version" (v1.1)

**Target version:** 1.1.0
**Status:** Draft, ready to paste once Apple clears v1.0
**Audience:** End users browsing the App Store update screen

---

## Production copy (paste into App Store Connect)

> **What's new in 1.1**
>
> Free recording, forever. Your trial still unlocks the full debrief experience for 14 days, but after that you can keep recording your nightly entries on the free tier — your voice journal stays yours.
>
> A calendar tab is on the way. The placeholder is in place this release; the full hookup ships in a follow-up update.
>
> Plus: faster, more reliable processing for long entries. Cleaner home screen on the days you skip a recording.

---

## Notes for the submitter (do not paste)

- **Length:** ~50 words. Apple's field allows 4,000 chars; we keep it short because most users skim.
- **Voice:** plain language, no marketing puffery. Mirrors the rubric in `docs/Acuity_SalesCopy.md` (specific, falsifiable, customer's language).
- **Banned words avoided:** "AI-powered", "powerful", "revolutionary", "subscribe", "upgrade", "$", "/mo".
- **Why mention free tier first:** it's the visible behavioral change a returning user will notice (their account didn't lock after day 14). Lead with what they'll experience.
- **Why mention calendar at all when it's a placeholder:** sets expectation for the surface they'll see in /account/integrations and Profile → Calendar. If we omit it, the placeholder reads like a half-shipped feature.
- **Why mention "processing improvements" last:** factual cover for the slice 4 + 5 backend work (Inngest async pipeline, embedding observability, history backfill) without naming the mechanism. Users feel the latency drop without needing the architecture.

## Alternate (shorter, if Apple changes the limit)

> **What's new in 1.1**
>
> Recording stays free forever after your trial. Calendar tab placeholder. Faster long-entry processing.

---

## Cross-references

- Free-tier behavior: `docs/v1-1/free-tier-redesign.md`, `docs/v1-1/free-tier-phase2-plan.md`
- Calendar status: `docs/v1-1/calendar-integration-summary.md` (real EventKit deferred to slice C6, post-Apple-clear)
- Sales copy rubric: `docs/Acuity_SalesCopy.md`
