# Recommendations log

First logged run: 2026-09-19. A 2026-09-23 test run against the same week ("Four signups recorded nothing. Fix day one") was not published and is not logged here. Status is one of: open, done, ignored, killed.

| ID | Date | Recommendation | Impact/Effort | Status | Result |
|---|---|---|---|---|---|
| R-2026-09-19-1 | 2026-09-19 | Wire the v10 iOS paywall purchase button (anonymous RevenueCat identity), add EXPO_PUBLIC_ONBOARDING_V10 to the production EAS profile, ship 1.6.1. Success = RevenueCat New Trials > 0 within 7 days. | H / 10h | ignored | 2026-09-26: not started. `_v10/paywall.tsx:50` still "PURCHASE IS NOT WIRED"; production profile in `eas.json` has no V10 flag. Mobile commits this week were all habits. RevenueCat New Trials 0 for the 12th week. Carried in backlog, not re-prioritised. |
| R-2026-09-19-2 | 2026-09-19 | Fix signup UTM attribution end to end (all 4 signups this week were "(none)"), then turn Meta ads back on to /start at a small daily cap. | H / 6h + $20/day | done | 2026-09-26: `d07feef` fixed dropped Meta signup events and ad-source labels; 16 of 23 signups tagged (15 meta/paid, 1 facebook/social). Meta spend $163.43, 119 link clicks. Signups 4 → 23. Activation 1 of 23. |
| R-2026-09-19-3 | 2026-09-19 | Rosebud free plan ends 2026-09-30: noindex /for/rosebud-switch lander, hook 5 organic on TikTok, $50 Meta interest test. Time-boxed to 09-30. | M / 3h + $50 | ignored | 2026-09-26: no page under apps/web/src/app/for; window closes 09-30. Let it lapse. |
| B-2026-09-19-1 | 2026-09-19 | Log pipeline Claude calls to ClaudeCallLog so user COGS stops reading $0. | M / 2h | open | 2026-09-26: `claude_call_log.user_attributed_usd` still $0. |
| B-2026-09-19-2 | 2026-09-19 | PARTIAL-entry automatic retry sweep, 48-hour window. | M / 3h | open | 2026-09-26: 1 FAILED, 0 PARTIAL of 41 this week. Lower urgency. |
| B-2026-09-19-3 | 2026-09-19 | Streak-preservation push, or hide the three notification toggles that never send. | M / 4h | open | Toggles still at `notification-preferences.tsx:74-76`. |
| B-2026-09-19-4 | 2026-09-19 | Fail-closed CRON_SECRET on adlab/cron, adlab/reconcile, adlab/ads/reactivate. | M / 1h | open | Unchanged: `adlab/cron/route.ts:110` still `if (cronSecret && …)`. AdLab now spends real money, so this matters more. |
| B-2026-09-19-5 | 2026-09-19 | /api/onboarding-events: take userId from session, add rate limit. | M / 1h | open | Unchanged (`route.ts:106-107`). Internal-traffic work touched the route but kept body.userId. |
| B-2026-09-19-6 | 2026-09-19 | Rate limiter fails open without Upstash vars; fail closed or alert in prod. | M / 1h | open | — |
| B-2026-09-19-7 | 2026-09-19 | Regenerate or delete docs/RLS_STATUS.md (dated 2026-04-21). | L / 1h | open | — |
| B-2026-09-19-8 | 2026-09-19 | Upgrade Anthropic SDK from 0.27; add prompt caching on extraction system prompt. | L / 3h | open | Still `^0.27.0`. |
| B-2026-09-19-9 | 2026-09-19 | Move Sunday compute-user-insights to the Batch API. | L / 4h | open | — |
| B-2026-09-19-10 | 2026-09-19 | Evaluate gpt-4o-mini-transcribe vs whisper-1 on 20 entries. | L / 2h | open | Still `whisper-1` (`constants.ts:389`). |
| B-2026-09-19-11 | 2026-09-19 | iOS 26 on-device transcription spike (instant transcript, privacy line). | M / 2d | open | — |
| B-2026-09-19-12 | 2026-09-19 | "Echo" card: one line from 30 days ago matching this week's themes, from existing embeddings. | H / 1d | open | — |
| B-2026-09-19-13 | 2026-09-19 | FREE users unlock one pattern card after 3 entries in a week (Life Note mechanic). | M / 1d | open | — |
| B-2026-09-19-14 | 2026-09-19 | Native StoreReview prompt after the 3rd completed entry. | M / 2h | open | No `requestReview` in apps/mobile. Ratings 7 → 8. |
| B-2026-09-19-15 | 2026-09-19 | Review gate: one-tap confirm; edits move to the task list. | M / 4h | open | 22 shows / 9 confirms / 9 dismissals this week. |
| B-2026-09-19-16 | 2026-09-19 | Auto-generate the weekly report Sunday for PRO users with 3+ entries; email behind existing flag. | M / 3h | open | — |
| B-2026-09-19-17 | 2026-09-19 | Check Resend plan vs 100/day free cap given 27 lifecycle emails. | L / 0.5h | open | Resend sends now throw on error (`1d1b9c6`); plan still unknown. |
| B-2026-09-19-18 | 2026-09-19 | Fill audits/manual-costs.json; add ANTHROPIC_ADMIN_KEY, OPENAI_ADMIN_KEY, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON secrets. | M / 1h | open | 2026-09-26: `as_of` still null; same four blind spots. |
| B-2026-09-19-19 | 2026-09-19 | Cancel the 14 Stripe subscriptions stuck in unpaid. | L / 0.5h | open | Still 14 unpaid. |
| B-2026-09-19-20 | 2026-09-19 | Reconcile RevenueCat actives (15) vs DB paying (17). | L / 1h | open | Gap wider: RC 15 vs DB 20 (15 Stripe + 5 Apple); Stripe itself says 12 active paying. |
| B-2026-09-19-21 | 2026-09-19 | Update _design/DESIGN_SYSTEM.md line 518 ("hero driver is the weekly report") to match paywall evidence. | L / 0.5h | open | — |
| B-2026-09-19-22 | 2026-09-19 | Decide whether Android keeps shipping (0 paying, 0/2 trials, 10+ installs). | M / decision | open | 0 Android signups this week; 1 Play Store tap from the funnel. |
| B-2026-09-19-23 | 2026-09-19 | Trademark knock-out search on RIPPLE, class 9/42, before the first $5k ad month. | M / $300–600 | open | Ad spend started ($163/wk). |
| B-2026-09-19-24 | 2026-09-19 | ASO: subtitle "Talk it out. It keeps track.", task-list-first screenshots, drop brain/dump/therapy keywords, hide legacy SKU names, test Health & Fitness category. | M / 2h | open | `docs/APP_STORE_LISTING.md:108` still has brain,dump,therapy. |
| B-2026-09-19-25 | 2026-09-19 | Kill list: trial-email-orchestrator, trial-countdown-push, hello-world, AdLab claude-sonnet-4-20250514 string, stale App Store docs with banned copy. | L / 2h | open | — |
| B-2026-09-19-26 | 2026-09-19 | Cut auto-publish cadence to lanes with measured engagement until a UTM-tagged signup arrives from social. | M / 1h | ignored | Went the other way: every lane is now a music reel, plus new reset-guide lanes and Kling living reels (`fceb0cc`, `ef53818`, `344bb1b`). Social produced 1 tagged signup (facebook/social). |
| B-2026-09-19-27 | 2026-09-19 | Audit prompt line 1 says "nightly voice brain dump", banned by docs/acuity-positioning.md; edit audits/WEEKLY_AUDIT_PROMPT.md. | L / 5 min | open | Still there. |
| R-2026-09-26-1 | 2026-09-26 | Put the first recording inside the ad funnel: after checkout or skip, run the existing FirstDebriefFlow (record → tasks) on the page before any App Store badge. Success = activation of funnel signups from 1/23 to 8+ of the next ~20. | H / 5h | open | — |
| R-2026-09-26-2 | 2026-09-26 | Judge ads on cost per activated signup, not Meta "conversions": send a FirstDebrief CAPI event, add cost-per-recorder to AdLab, hold spend at the current ~$23/day until activation clears 30%. | H / 3h | open | — |
| R-2026-09-26-3 | 2026-09-26 | Scope the Meta Pixel to marketing and funnel pages only: no pixel, no advanced matching on logged-in app routes (/home, /entries, /insights, /habits, /life-matrix…), and send nothing about funnel answers. | H (risk) / 2h | open | — |
| B-2026-09-26-8 | 2026-09-26 | Fix Stripe dunning before the first card trials bill (~10-01): recovery emails to the Stripe hosted page, not heelerdigital.com; turn off Link bank payments; keep Pro through the retry window. | M / 10 min + 2h | open | — |
| B-2026-09-26-1 | 2026-09-26 | Collapse four web funnels to two (/start + one test arm); freeze funnel restyles until each arm has 100 accounts. | M / 1h | open | — |
| B-2026-09-26-2 | 2026-09-26 | Pause men's funnels and BWK Meta spend; the positioning doc audience is women 40–50. | M / 0.5h | open | — |
| B-2026-09-26-3 | 2026-09-26 | Stop the manual blog-rewrite-triage runs: $11.25 of $20.29 Claude spend this week, no signups attributed to blog. | L / 0 h | open | — |
| B-2026-09-26-4 | 2026-09-26 | Rename "Acuity Pro" to "Ripple Pro" in Stripe (shows in embedded checkout). | M / 5 min | open | — |
| B-2026-09-26-5 | 2026-09-26 | Mobile cold launch: when a web-funnel user signs in on iOS for the first time, land them on the recorder, not the dashboard. | M / 3h | open | — |
| B-2026-09-26-6 | 2026-09-26 | Screen 1 loses about two thirds of ad visitors; let the yes/no split test run to 150 visitors per arm, then keep the winner. | M / 0h | open | — |
| B-2026-09-26-7 | 2026-09-26 | "Rest / low energy / fatigue" themes persisted two weeks; film hooks 2 and 4 and run one ad set on it. | M / 2h + $50 | open | — |
