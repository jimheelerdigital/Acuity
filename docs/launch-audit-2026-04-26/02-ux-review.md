# UX review — 2026-04-26

Audit-only. No fixes applied yet.

## BROKEN (user can't complete the flow)

- [ ] `apps/mobile/app/onboarding.tsx:35` — `return null` when step not found ⇒ blank screen instead of fallback or error message
- [ ] `apps/web/src/app/auth/signin/page.tsx:227` — Support email hardcoded (`jim@heelerdigital.com`) in error copy ⇒ leaks personal contact, should use env var

## CONFUSING (user completes but is confused)

- [ ] `apps/web/src/app/onboarding/page.tsx:86` — Title/comment says 10-step flow but `ONBOARDING_STEPS` registers 9; `clampStep` caps at 10 ⇒ progress counter is off
- [ ] `apps/web/src/app/insights/recent-timeline.tsx:45` — Returns `null` entirely when <3 entries exist ⇒ blank space on `/insights` with no explanation
- [ ] `apps/web/src/app/home/weekly-insight-card.tsx:96` — "Your first report is coming" copy + 0/7 progress bar; user can't tell whether to record, whether the report is gated, or whether generation is pending
- [ ] `apps/web/src/app/goals/goal-list.tsx:692` — Raw HTTP status codes (`HTTP 500`) surfaced when `POST /api/goals/[id]/add-subgoal` fails
- [ ] `apps/mobile/app/goal/[id].tsx:150` — Same "Couldn't save" Alert regardless of error class (network vs validation vs 4xx vs 5xx) ⇒ user can't tell if they should retry
- [ ] `apps/web/src/app/account/integrations-section.tsx:42` — "Coming soon — none of these light up until after beta" but the buttons render as if interactive ⇒ users assume they're broken

## MISSING (feature implied but not built)

- [ ] Mobile `apps/mobile/app/insights/ask.tsx` and `apps/mobile/app/insights/state-of-me.tsx` show "Coming soon to mobile" ⇒ web has the feature but mobile dead-ends with no CTA to use web
- [ ] Web onboarding metadata says "Welcome to Acuity"; comments mention 8-step; actual register has 9 ⇒ naming/count mismatch
- [ ] Theme detail API has a `TODO: plug in real AI analysis. For now a terse placeholder` ⇒ user-facing pages may show placeholder copy
- [ ] Calendar integrations section renders providers but all are disabled ⇒ users see the feature but can't interact

## COPY (wording / vocab issues)

- [ ] `apps/web/src/app/home/page.tsx:204` — "X sessions this week" — copy implies rolling 7-day window but the underlying fetch uses calendar week
- [ ] `apps/web/src/app/insights/page.tsx:36` — "Everything Acuity has learned about you — explored by signal" — "signal" is unexplained jargon
- [ ] `apps/web/src/app/life-matrix/page.tsx:35` — "Your life, decoded — across every area" — vague, doesn't explain Life Matrix is a 6-dimension scorecard
- [ ] `apps/mobile/app/paywall.tsx:88` — "Month two is where the pattern deepens" — assumes user knows they're in month 1
- [ ] `apps/web/src/app/insights/state-of-me/[id]/page.tsx:112` — "Your first fourteen days" hardcoded; doesn't explain Day 14 audit cadence
- [ ] `apps/web/src/app/goals/goal-list.tsx:236` — "use the + button to add a sub-step"; UI calls them "sub-goals" elsewhere ⇒ inconsistent terminology
- [ ] `apps/web/src/app/insights/ask/page.tsx` — Page title is "Ask your past self" but body renders blank
