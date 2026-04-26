# Web ↔ mobile parity — 2026-04-26

## Web has, mobile lacks

- [ ] **Data export (`/api/user/export`)** — apps/web/src/app/account/account-client.tsx (lines 200+) | apps/mobile: no export UI or endpoint call. Impact: GDPR/data portability compliance may require web-only flow or post-launch feature. App Store reviewers tolerate "available on web" for compliance features but should flag in release notes.

- [ ] **Stripe subscription portal** — apps/web/src/app/api/stripe/portal/route.ts + account-client.tsx manage recurring billing | apps/mobile: redirects to web `/upgrade` in SFSafari, no native portal management. Impact: Low — users can manage from web; acceptable per APPLE_IAP_DECISION.md (Option C).

- [ ] **Life Audits (14-day, quarterly)** — apps/web/src/app/insights/life-audit/[id]/page.tsx + generate-life-audit.ts | apps/mobile: no `life-audit` route or component. Impact: Medium — signature feature missing from mobile dashboard; users expect parity on insights surfaces.

## Mobile has, web lacks

- [ ] **Local push notification scheduling** — apps/mobile/lib/notifications.ts + app/reminders.tsx handle expo-notifications with CALENDAR triggers | apps/web: email digests only (weekly + monthly toggles), no push. Impact: Low — mobile reminders are local/OS-level, not app-server push; acceptable for native only.

## Diverged shape (both have but different)

- [ ] **Onboarding flow** — Web: 9 steps (apps/web/src/app/onboarding/steps — steps 1–9 registered) | Mobile: 10 steps (apps/mobile/components/onboarding/index.tsx — ONBOARDING_STEPS includes step-10-ready). Web reaches step 9 ("Notifications") and completes; mobile adds step-10-ready as a final "You're all set" screen. Impact: Low divergence — both reach feature-complete onboarding; step 10 on mobile is cosmetic.

- [ ] **Insights cards on home/dashboard** — Web: home/page.tsx surfaces UserInsightsCard + HealthCorrelationsCard + ComparisonsCard + LockedFeatureCard locks | Mobile: (tabs)/insights.tsx surfaces the same cards but with different unlock progression checks (`progression.unlocked.*`). Shape is identical (both pull `/api/insights` + `/api/health` + `/api/comparisons`), rendering differs only in mobile's SafeAreaView vs web's PageContainer. Impact: None — parallel implementation, same API surface.

- [ ] **Weekly report generation UI** — Web: InsightsView component auto-displays; generation button in modal. Mobile: `generateReport()` function in insights.tsx calls `/api/weekly` directly in-tab with ActivityIndicator overlay. Both hit the same `/api/weekly` endpoint. Reports shape is identical (`{ id, weekStart, weekEnd, narrative, insightBullets, moodArc, topThemes, tasksOpened, tasksClosed, entryCount, status }`). Impact: None — functional parity, UX presentation differs (expected for platform).

## Acceptable divergence (mobile-only or web-only by design)

- [ ] **Recording → Result card** — Web: modal in card stack, polls Entry status, surfaces ResultCard inline with extraction summary/themes/tasks/insights (apps/web/src/app/home/record-button.tsx, lines 294–537). Mobile: full-screen modal that navigates to `/entry/{id}` on complete (apps/mobile/app/record.tsx, line 107 `router.replace`). Both use identical polling hook (`useEntryPolling`), same Entry status flow (QUEUED → TRANSCRIBING → EXTRACTING → PERSISTING). Shape: identical (both produce EntryDTO with same status enum). Presentation: web keeps user in the record flow; mobile navigates away. Impact: None — platform affordances (web modality vs native navigation) acceptable.

- [ ] **Account/profile** — Web: /account with sticky sub-nav (lg+), tabs for profile/notifications/subscription/export/integrations/dimensions/data/security. Mobile: /(tabs)/profile with menu items (Manage Plan, Theme, Reminders, Apple Health toggle). Both read the same user shape (`subscriptionStatus`, `notificationTime`, `notificationDays`, etc.) from `/api/user/me`. Mobile defers subscription to web, web handles it natively. Impact: None — deliberate per APPLE_IAP_DECISION.md; App Store allows deferred subscription flows.

- [ ] **Notification preferences** — Web: account page sections for email digest toggles (weeklyEmailEnabled, monthlyEmailEnabled) + notification time/days selectors. Mobile: /reminders screen with native date/time pickers + permission request via expo-notifications. Web writes to user.notificationTime/notificationDays; mobile calls `applyReminderSchedule()` to schedule OS-level notifications. Shape: identical fields; mechanism differs (server-side email vs OS-level local). Impact: Acceptable — mobile push is local, not sent; users expect platform-native reminders.

- [ ] **Ask Your Past Self, State of Me, Theme Map** — Both web and mobile have these surfaces at `/insights/ask`, `/insights/state-of-me`, `/insights/theme-map`, etc. Mobile routes are `/insights/ask.tsx`, `/insights/state-of-me.tsx`, `/insights/theme-map.tsx`. Both hit `/api/ask`, `/api/state-of-me`, `/api/theme-map` endpoints. Impact: None — full parity.

- [ ] **Tasks/Goals detail** — Web: /tasks/page.tsx + /goals/[id]/page.tsx with edit affordances. Mobile: /(tabs)/tasks.tsx + /task/[id].tsx, /goals.tsx + /goal/[id].tsx. Same shape (Goal/Task DTOs), identical endpoints. Impact: None — parity confirmed.

---

**Summary:** Three material gaps (data export, Life Audits, Stripe portal) but only Life Audits is a feature surface divergence. Data export and portal management are acceptable on web-only for compliance + billing. Onboarding step count differs cosmetically. All core journaling, recording, and insights surfaces achieve parity. Ready for launch; flag Life Audits as post-launch mobile feature.
