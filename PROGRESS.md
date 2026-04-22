# Acuity — Progress Log

**Product:** Acuity — Nightly Voice Journaling
**Stack:** Next.js 14 (web) + Expo SDK 54 (mobile) + Supabase/Prisma + Stripe
**Production:** https://getacuity.io
**Goal:** App Store deployment

---

## 2026-04-22 — Rich dimension detail + AI-grouped tasks (two deferred features shipped)

- **Requested by:** Both
- **Committed by:** Claude Code
- **Commit hashes:** f5f57a8 (rich dimension detail — mobile + web), e45d2cf (task groups — schema + extraction + sectioned UI). This PROGRESS entry on a followup commit.

### In plain English (for Keenan)

Two features that had been sitting on the "next session" shelf are now live.

1. **Tap a Life Matrix dimension → get a real drill-down.** Before: tapping Career or Health on the Insights screen just expanded the card slightly, showing a one-line summary. Now: it opens a full-screen view (modal on phone, side modal on web) with the score + change vs baseline, a 30-day trajectory bar chart, a 2-3 sentence AI-written "What's driving this" paragraph based on the user's actual recent entries about that dimension, the top themes for that area with positive/negative sentiment coloring, the 5 most recent entries mentioning it (tap to open), any goals tagged to that area, and a personalized reflection prompt with a "Record about this" button. The AI summary + prompt are one Claude call each, cached for an hour per dimension per user.

2. **Tasks organized into groups.** Before: a flat list, impossible to scan once you had 10+ tasks. Now: tasks are grouped into Work / Personal / Health / Errands / Other by default. When Acuity's AI pulls tasks out of a recording, it automatically classifies each one into the right group. Sections are collapsible. Long-press a task on phone (or hover a row on web) to get "Move to…" — pick a different group. Everyone gets the 5 default groups seeded automatically on their first task fetch.

**Still to ship:** the task-groups settings screen — rename a group, change its color, drag to reorder, add a new custom group, delete a group, and a "Re-run AI categorization" button for tasks that are currently ungrouped. All the backend endpoints for those exist, just no UI yet. Write-up in the Notes below.

### Technical changes (for Jimmy)

**Feature 1 — rich dimension detail (commit f5f57a8):**

New endpoint `GET /api/lifemap/dimension/[key]`:
- `key` = lowercase dimension key (career/health/relationships/finances/personal/other).
- Returns: `{dimension, score, baseline, change, trajectory: [{date,score}], whatsDriving, topThemes: [{theme,count,sentiment}], recentEntries: [{id,createdAt,mood,excerpt}], relatedGoals: [{id,title,status,progress}], reflectionPrompt, _meta: {cached, computedAt}}`.
- One Claude Opus 4.7 call per uncached fetch: system prompt instructs a warm/observational/non-prescriptive voice; user prompt contains ~6 recent dimension-relevant entries (400 chars each, ~2.5k total) + score + trend word. Returns both `whatsDriving` and `reflectionPrompt` in one JSON payload to save a round-trip.
- Deterministic fallback copy when <2 recent dimension entries so empty states still render (per-dimension hand-crafted prompts in defaultPromptFor).
- Cached per-user-per-dimension for 1 hour via the existing `getCached` helper in `lib/admin-cache.ts`. Rate-limited via the `expensiveAi` bucket (10/hour) to cap Claude spend on cache-busting.
- Trajectory: groups last-30-day entries by date from Entry.rawAnalysis.lifeAreaMentions, averages each day's score.
- topThemes: LifeMapArea.topThemes (pre-computed) joined with a single ThemeMention query for sentiment per theme label.
- relatedGoals: Goal where lifeArea === dimension.enum AND status != ARCHIVED. Goal.lifeArea already existed (default PERSONAL), no migration needed.

Mobile (apps/mobile/app/dimension/[key].tsx new modal route):
- Registered in apps/mobile/app/_layout.tsx as `presentation: "modal"`. Dismissed via X or iOS swipe-down.
- Sections: score hero → 30-day sparkline (bar-based, no react-native-svg) → "What's driving this" tinted by dimension color → top themes with sentiment-tinted chips → recent entries (tap → entry detail) → related goals (tap → goal detail) → reflection prompt card with "Record about this" button.
- apps/mobile/app/(tabs)/insights.tsx: area-card onPress now navigates to `/dimension/[key]` instead of toggling an inline-expand. Dead inline-expand JSX + `diff` variable removed.

Web (apps/web/src/app/insights/dimension-detail.tsx new):
- `DimensionDetailModal` client component. Escape + click-outside dismiss. `md:grid-cols-2` lays out themes+entries | goals side by side on desktop.
- life-map.tsx: new `detailKey` state; area-card onClick sets it; modal rendered conditionally at component tail.
- Same bar sparkline pattern as mobile — no chart lib imported here; recharts still reserved for the larger trend view.

Bugfix surfaced during scoping:
- Theme model's human-readable field is `name` not `label` (schema.prisma:752) — the ThemeMention join uses `theme.name` accordingly.

**Feature 2 — AI-grouped tasks (commit e45d2cf):**

Schema:
- New TaskGroup model (id, userId, name, icon, color, order, isDefault, isAIGenerated, createdAt, updatedAt). Unique (userId, name). Index (userId, order).
- Task gains `groupId String?` + `group TaskGroup?` relation with `onDelete: SetNull`. User gains `taskGroups TaskGroup[]`.

Seeding (apps/web/src/lib/task-groups.ts new):
- `ensureDefaultTaskGroups(prisma, userId)` — idempotent (zero-check + createMany with skipDuplicates). Seeds 5 groups: Work (briefcase, #3B82F6), Personal (person, #7C3AED), Health (heart, #EF4444), Errands (cart, #F59E0B), Other (ellipsis-horizontal, #6B7280). Flagged `isDefault=true, isAIGenerated=true`.
- `resolveGroupName` — case-insensitive name → id lookup with fallback to the user's "Other" group.

Extraction pipeline changes (apps/web/src/lib/pipeline.ts + inngest/functions/process-entry.ts):
- Both sync and async paths ensure default groups + fetch group names before the Claude call.
- `extractFromTranscript` takes a new `taskGroupNames: string[]` parameter. Injects a prompt block: "The user's task groups (each extracted task MUST be classified into one of these, case-sensitive; fall back to "Other" when unsure): …" The Claude-returned task schema gains an optional `groupName` field.
- Persist step builds an in-transaction {lowercase name → id} Map; each extracted task's groupName resolves to a groupId. Unknown / missing names fall back to the "Other" group id.
- `ExtractedTask` type in packages/shared/src/types.ts gains optional `groupName: string`.

New API endpoints (apps/web/src/app/api/task-groups/):
- `GET /api/task-groups` — list user's groups with taskCount. Seeds defaults.
- `POST /api/task-groups` — create user-authored group {name, icon, color}. Case-insensitive duplicate guard. Appends at max(order)+1.
- `PATCH /api/task-groups/[id]` — partial updates: name / icon / color / order. Case-insensitive duplicate-name guard.
- `DELETE /api/task-groups/[id]` — delete group. Optional `{moveTasksTo: <id>}` body reassigns tasks before delete; without it, tasks go ungrouped via SetNull cascade. Guards against deleting the user's last group.
- `POST /api/task-groups/recategorize` — runs a single batched Claude classify over the user's currently-ungrouped (`groupId IS NULL, status != DONE`) tasks. Capped at 40 tasks per call. Rate-limited via `expensiveAi` (10/hour).

Modified `/api/tasks`:
- `GET` seeds default groups on first fetch.
- `POST` accepts `groupId` (validated to belong to caller; silent-drop on mismatch to avoid existence-leak).
- `PATCH` gains a new `move` action: `{id, action:"move", groupId: string | null}` reassigns or ungroups. Target-group ownership validated.

Mobile UI (apps/mobile/app/(tabs)/tasks.tsx full rewrite):
- ScrollView of `GroupSection` components; one per TaskGroup + an "Ungrouped" section for `groupId IS NULL` tasks.
- Each section: color dot + Ionicons glyph + name + count header; tap to collapse/expand.
- Long-press ActionSheetIOS on a task row: Snooze / Mark complete / Move to… / Delete. Move opens a secondary sheet listing all groups + "Ungrouped".
- Inline title edit + optimistic checkbox toggle preserved from the prior Notes-style pass.

Web UI (apps/web/src/app/tasks/task-list.tsx full rewrite):
- Mirrors mobile: sectioned collapsible lists, Ungrouped section at bottom.
- Row hover reveals: Move-to dropdown (absolute-positioned, lists all groups + Ungrouped), Details, Snooze, Delete.
- Full-edit modal adds a Group `<select>`; changing it fires a separate `action:"move"` PATCH after the edit saves.

### Manual steps needed

- [ ] **`npx prisma db push` from home network.** REQUIRED before these commits can run in production. Adds Entry.goalId (from yesterday — also still pending) + TaskGroup model + Task.groupId + indexes + inverse relations on User and Goal. Keenan or Jim runs — work Macs block Supabase ports.
- [ ] Jim: `cd apps/mobile && eas update --channel preview` to bundle the two new mobile screens (/dimension/[key] modal + the sectioned tasks UI) into one OTA.
- [ ] Vercel auto-deploy handles the web changes if the auto-deploy Inngest blocker is resolved; otherwise `vercel --prod` from repo root.

### Notes

**Task groups settings page — DEFERRED to next session.** All backend endpoints exist and are production-ready. Missing UI:
- Mobile: `apps/mobile/app/settings/task-groups.tsx` with rename (TextInput), icon picker (limited Ionicons set: briefcase, person, heart, cart, ellipsis-horizontal, book, home, leaf, flash, star), color palette (~8 hex swatches), up/down arrows for order (drag-reorder is a nicer-to-have), add-new button (opens modal with name/icon/color inputs), delete button (confirmation + optional "move tasks to…" picker), and a "Re-run AI categorization" button that POSTs to /api/task-groups/recategorize and shows the returned count.
- Web: `apps/web/src/app/account/task-groups/page.tsx` — same fields, standard form patterns.
- Estimated scope: 1.5-2hr, roughly 500 LOC across both platforms. No API work needed; just UI wiring.

**Add-task manual button — DEFERRED.** The POST /api/tasks endpoint already accepts groupId. Neither task list exposes a "new task" button yet — tasks primarily come from the extraction pipeline which now classifies correctly. Worth adding alongside the settings screen so the two UI gaps close together.

**Entry.goalId migration is stacked with TaskGroup migration.** Both landed in the schema but neither has been pushed to prod. A single `npx prisma db push` applies them both at once — no order dependency.

**Claude cost profile for dimension detail:** 6 dimensions × N users × cache-miss rate = Claude calls per hour. With 1-hour cache, a typical user opening all 6 dimensions once a day hits Claude 6 times that day. Back-of-envelope: ~2.5k tokens in + ~500 tokens out per call × 6 dimensions × $0.003/1k in + $0.015/1k out ≈ $0.09/user/day worst case. For 100 active users, ~$270/month. Adjust cache TTL if this becomes meaningful; the 1-hour value is a first guess.

**Task group classifier — batch in the extraction prompt, not a separate call.** We considered a dedicated classify-tasks Claude call post-extraction but the extraction call already has the full transcript and is already running. Adding a `groupName` enum field to the existing prompt cost ~20 extra tokens per task and adds no latency. The recategorize endpoint is a separate batched call specifically for the "fix historical ungrouped tasks" use case.

---

## 2026-04-21 — Beta polish sprint 2: goal-contextualized recording, web parity, crisis tone, PRO spec

- **Requested by:** Both
- **Committed by:** Claude Code
- **Commit hashes:** daab95c (goal recording), 8fff129 (web header), 36de473 (web radar polygon), 33623d5 (web trend chart), 09b2404 (crisis footer), 7dfe030 (Dashboard→Home rename), a5f72c3 (PRO spec). Fix 7 (web insights parity) was already shipped by d1b49ae in the prior session.

### In plain English (for Keenan)
Big batch of beta polish. Some product, some visual, one decision document.

1. **"Record about this goal" actually works now.** Tapping that button on a goal in the phone app used to dump you back at the Home tab to record — the recording had no idea it was supposed to be about that goal. Now tapping Record on a goal jumps straight into recording mode, and the AI that processes the recording knows which goal you were reflecting on. The entry shows up under "Linked entries" on the goal afterward. Web still doesn't have this button (web has no inline recorder yet) — that half will ship next session.

2. **Dashboard is now called "Home" on the website.** Matches the phone app. Old `/dashboard` links still work — they redirect. If anyone bookmarked the old URL or clicks an old email link, it still lands them in the right place.

3. **Web nav header is dark in dark mode.** Used to render in off-white cream even in dark mode, which clashed hard. Fixed.

4. **Web Life Matrix actually shows a filled polygon.** The radar was showing an empty hexagon — grid and center dot, no data shape. Small bug in how the web radar matched area names to scores. Fixed.

5. **Current / Trend toggle on web actually does something now.** Clicking Trend used to silently toggle a barely-visible dashed overlay that most users couldn't see. Now clicking Trend swaps the radar for a line chart showing each life area's score over the last 8 weeks, one colored line per area. Clicking Current brings back the radar.

6. **Support footer redesigned.** The "In crisis? Text 988" banner at the bottom of authenticated pages used to look like an amber error banner. It now reads as a calm support line — thin violet top border, heart icon, smaller text, softer copy ("Need to talk to someone?"). Still has the 988 number and link to more resources.

7. **Web Insights matches the phone app's layout.** Already shipped in the prior session — Life Matrix first, then a horizontal "Recent activity" strip, then Theme Map / Ask / State of Me cards, then Weekly Reports, and a collapsible "Metrics & observations" drawer at the bottom.

8. **PRO tier spec documented.** We wrote down exactly what becomes paywalled after the 14-day trial ends (State of Me report, Apple Health, Ask Your Past Self, data export, custom Life Matrix dimensions beyond 6) and what stays free forever (core recording, default Life Matrix, goals + tasks, weekly/monthly digests, referrals). Nothing is gated yet — this is the spec for when we're ready to flip enforcement on.

Two bigger items — rich dimension detail views and AI-grouped tasks — were out of scope for this session. Plans for both are written up in the Notes section so the next session picks up cleanly.

### Technical changes (for Jimmy)

**Fix 1 — goal-contextualized recording (commit daab95c):**
- Schema: Entry.goalId String? + `goal Goal?` relation (onDelete: SetNull); inverse `Goal.entries`; @@index([goalId]).
- Mobile: `app/goal/[id].tsx` record CTA routes to `/record?goalId=<id>` (was passing title as string); `app/record.tsx` reads goalId via useLocalSearchParams and appends to upload FormData.
- Server: `/api/record` validates goalId belongs to caller (silent drop on mismatch to avoid existence-leak via 403/404) and persists on Entry on both sync and async paths. `lib/pipeline.ts::extractFromTranscript` accepts `goalContext: {title, description}`; injects a "This entry is specifically about …" block into the Claude user message, after memoryContext and before transcript. `inngest/functions/process-entry.ts` async path loads Entry.goalId → Goal → passes to extractFromTranscript.
- Goal detail API: `/api/goals/[id]` unions linkedEntries from Entry.goalId ∪ Goal.entryRefs (Prisma OR), sorted newest-first, cap 20.
- Requires `npx prisma db push` before this code deploys — see Manual steps.

**Fix 2 — web header dark bg (commit 8fff129):**
- `components/nav-bar.tsx`: added `dark:bg-[#0B0B12]/80` to `<nav>` and `dark:bg-[#1E1E2E]` to the "Who it's for" dropdown. Also cleaned up a pre-existing malformed `dark:border-white/10/60` Tailwind class → `dark:border-white/10`.

**Fix 3 — web radar empty polygon (commit 36de473):**
- `apps/web/src/app/insights/life-map.tsx`: polygon builder and three other lookups were doing `areas.find(a => a.area === config.name)` — but `a.area` is the enum ("CAREER") and `config.name` is the title-case display string ("Career"), so the match always missed, all scores defaulted to 0, and the polygon collapsed. Switched all lookups to `config.enum`. Also unified selection keys — radar onClick now emits `config.enum` matching what the score cards already emit, and history selection matches on `h.area` (enum) not `h.name` (title-case).

**Fix 4 — web Trend line chart (commit 33623d5):**
- `apps/web/src/app/insights/life-map.tsx`: new `TrendLineChart` subcomponent using recharts (already in the bundle — `recharts ^3.8.1`). Flattens the per-area weeklyScores arrays into a single chronological row array keyed by enum, renders one `<Line>` per enabled area in its brand color. `connectNulls: false` leaves gaps for weeks with no data. Replaces the radar entirely when `view === "trend"` (was previously just overlaying a dashed polygon on the same radar).

**Fix 5 — crisis footer tone (commit 09b2404):**
- `components/crisis-footer.tsx`: background switched from `bg-amber-50/95` to `bg-[#FAFAF7]/95` (light) + `bg-[#0B0B12]/95` (dark) with a `border-violet-500/15` top border. Heart SVG icon replaces the implicit warning tone. Copy: "In crisis?" → "Need to talk to someone?". Text shrunk to 11px, `py-2` → `py-1.5`. Dismissible behavior, localStorage key, authenticated gating all unchanged.

**Fix 6 — Dashboard → Home rename (commit 7dfe030):**
- `git mv apps/web/src/app/dashboard apps/web/src/app/home`. New `apps/web/src/app/dashboard/page.tsx` server-component redirect to `/home` for old bookmarks + email links.
- `components/nav-bar.tsx`: NAV_LINKS label "Dashboard" → "Home"; hrefs /dashboard → /home; logo link target updated.
- Swept all user-facing `/dashboard` references: `components/keyboard-shortcuts.tsx` (n = new recording), `components/recommended-activity.tsx`, `app/onboarding/page.tsx`, `app/onboarding/onboarding-shell.tsx` (skip redirect), `app/onboarding/steps/step-8-first-entry-cta.tsx`, `app/upgrade/page.tsx`, `app/entries/page.tsx` (back-link text too: "← Dashboard" → "← Home"), `app/goals/[id]/goal-detail.tsx`, `app/insights/theme-map/theme-map-client.tsx`, `app/insights/life-audit/[id]/page.tsx`, `app/page.tsx` (root session redirect), `app/auth/signup/page.tsx` + `signin/page.tsx` (callbackUrl), `app/api/stripe/checkout/route.ts` (success_url).
- `middleware.ts` matcher adds `/home/:path*` while keeping `/dashboard/:path*` so the redirect route stays behind the next-auth gate.
- `app/robots.ts` disallows both paths.
- Admin surfaces intentionally NOT renamed (admin/dashboard/, admin-dashboard.tsx, "Admin Dashboard" headings, external Supabase/Stripe dashboard links).

**Fix 7 — web insights parity (no code change, reference only):**
- Verified web `/insights` section order already matches mobile after prior session's d1b49ae: Life Matrix → Timeline → Theme Map → Ask → State of Me → Weekly Reports → Metrics drawer. No commit needed.

**Fix 10 — PRO tier spec (commit a5f72c3):**
- New `docs/PRO_TIER_SPEC.md` documenting gated-post-trial vs always-free feature matrix. Flags open questions for Keenan (Ask rate, Theme Map gating, Claude observations per week, post-trial email copy). No code changes.

**Fixes 8 + 9 — deferred, not shipped.** See Notes.

### Manual steps needed

- [ ] **Jim: `npx prisma db push`** to land the `Entry.goalId` column + index + `Goal.entries` relation. REQUIRED before commit daab95c ships, otherwise the record route writes to a column the DB doesn't know about and every goal-linked recording fails. **Jim or Keenan — whoever has home network access; work Macs block Supabase ports.**
- [ ] Jim: one consolidated `eas update --channel preview` covering the mobile changes from this session (daab95c — goal record flow). Web fixes auto-deploy on Vercel.
- [ ] Keenan: review `docs/PRO_TIER_SPEC.md` and answer the four open questions at the bottom before PRO gating lands.

### Notes

**Fix 8 — rich dimension detail view: DEFERRED to next session.**
Scope cost is ~3-4 hours if done properly. Plan for when it's picked up:
1. New endpoint `GET /api/lifemap/dimension/[key]` returning `{area, score, baselineDelta, trajectory30d: number[], topThemes: [{label, count, sentiment}], recentEntries: [{id, createdAt, mood, summary}], goals: [{id, title, status, progress}], drivingSummary: string, reflectionPrompt: string}`. Cache per-user-per-dimension for 1 hour via the existing admin-cache pattern (or a new `dimensionCache.ts` alongside it).
2. Claude synthesis: two small calls — one for `drivingSummary` ("In 2-3 sentences, what's driving this user's [Career] score right now? Given these recent entries: …"), one for `reflectionPrompt` ("Suggest one reflection prompt this user could record about [Career]…"). Bundle both into a single `messages.create` call with a structured JSON response to save a round-trip.
3. Mobile: new bottom-sheet component in `apps/mobile/components/dimension-detail.tsx`. Full-screen sheet, not a card expansion. Open via Pressable on the Life Matrix area detail card (replacing the current inline expand).
4. Web: new `<DimensionDetailPanel>` modal/side-panel in `apps/web/src/app/insights/dimension-detail.tsx`. Hooked into the existing `DetailPanel` render path in `life-map.tsx`.
5. Goal dimension tagging: `Goal.lifeArea` already exists (`String @default("PERSONAL")`). Use it for the "Goals in this area" section — no schema migration.
6. Sparkline: reuse the existing `Sparkline` component in `life-map.tsx` — already built, tested, takes a `number[]`.

**Fix 9 — tasks organized into AI-inferred groups: DEFERRED to next session.**
Scope cost is ~4-5 hours. Plan:
1. Schema:
   - New `TaskGroup` model: id, userId, name, icon, color, order Int, isDefault Boolean, isAIGenerated Boolean, createdAt. Unique composite index on (userId, name).
   - `Task.groupId String?` + `group TaskGroup?` relation (onDelete: SetNull). Index on [groupId].
2. Seed on first task write (not on user creation — saves a write for users who never record): when `task.create`/`createMany` finds `taskGroup.count({where: {userId}}) === 0`, seed 5 defaults — Work (#3B82F6, briefcase), Personal (#A855F7, sparkles), Health (#14B8A6, heart-pulse), Errands (#F59E0B, list-checks), Other (#71717A, more-horizontal). Wrap in the same transaction as the first task insert so partial failures roll back.
3. Extraction: extend the existing Claude extraction prompt with a `"groupHint"` field on each extracted task. Give Claude the user's group names + a short description of each in the system prompt. Post-extraction, map `groupHint` → existing TaskGroup.id by case-insensitive name match; fall back to "Other" if ambiguous. Cheaper than a second Claude call.
4. UI:
   - Mobile `tasks.tsx`: split the current FlatList into a SectionList grouped by TaskGroup.order. Collapsible sections via a per-group `openGroups: Set<string>` state. Empty groups hidden.
   - Web `task-list.tsx`: same pattern using ul>li grouping.
   - "Move to…" submenu on mobile long-press ActionSheet; web hover overflow menu.
   - New `/tasks/groups` settings page (web) + modal (mobile) for rename / reorder / add / delete (empty only) / "Re-run AI categorization" button that hits `POST /api/tasks/groups/reclassify`.

**Already-production-grade notes for this session:**
- Entry.goalId persist path tested on both sync (`lib/pipeline.ts::processEntry`) and async (`inngest/functions/process-entry.ts`) paths — same goal-fetch + context-injection logic.
- goalId validation silently drops mismatches rather than returning 403/404 — prevents enumeration attacks via the record endpoint.
- Dashboard→Home rename preserves URL history via the `/dashboard` redirect shim — no broken-link surface.
- Web header dark-mode fix also fixed a pre-existing `dark:border-white/10/60` typo that was silently producing no border in dark mode (Tailwind can't parse the triple slash).

---

## 2026-04-21 — Beta testing UX pass: tasks, nav, insights + report features audit

- **Requested by:** Both
- **Committed by:** Claude Code
- **Commit hashes:** 73e696c (back button), e06ac58 (tasks), d1b49ae (insights), followup commit (this PROGRESS entry)

### In plain English (for Keenan)
Beta testers flagged four things. We fixed three of them and documented a decision on the fourth.

1. **Tasks list** — both the phone app and the website. Tasks used to look like chunky cards. Now they look like the iOS Reminders app: a simple list with an empty circle on the left, the task text you can tap to rename, and a small priority tag if the task is High or Urgent. Tap the circle to check a task off (it fills in purple with a white check). Tap the text to edit the title right there without opening any popup. Long-press a task on mobile for snooze/delete options; hover a row on the web for the same.

2. **Back button label** — on the phone app, opening a journal entry used to show "(tabs)" as the iOS back button label in the top-left corner. Now it just shows a chevron, no text. Applies everywhere in the app.

3. **Insights page** — both platforms. The Life Matrix (six-area radar chart) is now the first thing you see, big and prominent. Below it is a new horizontal-scrolling "Recent activity" strip showing the last 7 days as emoji + date + summary cards (tap to open the entry). Below that: Theme Map, Ask Your Past Self, and State of Me cards (phone app got the last two for the first time). The long tables of charts and metrics are now tucked into a collapsible "Metrics & observations" drawer at the bottom.

4. **Report features audit** — we looked at what was promised for digests and reports versus what actually ships. Emails send text summaries but no charts. Life Audit doesn't email the user when it completes. Life Timeline / Theme Evolution Map / Goal Progression Tree from the roadmap aren't implemented. Nothing fixed in this pass — all decisions documented in the Notes section below.

### Technical changes (for Jimmy)

**Fix 2 — back button (commit 73e696c):**
- `apps/mobile/app/_layout.tsx`: root Stack screenOptions now sets `headerBackButtonDisplayMode: "minimal"` and `headerBackTitle: "Back"`. Cascades to all pushed detail screens (entry/[id], goal/[id], insights/theme-map, record modal).

**Fix 1 — tasks UI (commit e06ac58):**
- `apps/mobile/app/(tabs)/tasks.tsx`: full rewrite. FlatList with 1px dividers, no card chrome. 22px checkbox (transparent w/ grey border when open, #7C3AED fill + white checkmark when done). Inline TextInput on row-tap, saves on blur/submit via `action: "edit"` fields:{title}. Long-press opens `ActionSheetIOS` with Snooze/Complete/Delete. Optimistic toggle for complete/reopen.
- `apps/web/src/app/tasks/task-list.tsx`: matching rewrite — flat list inside bordered container, inline `<input>` with Enter/Esc + blur-save. Retained full-field edit modal for description/priority/dueDate via per-row Details icon on hover.
- No API changes — existing `/api/tasks` PATCH `action: "edit"` with `fields: {title, description, priority, dueDate}` already supported.

**Fix 3 — insights redesign (commit d1b49ae):**
- `apps/mobile/app/(tabs)/insights.tsx`: reordered sections. Life Matrix radar + Current/Trend toggle + area detail grid moved to top. New horizontal ScrollView timeline uses already-fetched `entries` state. Added Ask Your Past Self and State of Me link cards (previously web-only). Mood chart + UserInsightsCard + ComparisonsCard moved into a `metricsOpen` collapsible drawer. Timeline hides if fewer than 3 entries in last 7 days.
- `apps/web/src/app/insights/page.tsx`: reordered sections to match mobile.
- `apps/web/src/app/insights/recent-timeline.tsx`: NEW client component. Fetches `/api/entries`, filters to last 7 days, renders horizontal-scroll strip of mood/date/summary cards.
- `apps/web/src/app/insights/metrics-drawer.tsx`: NEW client component. Collapsible drawer wrapping UserInsightsCard + HealthCorrelationsCard + ComparisonsCard.
- No API changes — `/api/lifemap/trend` already exists and was wired to `trendAreas` prop on both radar components. The "broken toggle" concern in the brief was a false alarm; toggle is functional but the "Trend" button is (correctly) disabled when `hasEnoughHistory` is false, which is the case for most beta users.

**Fix 4 — report features audit (no code commit):**
- Findings documented in Notes below. No features shipped in this pass.

### Manual steps needed
- [ ] **Jim: publish one OTA update covering all three mobile fixes.** `cd apps/mobile && eas update --channel preview --message "beta UX pass: tasks, back button, insights redesign"`. Do not run it per-commit — bundle once so all three land together on device.
- [ ] **Vercel auto-deploys web changes** on push to main (if auto-deploy is unblocked per PROGRESS 2026-04-20 Inngest triage). If not, run `vercel --prod` from repo root.
- [ ] **Keenan / Jim decide** which report-audit gaps to schedule (see Notes). No prisma migration needed.

### Notes

**Gotchas discovered:**
- React Native 0.81 + Fabric: `headerBackTitleVisible` is deprecated in native-stack 7.x — use `headerBackButtonDisplayMode: "minimal"` instead. Verified in `@react-navigation/native-stack/lib/typescript/src/types.d.ts:130` before writing the fix.
- Expo Router's `<Tabs.Screen>` with `href: null` already triggers both `tabBarItemStyle: { display: 'none' }` and `tabBarButton: () => null` automatically (via `expo-router/build/layouts/TabsClient.js:33`) — no extra hiding needed for `index` and `profile` screens.
- Web has no `/entries/[id]` route. The Timeline cards on web all link to `/entries` (the list) instead of individual entries. If we add a web entry-detail page later, update `recent-timeline.tsx` to per-entry hrefs.
- The Current/Trend toggle on both platforms was already correctly wired before this pass — the `/api/lifemap/trend` endpoint returns a ~4-weeks-ago snapshot from `LifeMapAreaHistory` (or a transcript-derived fallback), and both radar components accept a `trendAreas` prop that renders a dashed overlay polygon. Toggle is correctly disabled when `hasEnoughHistory` is false.

**Report features audit — explicit decisions per gap:**

| Gap | Status | Decision | Est. cost |
|---|---|---|---|
| PNG chart generation in digest emails (`weekly-digest.ts` line 12 calls this out as "skipped this sprint") | STUB | **DEFER to post-beta engagement signals.** Needs `@vercel/og` or `node-canvas` in the bundle + image URL hosting. Noise vs. signal unclear until we see open-rate + CTR data. | 1-2 hr |
| Life Audit completion email (Day 14) | MISSING | **SHIP NEXT SESSION.** Pattern exists in State of Me (`generate-state-of-me.ts:255-275` → `sendStateOfMeReadyEmail`). Unblocks the paywall-transition UX decision from 2026-04-17 ("users must arrive at Day 14 already holding the audit"). Small, high-leverage. | 30 min |
| Full State of Me report content in email (currently ready-notification only) | PARTIAL | **DEFER.** Current pattern (email = CTA to view in-app) is consistent with the app-first experience. Revisit only if users complain. | 1 hr |
| Life Timeline (full zoomable day/month/year view per ROADMAP.md §62-69) | MISSING | **Per ROADMAP — Sprint 3.** The insights timeline strip shipped in this pass is the first 7-day horizontal slice; full zoomable version stays on the roadmap. | 1-2 weeks |
| Theme Evolution Map (Sprint 2 force-directed graph) | STUB | **Per ROADMAP — in progress, Sprint 2.** Route structure exists (`/insights/theme-map`), logic is the blocker. | 3-5 days |
| Goal Progression Tree (Sprint 2 hierarchical goals) | MISSING | **Per ROADMAP — Sprint 2.** Schema change required (`Goal.parentGoalId`). | 5-7 days |
| Monthly digest Life Timeline visual (heat strip / bubble chart) | STUB | **DEFER** — blocked on the same chart-in-email pipeline as the first row. Currently ships text summary only. | Same as row 1 |

**Recommendation** — top of next session's queue: Life Audit completion email. 30 min of work that closes a paywall-transition UX gap.

---

## 2026-04-21 — Replace OG image, favicons, and app icons with new logo

- **Requested by:** Keenan
- **Committed by:** Claude Code
- **Commit hash:** bf2703b

### In plain English (for Keenan)
When you share an Acuity link on Slack, Twitter, iMessage, or LinkedIn, the preview image now shows the new purple diamond logo with the "Acuity" wordmark and tagline — instead of the old glossy "A" icon. The browser tab icon (favicon) and phone home screen icon (apple-touch-icon) also now use the new logo. A PWA manifest was added so "Add to Home Screen" on mobile shows the correct icon and brand colors.

### Technical changes (for Jimmy)
- Generated new image assets from `AcuityLogo.png` using Python/Pillow:
  - `apps/web/public/og-image.png` — 1200x630 Open Graph image (new logo + "Acuity" + tagline on #0D0A19 dark background with subtle purple radial glow)
  - `apps/web/public/favicon.ico` — multi-resolution (16/32/48px)
  - `apps/web/public/favicon-96x96.png` — 96x96 PNG favicon
  - `apps/web/public/apple-touch-icon.png` — 180x180
  - `apps/web/public/icon-512.png` — 512x512 PWA icon
  - `apps/web/public/icon-192.png` — 192x192 PWA icon
- Created `apps/web/public/site.webmanifest` with PWA metadata (name, icons, theme_color #7C5CFC, background_color #0D0A19)
- Updated `apps/web/src/app/layout.tsx`: OG + Twitter image refs changed from `/og-image.jpg` to `/og-image.png`, removed dangling `favicon.svg` `<link>` reference
- Updated 7 layout files to use `/og-image.png` with correct 1200x630 dimensions: `for/[slug]`, `for/decoded`, `for/therapy`, `for/founders`, `for/sleep`, `for/weekly-report`, `waitlist`

### Manual steps needed
- [ ] After Vercel deploy completes, force platforms to re-scrape the new OG image (Keenan):
  - **Slack:** Paste any getacuity.io link in a channel, click the 3-dot menu on the preview → "Remove preview", then paste the link again
  - **Twitter/X:** Visit https://cards-dev.twitter.com/validator and enter getacuity.io
  - **Facebook/LinkedIn:** Visit https://developers.facebook.com/tools/debug/ and enter getacuity.io, click "Scrape Again"
  - **iMessage:** iMessage caches aggressively — may take 24-48 hours to update naturally
- [ ] Old image files still in `apps/web/public/` can be deleted when convenient: `og-image.jpg` (old OG), `acuity-logo.png` (old logo), `acuity-logo copy.png` (duplicate of old logo). Not referenced anywhere in code. (Jimmy or Keenan)

### Notes
- The old OG image (`og-image.jpg`, 162 KB) was the glossy "A" app icon at 1200x1200. The new one (`og-image.png`, 48 KB) is 1200x630 — the standard OG dimension that works on every platform without cropping.
- The previous `/for/*` landing pages had OG dimensions set to 1200x1200 (square). Fixed to 1200x630 to match the actual image and prevent platform-side cropping.
- `favicon.svg` was referenced in `<head>` but never existed. Removed the reference rather than generating an SVG — the PNG favicon at 96x96 covers all modern browsers.
- Platform OG caches can persist for 1-7 days even after deploy. The manual re-scrape steps above force an immediate refresh.

---

## 2026-04-21 — Update all email templates to show the new Acuity logo

- **Requested by:** Keenan
- **Committed by:** Claude Code
- **Commit hash:** b0aefa1

### In plain English (for Keenan)
All emails from Acuity — magic link, password reset, verification, payment failed, data export ready, State of Me ready, weekly digest, monthly digest, and the waitlist drip sequence — now show the actual purple diamond Acuity logo instead of a placeholder "✦" character. A test script is included so you can send yourself a test magic link email to verify the logo looks right before going live.

### Technical changes (for Jimmy)
- `apps/web/src/emails/layout.ts`: replaced inline `✦` gradient div with `<img src="https://www.getacuity.io/AcuityLogo.png">` (48x48). This is the shared shell for all transactional auth emails (magic-link, password-reset, verification, payment-failed, state-of-me-ready, data-export-ready).
- `apps/web/src/emails/digest-layout.ts`: same replacement (36x36). Shared shell for weekly and monthly digest emails.
- `apps/web/src/lib/drip-emails.ts`: updated logo URL from `getacuity.io` to `www.getacuity.io` for consistency (was already using AcuityLogo.png).
- `apps/web/src/app/api/waitlist/route.ts`: same URL standardization for waitlist welcome email.
- `apps/web/src/app/layout.tsx`, `voice-journaling/page.tsx`, `blog/[slug]/page.tsx`: standardized Schema.org `logo` URLs to use `www.getacuity.io`.
- New script: `apps/web/scripts/send-test-magic-link.ts` — sends a test magic-link email to keenan@heelerdigital.com via Resend to verify logo rendering.

### Manual steps needed
- [ ] Run test email to verify logo: `set -a && source apps/web/.env.local && set +a && npx tsx apps/web/scripts/send-test-magic-link.ts` (Keenan — from home network)
- [ ] Verify logo renders correctly in Gmail, Apple Mail, and mobile (Keenan)
- [ ] Note: `AcuityLogo.png` is 8.1 MB — consider generating optimized versions (favicon, apple-touch-icon, og-image) for the missing icon files referenced in layout.tsx. The favicon-96x96.png, favicon.svg, favicon.ico, apple-touch-icon.png, and site.webmanifest files are referenced in `<head>` but don't exist in `apps/web/public/` yet. (Jimmy)

### Notes
- The old logo (`acuity-logo.png`, 762 KB, the glossy purple "A" app icon) is still in `apps/web/public/` but is no longer referenced anywhere in code. Safe to delete when convenient.
- `acuity-logo copy.png` is also unused — appears to be a duplicate of the old logo.
- The new logo (`AcuityLogo.png`, 8.1 MB) is a transparent-background PNG which renders well on the dark email backgrounds but is very large. For email performance, an optimized/compressed version would be ideal as a follow-up.
- `AcuityLogo.png` and `AcuityLogoDark.png` appear to be identical files (same size, same visual). Could consolidate to one file if confirmed.
- Favicon/apple-touch-icon/manifest files are declared in `layout.tsx` `<head>` but the actual files don't exist in `public/`. This doesn't break anything (browsers just get 404s and fall back) but should be addressed — generate proper icon sizes from the new logo.

---

## 2026-04-21 — Admin dashboard: caching, readable labels, and Guide tab

- **Requested by:** Keenan
- **Committed by:** Claude Code
- **Commit hash:** 27980a2

### In plain English (for Keenan)
The admin dashboard is now much faster — tabs load from cache instead of re-running every database query on every page view. All the confusing abbreviations like "DAU", "MRR", and "CAC" are spelled out in full so you don't need to remember what they stand for. There's a new "Guide" tab at the end of the tab bar that explains every single metric in the dashboard: what it measures, what a healthy number looks like, what counts as a red flag, and what to do about it. Every tab also has a small "Refresh" button in the top-right that shows when the data was last updated and lets you force-refresh when you want live numbers.

### Technical changes (for Jimmy)
- New file: `apps/web/src/lib/admin-cache.ts` — in-memory TTL cache with `getCached(key, ttlMs, fn)`, `invalidateCache(key)`, and `invalidateCachePrefix(prefix)`. No Redis dependency.
- Modified `apps/web/src/app/api/admin/metrics/route.ts`:
  - All tabs wrapped in `getCached` with per-tab TTLs (Overview 5min, Revenue 10min, Funnel/Ads 15min, AI Costs 2min, Content Factory 0/live, Feature Flags 1min, Guide infinite)
  - Accepts `?refresh=true` to invalidate cache for that tab
  - Added timing logs: `[metrics] tab=X range=Y cached=true/false duration=Xms`
  - Revenue tab: parallelized 7 queries that were sequential
  - Engagement tab: added DAU/MAU ratio calculation
  - Growth tab: renamed d1Rate to d0Rate for accuracy
  - New `getGuide()` handler (returns static content, infinite TTL)
- Modified `apps/web/src/app/admin/tabs/useTabData.ts` — added `refresh()` callback and `_meta` response parsing (cached, computedAt, durationMs)
- New file: `apps/web/src/app/admin/components/RefreshButton.tsx` — shows "Updated X ago", invalidates cache on click
- New file: `apps/web/src/app/admin/tabs/GuideTab.tsx` — full Guide tab with sidebar nav, metric cards with healthy/red-flag/action sections
- Modified all tab files (Overview, Growth, Engagement, Revenue, Funnel, Ads, AI Costs, Red Flags) — added RefreshButton, spelled out all abbreviation labels
- Modified `apps/web/src/app/admin/admin-dashboard.tsx` — added Guide tab to TABS array and routing, hid time range selector for Guide tab
- Modified `prisma/schema.prisma` — added 4 new indexes:
  - `User(createdAt)`
  - `Entry(userId, createdAt)` composite
  - `WeeklyReport(userId, createdAt)` composite
  - `ContentPiece(type, status, createdAt)` composite

### Manual steps needed
- [ ] `npx prisma db push` from home network (Keenan) — applies 4 new database indexes. No data migration, additive only.

### Notes
- DashboardSnapshot.date already has a unique constraint which implicitly creates an index, so no additional index was needed there.
- The cache is in-memory and resets on every Vercel redeploy — this is intentional for v1. If data freshness becomes an issue at scale, consider Redis.
- Revenue tab was running 7 sequential queries; now parallelized via Promise.all which should cut that tab's response time roughly in half.
- "D1 Activation Rate" was renamed to "Day 0 Activation Rate" since the query checks for a recording within 24h of signup (i.e., same day), matching the metric definition in the Guide.
- Content Factory tab is excluded from caching because it needs live data for the approve/reject workflow.
- The Guide tab is fully static (no API data), cached with infinite TTL, and uses a sidebar with anchor links for quick navigation.

---

## 2026-04-21 — Set up dual-audience progress tracking system

- **Requested by:** Keenan
- **Committed by:** Claude Code
- **Commit hash:** ce9e88a

### In plain English (for Keenan)
Set up a system so every code change is automatically logged with both a plain-English summary for Keenan and a technical summary for Jimmy. From now on, every Claude Code session will read this progress log before starting and append a new entry when done. No more guessing what shipped or what manual steps are still pending.

### Technical changes (for Jimmy)
- Replaced truncated Progress Tracking Rules section at top of `CLAUDE.md` with the full version
- Entry format: H2 date heading, requester/committer/hash metadata, four H3 subsections (plain English, technical changes, manual steps, notes)
- Includes writing guides with good/bad examples for each section type
- Adds requester identification rules (Keenan = business, Jimmy = technical) and manual step categories to always check (prisma db push, env vars, Vercel redeploy, Inngest resync)

### Manual steps needed
None.

### Notes
- This is the first entry using the new dual-audience format. All future entries follow this structure.
- The previous version of the Progress Tracking Rules section was truncated (missing writing guides, requester identification, and manual step categories). This commit replaces it with the complete version.
- progress.md itself was not reformatted — existing entries above "Current Focus" stay as-is. New entries go between this one and "Current Focus."

---

## Current Focus (updated 2026-04-21, mobile tab bar fix + production audit)
- **Mobile bottom tab bar — raised center mic button definitively fixed** (file: `apps/mobile/app/(tabs)/_layout.tsx`). Regression root cause: missing `overflow: "visible"` on `tabBarStyle` clipped the top ~25px of the circle on iOS, making it read as a flat mic icon. Fix is a one-line addition plus code-level constants + a JSDoc warning so future edits don't remove it.
  - Circle diameter: **64px** (constant `CIRCLE_SIZE`). Fill: **`#7C3AED`** (constant `BRAND_PURPLE`, matches light-mode active tint).
  - Raised offset: **`marginTop: -26px`** (constant `RAISED_OFFSET`).
  - Mic icon: **white (`#FFFFFF`), 28px**, Ionicons `mic`.
  - Shadow: `shadowColor: #7C3AED`, offset `{0, 6}`, radius `14`, opacity `0.45` light / `0.6` dark, `elevation: 10`.
  - Border: `4px` matching tab-bar bg (`#0B0B12` dark, `#FFFFFF` light) — creates the "scooped out" look without a real clip-path.
  - **The critical bit:** `tabBarStyle.overflow: "visible"`. Without this iOS clips the raised portion. Inline JSDoc + file-top comment flag this so nobody removes it.
  - Inactive tab tint bumped from zinc-500 (`#71717A`) to `rgba(255,255,255,0.62)` / `rgba(39,39,42,0.62)` so Goals/Tasks/Insights/Entries are visibly readable when inactive, not washed-out grey.
  - Active tint unchanged: `#A78BFA` dark / `#7C3AED` light.
  - Center button stays purple whether Home is active or not — primary action, not a navigation indicator.
  - Commit `fix(mobile): prominent raised purple center mic button + pop on inactive tabs`.
- **Production readiness audit — read-only pass, findings at `docs/PRODUCTION_AUDIT_2026-04-21.md`.** 10 parallel subagents covered auth + session, data access, input validation, payment + subscription, secrets, resilience, privacy + compliance, admin, mobile, observability. No code changed; this is a decision document.
- **5 CRITICAL findings (must fix before public launch):**
  - C1 Gmail plus-addressing bypasses the DeletedUser tombstone → unlimited free trials by varying the local-part (`alice+N@gmail.com`). Fix at `lib/bootstrap-user.ts:140`.
  - C2 No Zero Data Retention agreement or header with Anthropic/OpenAI — raw transcripts + audio reach both providers without contractual data-minimization. Legal + trust risk for a mental-health-adjacent product.
  - C3 GDPR data export missing 8 user tables: StateOfMeReport, UserMemory, CalendarConnection, HealthSnapshot, Account, GoalSuggestion, UserFeatureOverride, UserLifeDimension. Article 15 coverage gap.
  - C4 Unbounded string columns (Goal.title/description, Task.title/description, Entry.transcript, admin ContentPiece.finalBody) — OOM + DB-bloat DoS vector.
  - C5 `sentry.edge.config.ts` has no `beforeSend` PII scrub — middleware errors can leak plaintext email/cookies/auth headers to Sentry.
- **12 HIGH findings.** Highlights: Inngest jobs not Sentry-instrumented (H1), RedFlag scanner is pull-only with no Slack/email alerts (H2), no IP-based signup rate limit enables farming (H3), 7 admin content-factory routes skip AdminAuditLog (H4), zero Zod coverage across ~41 mutations (H5), server-side PostHog track() bypasses cookie consent (H6). Full list in the audit doc.
- **10 MEDIUM + 6 LOW/accepted** documented separately.
- **No commits this pass.** Jim + Keenan decide which fixes to schedule.
- **Already production-grade (confirmed):** auth + session layer, IDOR posture across ~81 routes, Stripe webhook signing + idempotency, audio privacy (signed URLs + private bucket), public share links (128-bit random + expiry + noindex), SQL injection surface (all $queryRaw parameterized), XSS surface, client+server+mobile PII scrubbing in Sentry, account delete end-to-end, client-side cookie-consent gating, RedFlag primitive, admin audit trail for 8 high-impact actions.

## Previous Focus (2026-04-21, pre-beta hardening pass 2)
- **Pre-beta hardening — 8 commits, 2026-04-21 afternoon batch 2:**
  1. `c801098` — **Feature flag system (Part 1).** FeatureFlag + UserFeatureOverride + AdminAuditLog schema; `lib/feature-flags.ts` evaluator with per-request cache; `scripts/seed-feature-flags.ts` seeds 13 flags; gates wired into 16 routes + 3 Inngest fns. Disabled features 404 (not 403 — don't leak existence).
  2. `21bfda2` — **Admin Feature Flags UI (Part 2).** New "Feature Flags" tab: inline toggle, rollout slider, tier dropdown, per-user override lookup + required audit reason. API at `/api/admin/feature-flags/*`.
  3. `1d18aaf` — **Admin Users tab (Part 3).** Paginated metadata-only list, detail modal, 3 scoped actions (extend trial, password-reset magic link, delete account with email-match confirm). NO entries, transcripts, goals, tasks, audio, or AI observations visible. All writes hit AdminAuditLog.
  4. `651860a` — **Stripe portal verified (Part 4).** Already wired at `/api/stripe/portal` + `/account`. Documented the Stripe-Dashboard one-time config (branding, cancellation flow, features, return URL) in `docs/STRIPE_PORTAL_SETUP.md` for Jim to run through.
  5. `91317d2` — **Crisis resources (Part 5).** `/support/crisis` page (988, Crisis Text Line, IASP, SAMHSA) + persistent <CrisisFooter> on authenticated pages + /account Support & safety section + onboarding step 2 footnote. NO AI-based detection; passive resources only.
  6. `1ec8d14` — **RLS verification (Part 6).** `scripts/verify-rls.ts` live-checked prod: 5/12 tables have RLS on, 7 are missing. Exact ALTER TABLE SQL in `docs/RLS_STATUS.md` for Jim to paste into Supabase SQL editor. App uses `postgres` role so RLS is defense-in-depth; in-route session checks remain the runtime gate.
  7. `9b52501` — **AdminAuditLog panel on Overview.** Last 20 admin actions visible at a glance. Per-action renderer for flag toggles, override upserts/deletes, trial extensions, magic-link sends, account deletes.
  8. (this commit) — **docs + PROGRESS.md.** `docs/TIER_STRUCTURE.md` placeholder for post-beta tier design; this entry.
- **Manual steps Jim owes post-deploy:**
  1. `npx prisma db push` — lands FeatureFlag + UserFeatureOverride + AdminAuditLog tables.
  2. `set -a && source apps/web/.env.local && set +a && npx tsx scripts/seed-feature-flags.ts` — seeds 13 flags (apple_health_integration=OFF, calendar_integrations=OFF, state_of_me_report=PRO-tier, rest ON).
  3. Paste the ALTER TABLE block from `docs/RLS_STATUS.md` into Supabase SQL editor to enable RLS on the 7 newer tables. Then re-run `npx tsx scripts/verify-rls.ts` to confirm.
  4. Stripe Dashboard portal config per `docs/STRIPE_PORTAL_SETUP.md` (one-time, test mode then live).
  5. Smoke-test `/api/test-sentry-error` (from the earlier audit commit) once signed in as admin.
- **Earlier 2026-04-21 audit commits (still apply):**
  - `6eaebf7` — sync-path auto-embed for Ask-Your-Past-Self
  - `af4bde9` — web TS2352 cleared
  - `976db26` — `/api/test-sentry-error` admin smoke endpoint
  - `e290511` — `/api/goals/[id]` DELETE rate-limited
- **Ask-Your-Past-Self activation (manual, Jim):** (1) `cd apps/web && npx prisma db push` to land the `Entry.embedding Float[]` column if not yet applied to prod; (2) confirm `OPENAI_API_KEY` is set in Vercel Production **and** `apps/web/.env.local`; (3) run `set -a && source apps/web/.env.local && set +a && npx tsx apps/web/scripts/backfill-entry-embeddings.ts` to backfill legacy entries. No pgvector extension needed — embeddings are `Float[]` and cosine similarity runs in app memory.
- **Post-deploy verifications Jim owes the beta:** (a) hit `/api/test-sentry-error` once signed in as admin — confirm the error surfaces in Sentry dashboard within 30s with readable stack; (b) provision Sentry env vars in Vercel (SENTRY_DSN/ORG/PROJECT/AUTH_TOKEN) + EAS secret (EXPO_PUBLIC_SENTRY_DSN) per `docs/ERROR_MONITORING.md`; (c) mobile HealthKit client is intentionally deferred — the iOS entitlements, usage descriptions, and @kingstinct/react-native-healthkit plugin are all NOT in `apps/mobile/app.json` by design; server-side Apple Health tables, routes, and correlation card already ship and activate the moment a mobile client uploads HealthSnapshot rows.
- **Vercel Production is not receiving auto-deploys from main** — see "Blocked on Inngest verification" below for full diagnosis. Triage this first when back: `vercel --prod` from the repo, or redeploy from the dashboard. Every paywall + security + Inngest PR from 2026-04-19 onward is on `main` but not live.
- After a fresh deploy: run the Task 1 Inngest smoke test (`curl https://www.getacuity.io/api/inngest`). Expect 503 until ENABLE_INNGEST_PIPELINE is flipped. Then optionally fix the 503-gates-GET/PUT-sync-too issue flagged in the blocker doc.
- Manual provisioning (in order): Upstash marketplace integration → Inngest Cloud keys → PostHog account + keys → flip ENABLE_INNGEST_PIPELINE=1 in Production → verify end-to-end with a real test recording.
- After the infrastructure is live, the remaining paywall work is UX copy (rewrite /upgrade per §4.2) + ghost-state chart annotations (§5.7) + Life Map interstitial (§5.5) + post-trial email (§4.3). No more schema migrations expected before beta.

## Previous Focus (2026-04-20)
- **Manual steps for Jim to finish pre-beta infra** (2026-04-20):
  1. **Upstash Redis via Vercel marketplace** — add the integration for the `acuity-web` Vercel project. Auto-populates `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in all environments. Until done, rate limiters fail-open with a one-time Vercel-log warning.
  2. **Inngest Cloud keys + ENABLE_INNGEST_PIPELINE** — per the "Inngest Cloud Setup" checklist. `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` in Production; leave `ENABLE_INNGEST_PIPELINE` unset until the next Vercel deploy confirms Inngest Cloud has synced the acuity app.
  3. **Flip ENABLE_INNGEST_PIPELINE=1 in Vercel Production** — only after the smoke-test event (`test/hello`) fires successfully against the deployed `/api/inngest` endpoint.
  4. `isAdmin` flip for your own user row via Supabase SQL editor (carry-over from 2026-04-19).
- After those four, all pre-beta infra is live; the next product pass is the paywall UX (upgrade-page copy rewrite, ghost-state annotations on insights, Life Map interstitial).

## Blockers / Waiting On
- Keenan to add Jimmy as a proper collaborator on Vercel (currently using Keenan's login as a workaround), Supabase, Stripe, Anthropic, OpenAI, Resend, Expo/EAS, Cloudflare, Meta Business Suite.

## Open Decisions
- **Apple IAP strategy** — RevenueCat + Apple IAP, or iOS as log-in-only companion. Blocks any iOS App Store submission.
- **Push notifications in v1 or v2** — Product Brief says v2; habit-loop nature of the app suggests v1.
- **Price: $12.99 or $19/mo** — Product Brief + Personas say $12.99; Product Spec + Onboarding Spec say $19. Not resolving now per Jimmy (focus is build/deploy), but must be locked before paywall/App Store listing.

---

## Decisions Made
- **2026-04-17** — Repo transferred from `keypicksem/Acuity` → `jimheelerdigital/Acuity`. Vercel connection survives transfer.
- **2026-04-17** — Repo to stay under `jimheelerdigital` personal account for now. Heeler Digital GitHub org to be created and repo re-transferred later once TestFlight is submitted.
- **2026-04-17** — Repo remains public for now; revisit visibility later.
- **2026-04-17** — **Paywall approach: soft transition, not cliff.** The Day 14 Life Audit's closing paragraph transitions directly into a preview of Month 2 (Monthly Memoir, week-over-week deepening, 60-day retrospective). Upgrade screen sells "next chapter of the journey," not "unlock features." Users who don't subscribe retain permanent access to their 14-day trial history; new forward-looking outputs (weekly reports going forward, monthly memoir, new patterns, life audits beyond Day 14) are paywalled. Rationale: product is an ongoing journey, not a feature set; Peak-End Rule and retention math both favor soft transition over a feature cliff. The product brief's 14-day free trial model is unchanged — this decision is about the emotional and structural experience of the trial-to-paid transition.
- **2026-04-17** — **Proposed post-trial journey roadmap** (not yet committed spec — subject to refinement):
  - Day 14 (trial end): Life Audit #1 — the emotional anchor
  - Day 30: Monthly Memoir (already in spec §1.9)
  - Day 60: "Your First Two Months" — side-by-side comparison of Day 1 vs Day 60 themes, goals, language patterns. The "look how far you've come" moment.
  - Day 90: Quarterly Life Audit — 90-day version of the Day 14 audit, deeper with more data
  - Day 180: Half-year memoir — longer-form artifact covering 6 months
  - Day 365: Annual memoir — the flagship retrospective
- **2026-04-17** — Paywall plan rev 2 APPROVED by Jim. Ready for implementation after Inngest migration lands as hard prerequisite. Per-resolution entries follow:
- **2026-04-17** — Day 14 Life Audit generation: daily Inngest cron at ~22:00 user-local, one day before `trialEndsAt`. Rationale: users must arrive at Day 14 already holding the audit; lazy-generate on load risks empty-state cliff.
- **2026-04-17** — Weekly reports for post-trial free users: STRICT rule (Option A). No new weekly reports after trial expiry. Rationale: Life Audit is the final free forward-looking artifact; any grace window muddies the value proposition.
- **2026-04-17** — Stripe checkout: REMOVE `trial_period_days` entirely. Acuity's `trialEndsAt` is the canonical trial clock; Stripe subscription starts paid immediately on subscribe. Rationale: single source of truth; avoids the 14+7 = 21-day compounding trial; matches "14-day free trial model is unchanged."
- **2026-04-17** — Tasks and goals post-trial: remain PATCH-able; no new ones born without recording. Named explicitly in the post-trial email copy so it isn't a surprise in either direction.
- **2026-04-17** — Post-trial chart ghost states: render annotations on mood/life-map/theme charts at the `trialEndsAt` boundary ("Trial ended — new entries resume with subscription"), muted tail continuing. No silent gaps. Rationale: silence feels broken; annotation is the soft-transition move.
- **2026-04-17** — Life Map refresh for post-trial users: OVERRIDE of Claude Code's "disabled button" recommendation. Instead: button stays visually enabled; on tap, full-screen "Month 2 lives here" interstitial links to `/upgrade?src=lifemap_interstitial`. Rationale (Jim): a greyed-out button is passive guilt that sits forever; tap-to-interstitial converts on intent, which is the soft-transition pattern at the interaction level.
- **2026-04-17** — Life Audit closing paragraph prompt: written as a few-shot (hand-crafted example embedded inside the system prompt), NOT just instructed. Rationale: instructions alone drift into coach voice (imperatives, exclamations); example anchors voice in ~350 tokens for near-zero inference cost.
- **2026-04-17** — "Continue it →" Life Audit CTA: ships as body copy for MVP; instrumented as `upgrade_page_cta_clicked { ctaVariant: 'continue_it_body' }`. Threshold for A/B testing a button variant: click-through <15% over ≥50 post-trial users with a viewed audit. Both click-through and post-click conversion inform the decision.
- **2026-04-17** — Day 14 Life Audit rollback plan (new §7): if audit is not COMPLETE when paywall would enforce, extend `trialEndsAt` by 48h, re-attempt every 6h, generate template-based degraded fallback after 48h, enforce only then. Invariant: a user never hits the paywall without having read their Life Audit.
- **2026-04-17** — Analytics events (new §8): 6 required events (`trial_started`, `life_audit_generated`, `life_audit_viewed`, `upgrade_page_viewed`, `upgrade_page_cta_clicked`, `subscription_started`) must ship with the feature. Recommended platform: PostHog (single SDK web+mobile+server; cohort analysis first-class). Alternative: minimal in-house `AnalyticsEvent` Prisma table. Jim to pick before shipping.
- **2026-04-17** — `entitlements.ts` test coverage (new §9): full-matrix Vitest unit tests required BEFORE enforcement lands. Every `subscriptionStatus` × `trialEndsAt` × `now()` combination + rollback-mode cases + property-based partition check. No test suite exists in the repo yet — Vitest setup is part of this PR.
- **2026-04-17** — Price deferred via `{{PRICE_PER_MONTH}}` template variable throughout copy drafts. Push notifications remain v2 per Open Decisions; post-trial email carries Day 14 touchpoint for v1.
- **2026-04-17** — Inngest migration is a HARD PREREQUISITE for the paywall implementation. Day 14 cron cannot ship reliably on the current sync pipeline (120s Vercel cap, no retries). Sequencing updated in plan §5.8.
- **2026-04-18** — Analytics platform: PostHog. Rationale: single SDK spans web + mobile + server; cohort/funnel/retention analysis first-class; free tier covers first several months. Flagged for iOS App Store privacy questionnaire at submission time (declare Identifiers + Usage Data + Diagnostics under App Privacy; name PostHog in the privacy policy).
- **2026-04-18** — Test framework: Vitest confirmed. Rationale: native ESM, faster than Jest, trivial to configure for Next.js 14 + TypeScript.
- **2026-04-18** — No user backfill because there are no existing real users — only test accounts. Backfill step dropped from plan §5.8 and Next Up. Post-deploy, test accounts are either manually updated (`UPDATE "User" SET "trialEndsAt" = now() + interval '14 days' WHERE "trialEndsAt" IS NULL;`) or deleted and recreated.
- **2026-04-18** — Mobile `/upgrade` link: keep the web redirect for the paywall PR; IAP remains a separate unresolved decision. Instrument `?src=mobile_profile` on the mobile upgrade button regardless so cross-surface conversion is measurable today (mobile → web checkout) and carries over once IAP lands (mobile → native sheet).
- **2026-04-18** — Degraded Day 14 Life Audit fallback shape: full template, NO Claude call. Template-filled narrative (entry count, top themes from `Entry.themes`, mood average, Life Map deltas, goal-mention counts) + hard-coded closing paragraph drafted inline in plan §7.3. Tag record `degraded: true`. Rationale: if Claude is the failure mode, the fallback can't depend on Claude; a hard-coded closing is resilient above the DB layer. Voice matched to the §4.1 few-shot so users never know they got the fallback.
- **2026-04-18** — Accept Supabase project ref exposure rather than migrate. Rationale: no paying users, password rotated, project ref alone doesn't grant access. Migration will happen naturally when consolidating Supabase under Heeler Digital org.
- **2026-04-19** — **Inngest migration: polling confirmed as v1 client completion mechanism.** Supabase Realtime deferred until post-launch; revisit only if polling cost scales poorly (e.g., 500+ users where poll volume warrants Realtime for bandwidth). Locks `INNGEST_MIGRATION_PLAN.md` §0 decision 1 / §6.2. Rationale: polling works on Hobby without depending on RLS (blocked on Supabase access), same code for web + mobile, perceived latency at 2s intervals is tolerable for 10–30s typical processing.
- **2026-04-19** — **Inngest migration: recording duration hard cap set at 120s server-side, not 180s.** Enforced as a `413 Payload Too Large` in `/api/record` whenever `durationSeconds > 120`. Web client cap also moves from 60s → 120s to match mobile. Rationale: product spec is explicit about the 30–120s range; Acuity's positioning ("60 seconds in") is contradicted by a 180s ceiling. The cap is primarily for UX/product fit + cost control, NOT for Hobby viability (at 120s audio, Whisper typically completes in 3–7s, well inside Hobby's 10s per-step ceiling). Corrected `INNGEST_MIGRATION_PLAN.md` §12 framing accordingly — the genuine Hobby argument is that every *outer* API route (the handlers the client calls) becomes <2s by offloading work to Inngest steps.
- **2026-04-19** — **Inngest migration: retry budgets split by function type.** User-interactive functions (`processEntryFn`, `refreshLifeMapFn`) use `retries: 2` → worst-case user-visible latency ~3 min. Background/scheduled functions (`generateWeeklyReportFn`, `day14AuditCronFn`) use `retries: 3` → worst-case ~14 min but no user is watching, so patience for vendor outages wins. Locks `INNGEST_MIGRATION_PLAN.md` §0 decision 3 / §3.1–§3.4. Note: Inngest SDK controls backoff timing internally (exponential with jitter); `retries` count is the only user-facing knob.
- **2026-04-19** — **Inngest migration: paywall PR interleaving approved.** Paywall PRs 1–7 (from `IMPLEMENTATION_PLAN_PAYWALL.md` §5.8) can run in parallel with Inngest PRs 1–6. Paywall PR 8 (Day 14 cron) is the hard join point — it depends on Inngest being complete in production. Locks `INNGEST_MIGRATION_PLAN.md` §0 decision 4.
- **2026-04-19** — **Inngest migration: env var names standardized.** `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` (the SDK's conventional names — no prefix, no custom casing). Plus the feature-flag env var `ENABLE_INNGEST_PIPELINE` (string `"1"` = on, anything else = off). All three added to `.env.example` + `turbo.json` `globalEnv` array in PR 1.
- **2026-04-19** — **Inngest migration: account owner is `jim@heelerdigital.com`.** Inngest Cloud account created under the Heeler Digital email so the account has the right home long-term. Not tied to a personal email.
- **2026-04-19** — **Inngest migration: PARTIAL entry UX is toast-only for v1** (Claude Code recommended default). An entry that succeeded on the happy path but whose memory or lifemap update failed gets `Entry.status = PARTIAL` + a client-side toast: *"Your entry is saved, but Life Matrix updates will catch up shortly."* No manual retry action. Rationale: the next successful entry re-triggers the memory/lifemap update path; a manual "refresh failed updates" button adds UI noise for a 1%-or-less case that self-heals. Revisit once we see it in production.
- **2026-04-19** — **Inngest migration: observability tooling deferred.** Inngest's own dashboard is sufficient for run-level visibility in v1. Add Sentry / Datadog post-launch if our-code-path errors aren't traceable enough from Vercel logs + Inngest dashboard alone.

---

## Known Issues / Tech Debt
- `CLAUDE.md` is a generic WAT-framework template, not project-specific. Replace or remove when we have real context to put there.
- AI pipeline runs inside Vercel serverless request (10s timeout). Whisper + Claude extraction can exceed this. Needs Inngest migration.
- ~~Prisma schema changes pending `npx prisma db push`~~ — done 2026-04-19; `UserMemory`, `Waitlist`, and the new `User.isAdmin` column are live in prod.
- Stripe webhook endpoint needs to point to `https://getacuity.io/api/stripe/webhook`.
- Model references in specs are stale (`claude-sonnet-4-5`, `claude-opus-4-6`). Current is `claude-sonnet-4-6` / `claude-opus-4-7`. Needs global update in prompts/calls.
- Mobile app built with Expo SDK 54, EAS configured, not yet on TestFlight.
- **2026-04-17** — Supabase DB password leak at commit `799a635` (`apps/web/.env.local.save`, public repo): password rotated 2026-04-18; `.gitignore` + gitleaks hook shipped 2026-04-18. Residual: the `.env.local.save` blob still exists in git history — purge with `git filter-repo` is tracked in Next Up (hygiene only; rotation is the actual fix since the repo was public). Supabase connection logs should still be audited since 2026-04-13 10:37 CST.
- **2026-04-17** — Stale Claude model in prod: `packages/shared/src/constants.ts:79` uses `claude-sonnet-4-5`. Update to `claude-sonnet-4-6` (or `claude-opus-4-7`).
- **2026-04-17** — `/api/record` has `export const maxDuration = 120` (Vercel Pro-only). Blocks Hobby + caps long entries. Fix with Inngest.
- **2026-04-17** — `eas.json` `production` profile is `{}`. No distribution, no iOS signing, no `ascAppId`/`appleTeamId`. `eas submit` cannot succeed.
- **2026-04-17** — `app.json` missing `ios.buildNumber`. App Store will reject.
- **2026-04-17** — Mobile `app.json` `owner: "keypicksem"` (Keenan's Expo account). Needs transfer or recreate under Jimmy's account before submission.
- **2026-04-17** — Prisma schema missing `onDelete: Cascade` on `Entry/Task/Goal/WeeklyReport/LifeMapArea/UserMemory.user` relations and on `Task.entry`. Orphan rows on user or entry delete.
- **2026-04-17** — Prisma schema missing indexes on every `userId` FK and on commonly-filtered fields (`Entry.status`, `Entry.entryDate`, `Task.status`, `Goal.status`).
- **2026-04-17** — No migrations directory; repo uses `prisma db push`. No schema-change audit trail.
- **2026-04-17** — Naming inconsistencies: `UserMemory.relationshipSummary` (singular) vs `DEFAULT_LIFE_AREAS` key `"relationships"` (plural). Separately, `/api/goals` defaults `lifeArea` to `"PERSONAL"`, which isn't in the six-area vocabulary.
- **2026-04-17** — Legacy duplicate recording screen `apps/mobile/app/record.tsx` (600s max, raw fetch, no result UI) conflicts with `app/(tabs)/index.tsx`. Delete.
- **2026-04-17** — `apps/mobile/lib/supabase.ts` creates a Supabase client that is never imported. Dead code.
- **2026-04-17** — No push notifications on mobile (`expo-notifications` not installed). Habit-loop product likely wants this at v1.
- **2026-04-17** — No IAP / RevenueCat on mobile; `/upgrade` opens web URL. Won't pass Apple 3.1.1.
- **2026-04-17** — Hardcoded admin email `keenan@heelerdigital.com` in `/api/waitlist/route.ts:65`.
- **2026-04-17** — Hardcoded Meta Pixel (`5752790988087389`) and Contentsquare script in `apps/web/src/app/layout.tsx`. Move to env.
- **2026-04-17** — Landing page (`apps/web/src/components/landing.tsx` lines 1291/1603/1949) ships fake testimonials + placeholder avatars with TODOs. FTC/Meta ad risk.
- **2026-04-17** — Stripe webhook has no idempotency (`event.id` not persisted); no `customer.subscription.updated` handler; unchecked `session.customer` / `invoice.customer` casts.
- **2026-04-17** — No rate limiting on `/api/auth/*`, `/api/waitlist`, or `/api/record` (the expensive one).
- **2026-04-17** — `/api/record` silently swallows memory + life-map update failures; entry marked complete while Life Matrix drifts.
- **2026-04-17** — `/api/weekly` POST has no `maxDuration` and no transaction around "create GENERATING → Claude → update"; mid-call crash leaves stuck reports.
- **2026-04-17** — `/api/lifemap` N+1: creates default areas in a loop. Use `createMany({ skipDuplicates: true })`.
- **2026-04-17** — `Task.SNOOZED` path writes `snoozedUntil` but nothing ever un-snoozes. Also verify `TaskStatus` enum actually has `SNOOZED`.
- **2026-04-17** — Prisma version skew: root `^5.22.0` vs `apps/web` `^5.16.0`. Unify.
- **2026-04-17** — Unused deps: `nodemailer` (web, replaced by Resend), `expo-audio` / `expo-auth-session` / `@supabase/supabase-js` (mobile, unused).
- **2026-04-17** — `scripts/test-drip-emails.ts` hardcodes recipient + sender, no dry-run; will blast real emails if `RESEND_API_KEY` is set.
- **2026-04-17** — `turbo.json` missing `lint` / `typecheck` tasks — root scripts exist but Turbo doesn't orchestrate them.
- **2026-04-17** — No test suite anywhere in the repo.
- **2026-04-17** — No onboarding flow implemented (mobile or web) despite onboarding spec.

---

## Blocked on Inngest verification (2026-04-20)

**Problem:** Production at `https://www.getacuity.io` is running a deploy from **Sun Apr 19 2026 16:32 EDT**, ~16 hours old. 29 commits have landed on `main` since then. None are in the live Production alias. Every newly-added route (`/api/inngest`, `/api/entries/[id]/audio`, `/api/user/delete`, `/account`, `/privacy`, `/terms`, `/api/life-audit` when it lands today) returns a **cached 404** at the www alias because it didn't exist when Vercel last crawled. Meanwhile routes that existed in the 15h-old build (`/api/weekly`, `/api/record`) respond correctly (401 / 405 as appropriate).

**Diagnosis:**
- `vercel ls --prod` shows the last Production deploy at 15h old. All more recent commits on origin/main have NOT triggered new Production deploys. Preview deploys are presumably still firing on non-main branches, but we haven't used branches in this workflow since 2026-04-19.
- Local `npx next build` manifests include every missing route (e.g. `ƒ /api/inngest` shows in the build output). Code is correct.
- Vercel edge cache is serving `x-matched-path: /404` for the missing routes (`x-vercel-cache: HIT`, `age: 53643s`) — that proves the alias is resolving to the stale build, not that the new build is broken.

**Implication for Inngest smoke test:** The smoke test in Task 1 can't be executed until a fresh deploy lands. Code review says the route is correct:
- `GET/PUT/POST /api/inngest` — gated by `ENABLE_INNGEST_PIPELINE === "1"` in `apps/web/src/app/api/inngest/route.ts`. With the flag unset (current state), every method returns 503. That's intentional so the endpoint is safely inert until Jim flips the flag.
- **This is a pre-existing design decision that will need revisiting:** Inngest's `serve()` handler needs to respond to GET/PUT sync requests from Inngest Cloud so the app registers. If the flag is off, 503 blocks sync too. **Recommendation:** change the route so GET/PUT always respond (allowing Inngest Cloud to sync the function list) and only POST dispatching is flag-gated. Not fixing today because I can't verify the fix against a live environment — deferred until Jim triggers a Production deploy and we can iterate.

**What Jim needs to do when back:**
1. `vercel --prod` from the repo root (authenticated as `keypicksem` who owns the `acuity-web` project), OR redeploy from the Vercel dashboard → Deployments → "…" → Redeploy. The dashboard route is lower-risk; no local-build-vs-remote-build drift.
2. Check GitHub ↔ Vercel integration on the Vercel dashboard → Project → Settings → Git. Confirm `main` is the production branch and auto-deploy is enabled.
3. After the deploy, re-run the Task 1 smoke test: `curl -s https://www.getacuity.io/api/inngest` should return a 503 initially (flag off, by design). Then flip the route to allow GET/PUT-regardless-of-flag per the recommendation above — that's a one-file change and a fresh commit/deploy.

No PROGRESS.md "Next Up" additions yet — this blocker blocks step 2 of the existing "Inngest Cloud Setup" checklist.

---

## Parked / Deferred

- **Deferred-post-beta list (surfaced by 2026-04-21 pre-freeze audit):**
  - **Apple Health mobile client.** Server-side (HealthSnapshot model, `/api/health/snapshots`, `/api/insights/health-correlations`, correlations card) is live. Mobile HealthKit native module (@kingstinct/react-native-healthkit), iOS entitlements/usage descriptions, and `lib/health-sync.ts` are deferred per `docs/APPLE_HEALTH_INTEGRATION.md` — requires EAS dev build on real iPhone to verify. Profile button is honest ("Arriving in the next app update") — no ghost UI.
  - **Calendar integration (Google/Outlook/Apple).** Only the foundation shipped (`CalendarConnection` schema, `/api/integrations/calendar/connect` returns 501, /account cards render disabled with "Coming soon" copy). Full OAuth + ingestion pipeline in `docs/CALENDAR_INTEGRATION_PLAN.md`.
  - **Referral reward consumer hook.** `lib/referrals.ts::recordReferralConversion` accrues reward days on `User.referralRewardDays` but the Stripe renewal webhook that consumes accrued days back into `trialEndsAt` extension is TODO (flagged inline). Non-blocking for beta — accrual works, so no referrer loses credit; the credit just doesn't redeem until the hook lands.
  - **Ask-Your-Past-Self mobile UI.** Web-only per commit 19b91a5. Web has `/insights/ask`; mobile tab has no entry point. Users on mobile have to open the web app. Non-blocking because the feature is a bonus, not a primary flow.
  - **Drag-to-reparent on mobile Goals tab.** Web /goals supports drag; mobile tab does not. `/api/goals/[id]/reparent` already accepts the write server-side, so the deferral is UI-only.
  - **Static PNG mood-trend chart in weekly digest email.** Spec says PNG; shipped textual summary ("4 good, 2 neutral, 1 low") to avoid adding `@vercel/og` or node-canvas to the bundle pre-beta. Follow-up only if digest engagement signals need the image.
  - **Sentry Session Replay.** Disabled in `sentry.client.config.ts` pending a masking allowlist — DOM content on journal pages is high-risk for transcript leaks. Errors + traces still capture normally.
  - **Mobile `TS2786` dual-React error noise.** `apps/mobile/package.json` uses React 19.1 + @types/react 19.1, `apps/web` uses React 18.3 + @types/react 18.3. Metro's dual-resolution causes TS to see two JSX element contracts; runtime unaffected. Will resolve when we bump web to Next 15 + React 19.
  - **`.env.local.save` git-history purge.** Hygiene only — Supabase password rotated 2026-04-18, so the residual git history doesn't grant fresh access. Run `git filter-repo` + force-push when convenient; not beta-blocking.

- **Waitlist drip email sequence (parked 2026-04-19 — updated with activation checklist 2026-04-20).** Templates + DB tracking + fail-closed route ready to go; scheduler + launch-specific copy are the activation work.

  **Current state:**
  - `apps/web/src/lib/drip-emails.ts` — 4 HTML email templates (emails 2-5 at days 2, 5, 10, 14).
  - `Waitlist.emailSequenceStep` column — tracks per-user progress.
  - `/api/waitlist` route — sends email 1 (welcome) inline on signup, bumps `emailSequenceStep` to 1.
  - `/api/cron/waitlist-drip` route — iterates waitlist users, finds next due email per `daysAfterSignup` in `DRIP_SEQUENCE`, sends via Resend, bumps step. Fail-closed on missing `CRON_SECRET` (S6, 2026-04-19).
  - **Scheduler: NONE.** No `vercel.json`, no GitHub Action, no Inngest cron — nothing invokes `/api/cron/waitlist-drip`. The drip never fires.

  **Why parked, concretely:**
  - Email 4 copy assumes the product is about to launch: *"putting the final touches"*, *"Your rate stays forever"*, *"Priority access before the public launch"*.
  - Email 5 copy assumes launch is imminent: *"doors are opening soon"*, *"This is the last email before we open the doors"*, *"You'll be among the very first people to get access"*, *"Get ready. It's almost time."*
  - Sending those templates to today's waitlist — with no launch date — trains Resend's deliverability model that we send unsubstantiated urgency and burns user trust when the promised "very soon" turns out to mean months. Email 2 (Day 2 — describes the product) and email 3 (Day 5 — the weekly report feature) are both launch-date-agnostic and could ship on their own.

  **Activation checklist — when launch date is real, do these in order:**
  1. **Decide launch date + price.** Price decision gate from `Open Decisions` above ($12.99 vs $19) must resolve first — email 4 hardcodes $12.99 right now (line 336 of drip-emails.ts, and again at line 353 in the "Price highlight" block). Grep + swap.
  2. **Rewrite email 4 + email 5 copy** against the now-real date. Specifically:
     - Email 4 line 312 (`"We're putting the final touches..."`): swap for a specific "Doors open MMM DD" sentence.
     - Email 4 lines 335-338 (founding member benefits): no change needed — these still work.
     - Email 5 line 398 (`"This is the last email before we open the doors"`): swap for "Launch is [N] days out" or similar.
     - Email 5 line 451 (`"Get ready. It's almost time."`): still fine if the date is real.
  3. **Decide send cadence:** the schedule is days 2, 5, 10, 14 after signup — fine. The ~5-day gap between email 2 and email 3 might want a refresh based on test-audience pacing feedback if you have any. If not, keep as-is.
  4. **Wire the scheduler — pick one:**
     - **(Recommended) Inngest cron.** Add a `waitlistDripFn` in `apps/web/src/inngest/functions/` with `triggers: [{ cron: "0 14 * * *" }]` (daily 2pm UTC = 9am CT, sensible for North American waitlist). Function body: port the logic from `/api/cron/waitlist-drip/route.ts`. Register in `/api/inngest/route.ts`. Requires `ENABLE_INNGEST_PIPELINE=1` in Vercel Production (which is the current target state anyway). No `CRON_SECRET` needed — Inngest handles auth. Retire the `/api/cron/waitlist-drip` route after the migration lands.
     - **(Alternate) `vercel.json` cron.** Add `{ "crons": [{ "path": "/api/cron/waitlist-drip", "schedule": "0 14 * * *" }] }` at repo root. Keep the existing route. Requires `CRON_SECRET` to be set in Vercel Production — Vercel Cron auto-sends the right `Authorization: Bearer <CRON_SECRET>` header when the env var is present. Vercel Hobby allows 1 cron/project (this would be it); Pro allows 40.
  5. **Add a `DRIP_WAITLIST_ENABLED` env flag gate** at the top of either the Inngest function or `/api/cron/waitlist-drip`: `if (process.env.DRIP_WAITLIST_ENABLED !== "1") return { skipped: "drip-disabled" }`. Provides a kill-switch separate from the cron itself; flip this to start/stop sends without touching the schedule.
  6. **Test procedure:**
     a. Seed 3 throwaway waitlist entries via psql with varying `createdAt` (1 day ago, 4 days ago, 9 days ago) and `emailSequenceStep = 1` (so they're due for emails 2, 3, 4 respectively).
     b. Manually invoke the cron handler via curl (with CRON_SECRET) or Inngest dashboard → run the function.
     c. Check Resend logs — three distinct emails should have gone out.
     d. Check the DB — `emailSequenceStep` should be 2, 3, 4 respectively.
     e. Invoke again — nothing should send (schedule not due for another 24h minimum, for the users who just advanced).
     f. Clean up the three throwaway rows.
  7. **Monitor the first real send:** Resend dashboard → check for bounces or complaints. If the first day shows > 2% complaint rate, pause via the `DRIP_WAITLIST_ENABLED` flag and investigate. Expected healthy complaint rate is < 0.3%.

  **Pre-beta note:** nothing about the paywall or Inngest migration depends on the drip shipping. The drip is a marketing-funnel lever, not a product blocker. Fine to leave parked until launch week.

---

## Done

### 2026-04-21 — afternoon pre-beta hardening batch 2 (8 commits)
Feature flag system, admin-facing flag + user control panels, Stripe portal documentation, crisis resources, RLS verification, and an admin audit log. Every admin write path now records to AdminAuditLog with canonical slugs from `lib/admin-audit.ts::ADMIN_ACTIONS`.

- **`c801098` (P1) Feature flag system.** Schema (FeatureFlag + UserFeatureOverride + AdminAuditLog), `lib/feature-flags.ts` (isEnabled + isEnabledForAnon + gateFeatureFlag + resetFeatureFlagCache), 13-flag seed script, gates in 16 routes + 3 Inngest crons. 404-on-disabled posture.
- **`21bfda2` (P2) Admin Feature Flags tab.** PATCH API for enabled/rollout/tier; GET/POST/DELETE API for per-user overrides; tab UI with inline toggle, rollout slider, tier dropdown, user-lookup-by-email override panel with required reason.
- **`1d18aaf` (P3) Admin Users tab.** Paginated list with search, detail modal that is deliberately metadata-only (no entries, transcripts, goals, tasks, audio, AI output), three actions: extend trial (1-90 days + reason), send password reset, delete account (email-match confirm). Writes AdminAuditLog.
- **`651860a` (P4) Stripe portal documented.** Already wired (`/api/stripe/portal` + account-client.tsx:458). New `docs/STRIPE_PORTAL_SETUP.md` captures the Stripe Dashboard one-time config.
- **`91317d2` (P5) Crisis resources.** `/support/crisis` static page with 4 resource cards + immediate-risk callout; persistent `<CrisisFooter>` mounted in root layout (authenticated-only via `useSession()`); /account Support & safety section; /support amber callout + footer link; onboarding step 2 footnote. Explicit product decision: NO AI-based crisis detection, passive only.
- **`1ec8d14` (P6) RLS verification.** `scripts/verify-rls.ts` ran live against prod — result: 5/12 tables have RLS on, 7 are missing (Theme, ThemeMention, UserInsight, LifeMapAreaHistory, StateOfMeReport, HealthSnapshot, UserLifeDimension). Exact ALTER TABLE SQL emitted in `docs/RLS_STATUS.md`. App connects with the `postgres` role so RLS is defense-in-depth, not a runtime enforcement layer for our code.
- **`9b52501` Admin audit feed on Overview.** New `/api/admin/audit?limit=N` endpoint + `RecentAdminActions` component. Shows last 20 admin writes with per-action detail (flag toggle result, rollout %, override target, trial extension days + reason, hashed email for deletes). Admin emails hydrated once, not N times.
- **This commit (P7/docs).** `docs/TIER_STRUCTURE.md` placeholder capturing current vocabulary, requiredTier semantics, and open questions for post-beta tier design.

**Session totals:** 8 commits on top of the morning's 4 audit-pass commits. Web `npx tsc --noEmit` clean. No deploys triggered (still waiting on Vercel auto-deploy per 2026-04-20 blocker). Mobile untouched.

### 2026-04-21 — afternoon pre-beta-freeze audit (4 commits)
Audited today's 8 morning workstreams (Apple Health, Ask-Your-Past-Self, State of Me, Configurable Life Matrix, Referral Rewards, Mobile theme-map pinch-zoom, Calendar foundation, Goals ARCHIVED status) + the post-noon polish commits (recharts install, turbo.json env vars) for TODOs, ghost UI, missing error states, and broken integrations. Result: no ghost buttons, one functional gap, one TS cleanup, one observability verification gap, one rate-limit gap.

- **`6eaebf7` — sync-path auto-embed fix.** The Ask-Your-Past-Self feature's embed-entry step only existed in `process-entry.ts` (async Inngest path). Added the same fail-soft block at the end of `pipeline.ts::processEntry()` so sync-path entries get indexed too. Prevents a silent class of "entries invisible to semantic search" bugs when `ENABLE_INNGEST_PIPELINE` is unset.
- **`af4bde9` — pre-existing TS2352 cleared.** `validateLifeAreaMentions()` return cast through `unknown`. Web `npx tsc --noEmit` now passes clean. Mobile still has TS2786 noise from React 18 vs 19 @types drift — deferred-post-beta.
- **`976db26` — `/api/test-sentry-error` smoke endpoint.** NextAuth session + `isAdmin` gated. Throws a timestamped marker synchronously by default, or async via `?kind=async`. Gives Jim a one-call Sentry verification post-deploy.
- **`e290511` — rate-limit `/api/goals/[id]` DELETE.** The only un-rate-limited Goals mutation. Wrapped with `userWrite` (30/min/user).

**Audit verifications (no code changed):**
- State of Me: cron registered in `inngest/route.ts:54`, scheduled `0 8 * * *` daily, POST manual trigger at `/api/state-of-me` with 30-day cooldown, UI button wired. Fully shipped.
- Configurable Life Matrix: extraction prompt is hardcoded to canonical 6-area vocabulary by design — user labels are display-layer only (`life-map.tsx`). No accidental mixing; matches the 29db161 commit intent.
- HealthKit entitlements / infoPlist / plugin all absent from `apps/mobile/app.json` — **intentional** per `docs/APPLE_HEALTH_INTEGRATION.md` (mobile client deferred). Not fixing until the native module ships.
- Rate-limit coverage: `askPast` (10/day), `userWrite` (30/min), `goalReparent` (20/min), `shareLink` (10/hr), `dataExport` (1/7d) all wired. State-of-Me POST uses a custom Prisma-backed 30-day rate-check instead of the Upstash limiters (accepted — simpler given the monthly cadence).
- Secret scan: no new committed secrets. `.env.local.save` from 2026-04-13 is already documented; Supabase password rotated 2026-04-18; residual is history-only hygiene.

**Session totals:** 4 commits, all tiny scoped fixes. `cd apps/web && npx tsc --noEmit` clean. Mobile typecheck: only pre-existing dual-React TS2786 noise. No deploys triggered (Vercel auto-deploy still blocked per 2026-04-20 diagnosis — Jim runs `./scripts/deploy-main.sh` when back).

### 2026-04-20 — evening batch (7 commits, autonomous multi-task session)
Jim stepped away for several hours with a 7-task queue. All committed + deployed individually via `./scripts/deploy-main.sh` (Vercel auto-deploy still broken per 2026-04-20 morning Task 1 blocker). One commit per task, typecheck + build run after each, pre-existing `lib/pipeline.ts:388` cast error left alone per AUDIT.md §3.8.

- **Task 1 (Inngest): split /api/inngest flag gate by HTTP method** (commit `11476f2`). Root-cause on the 2026-04-20 smoke-test session: gating GET/PUT behind `ENABLE_INNGEST_PIPELINE` blocked the Inngest Cloud sync handshake — Cloud uses GET to fetch the function catalog + PUT to register, neither of which spends tokens. Now only POST is flag-gated (step invocation = Whisper + Claude burn). Long comment block in `route.ts:30-60` prevents a future contributor from "fixing" this back to uniform gating. Deployed successfully; once Jim provisions Inngest Cloud keys, GET/PUT will 200 (currently 500s on missing `INNGEST_SIGNING_KEY`, which is correct — the handler validates env at construction).
- **Task 2 (waitlist drip): park with activation checklist** (commit `0e95f72`). Picked path (b) after evaluating path (a, ship pre-launch): drip copy is too launch-date-anchored (emails 4 + 5 reference the beta-open moment) for pre-launch sending. Parked state now has a 7-step activation checklist in PROGRESS.md "Parked / Deferred" section: price decision, email 4 + 5 copy rewrites with line numbers, scheduler choice (Inngest cron vs `vercel.json`), DRIP_WAITLIST_ENABLED flag, test procedure, first-send monitoring plan.
- **Task 3 (Apple IAP): decision doc** (commit `7e63de2`). New `docs/APPLE_IAP_DECISION.md`. Options A (RevenueCat + IAP), B (log-in only, no mobile purchase UI), C (free app + Safari upgrade redirect). Recommended C. Covers App Store Review Guideline 3.1.3(b) Multiplatform Services carve-out (what lets us stay in C legally), 15–30 % Apple cut math, RevenueCat pricing, family sharing edge cases, sandbox environments, explicit upgrade criteria for moving C → A (>15 % `mobile_profile` attribution + >20 % cross-device drop-off). No implementation; 14-page decision doc.
- **Task 4 (mobile paywall UX polish)** (commit `7a46539`). (a) `GET /api/user/me` endpoint (`apps/web/src/app/api/user/me/route.ts`) — session-gated subscription-status refresh for the mobile foreground-refresh pattern from IAP doc §5. Selective projection (no Stripe IDs, no isAdmin); `Cache-Control: private, no-store`. (b) `apps/mobile/contexts/auth-context.tsx` — new AppState listener fires refresh() on any background→active transition (so users who upgrade via Safari see the new state on app return without a sign-out/in). refresh() tries /api/user/me first, falls back to /api/auth/session. (c) `apps/mobile/lib/auth.ts` User type gains `trialEndsAt?: string | null`. (d) `apps/mobile/app/(tabs)/profile.tsx` upgrade menu item rewritten for App Store 3.1.1 compliance — "Upgrade to Pro" / "Unlimited recordings & insights" → "Manage plan on web" / "Opens your account in a browser", icon `star-outline` → `globe-outline`, URL adds `?src=mobile_profile` for PostHog attribution.
- **Task 5 (onboarding scaffold)** (commit `dfa556a`). New `UserOnboarding` Prisma model with cascade relation + `User.onboarding` back-ref (applied to prod via `prisma db push`, 4.29s clean). 8 step component stubs in `apps/web/src/app/onboarding/steps/` driven by a single-source-of-truth `steps-registry.ts`. `OnboardingShell` client component handles progress bar + back/skip/continue nav, URL-driven via `router.push('/onboarding?step=N')`. `completeOnboarding()` server action upserts `completedAt` + `currentStep=8`. `dashboard/page.tsx:18-30` now redirects users with `UserOnboarding.completedAt == null` (or no row) into `/onboarding?step=${currentStep}`. Step components are stubs with TODO-marked copy + state-persistence gaps — content decisions open (welcome tone, referral source list, life-area priority UX, Day-14 preview wording). Not yet wired: `createUser` event → `/onboarding` redirect, PostHog instrumentation on step advances.
- **Task 6 (security audit closeout pass)** (commit `e99d3b1`). Re-verified every ✅ claim in SECURITY_AUDIT.md §11 against current `main` via codebase grep. 11 of 13 items fully resolved with file-path + line-number citations. 1 still-open 🔴: Supabase RLS verification (manual Jim-in-dashboard step, no code can resolve). 1 new 🟡 surfaced: Meta Pixel `TrackCompleteRegistration` fires on every authenticated dashboard visit, not just new signups — inflates reported conversions + minor privacy concern for mental-health-adjacent product. New §12 spot-audit of every route/component added since 2026-04-19: `/api/user/me`, `/onboarding` + `UserOnboarding`, `/api/inngest` GET/PUT split, dashboard onboarding redirect, mobile AppState refresh, Meta Pixel scope, PostHog instrumentation — all graded individually with verdict.
- **Task 7 (test-user seed + cleanup scripts)** (commit `99a338a`). `scripts/seed-test-user.ts` creates a User row with configurable `trialEndsAt` (via `--days-into-trial 0..14+`), subscriptionStatus, optional completed `UserOnboarding` row, optional sample `Entry` rows spread over the last N days. Safety gate: refuses emails not matching `@test.getacuity.io` / `@example.com` / `+test@getacuity.io` patterns. `scripts/cleanup-test-users.ts` is dry-run by default; `--yes` required to execute, `--max 20` batch cap, pattern must contain `@test.` / `@example.` / `+test`. Cascades via User FK for DB deletes; best-effort Supabase Storage prefix purge under `voice-entries/${userId}/`; hand-cleans `VerificationToken` by email. npm scripts `test-user:seed` + `test-user:cleanup` added to root package.json. Both scripts syntax-validated + safety-gate-tested locally.

**Session totals:** 7 tasks shipped. 7 commits. 6 production deploys (Task 7 scripts-only, no deploy). 1 prod Prisma schema migration (`UserOnboarding`). No regressions introduced. One new 🟡 security finding logged (Meta Pixel scope — fix before public beta).

### 2026-04-20 — morning batch (7 commits)
- **Task 6 (analytics): PostHog integration** (commit `5eb2eb9`). Installed `posthog-js` + `posthog-node`. New `lib/posthog.ts` with typed `AnalyticsEvent` union + `track()` helper that pipes all properties through the safeLog sanitizer (hashed email, redacted transcript/name/audio). New client `<PostHogProvider>` with hardened defaults (session replay off, ip=false, autocapture off, respect_dnt). Wired all six events from §8.3: `trial_started` (createUser), `life_audit_generated` (both happy-path and degraded-fallback), `life_audit_viewed` (audit view page), `upgrade_page_viewed` (pulls `?src`), `upgrade_page_cta_clicked` (with ctaVariant), `subscription_started` (webhook, with daysSinceSignup + daysIntoTrial). Fail-open on missing env vars. Manual step for Jim: sign up at PostHog Cloud US, add `POSTHOG_API_KEY` + `NEXT_PUBLIC_POSTHOG_KEY` to Vercel.
- **Task 5 (security yellows): session/cookie hardening + error sanitization** (commit `1936a4b`). NextAuth config now declares `cookies.sessionToken` explicitly with `__Secure-` prefix in prod + httpOnly/sameSite=Lax/secure pinned. New `lib/api-errors.ts::toClientError(err, status, opts)` returns generic copy in production and raw err.message in dev. Migrated `/api/record` error paths to the helper — production responses no longer leak Supabase/Anthropic/OpenAI error strings. Stripe webhook signature errors left raw (Stripe's retry dashboard needs the detail).
- **Task 4 (paywall): unified 402 handling across write UIs** (commit `195d6c9`). New `<PaywallBanner>` component with §4.2 soft-transition copy + `parsePaywallResponse(res)` helper. Wired into insights-view (weekly report generation) and life-map (refresh) so 402s no longer become generic "Failed to generate" errors. Record button kept as-is (dedicated /upgrade redirect better for its flow). `src` tag defaults per call site so PostHog sees the origin.
- **Task 3 (Inngest): mobile client polling (PR 5 mobile)** (commit `b5cf679`). New `apps/mobile/hooks/use-entry-polling.ts` mirroring the web hook: same backoff (2s×3, 4s, 8s, 15s, 30s-plateau), same 3-min budget. Refactored `apps/mobile/app/(tabs)/index.tsx` to dual-mode (201 sync → ResultCard inline, 202 → ProcessingView stepper → polling → ResultCard, 402 → native Alert with "Continue" → opens web `/upgrade?src=mobile_profile` in system browser, 429 → retry-after copy). PARTIAL entries render with amber header/notice. Extra cleanup effect on unmount. **Manual QA required** — Expo dev server not available in this environment; pre-existing mobile NativeWind className TS drift hides mobile typecheck, but the new code contributes no new error patterns.
- **Task 2 (paywall): Day 14 Life Audit generator + degraded fallback** (commit `c6e986c`). **The flagship paywall-adjacent piece.** Added `CLAUDE_FLAGSHIP_MODEL` constant (`claude-opus-4-7`), new `LifeAudit` Prisma model (applied to prod via `prisma db push`, 4.79s clean), `lib/prompts/life-audit.ts` with the §4.1 few-shot example embedded in the system prompt + `DEGRADED_CLOSING` hard-coded copy from §7.3 + `buildDegradedAudit()` deterministic template path, `inngest/functions/generate-life-audit.ts` with 4 steps + retries=3 (background) + onFailure that fires the degraded-fallback write (the "user never hits the paywall without having read their audit" invariant from §7.4), `api/life-audit/route.ts` (POST async-only, returns 503 when ENABLE_INNGEST_PIPELINE unset — no sync fallback by design), `insights/life-audit/[id]/page.tsx` with long-form render + themes arc + soft-linked "Continue it →" body-copy CTA per §4.1. Day 14 cron upgraded from stub to real candidate-query + event-dispatch logic. End-to-end DB lifecycle verified against prod with a throwaway 10-entry user (cascade cleanup confirmed via User.delete).
- **Task 1 (Inngest verification): BLOCKED** (commit `04bc308` — diagnosis only, no code). Production is serving a 15-hour-old deploy that predates all new routes from 2026-04-19 onward. Vercel auto-deploy from main has stopped firing. Full diagnosis + Jim's two-step recovery path in the "Blocked on Inngest verification" section above.

### 2026-04-20
- **Task 9 (paywall): removed Stripe `trial_period_days` from checkout** (commit `ffd63be`). Subscription now starts paid immediately on Stripe's side; Acuity's `trialEndsAt` is the sole trial clock. Closes the 14+7=21-day compounding-trial window that existed pre-fix. Webhook path unchanged — `checkout.session.completed` still writes `subscriptionStatus: "PRO"` unconditionally.
- **Task 8 (paywall): trialEndsAt set on createUser** (commit `cf5a0ef`). NextAuth `createUser` event writes `subscriptionStatus: "TRIAL"` + `trialEndsAt: now + 14 days` before the existing LifeMapArea seed. Verified with a throwaway test user: delta from now = 1,209,599 seconds (14d minus ~1s RTT). Legacy users with null trialEndsAt are not backfilled per the 2026-04-18 "test accounts only — delete + recreate or manually UPDATE" decision.
- **Task 7 (paywall): entitlements enforcement at three write endpoints** (commit `ee626d9`). Shared `lib/paywall.ts::requireEntitlement(flag, userId)` wraps the entitlements helper and returns `{ ok: false, response: NextResponse(402) }` with `{ error: "SUBSCRIPTION_REQUIRED", message, redirect: "/upgrade?src=paywall_redirect" }` on reject. Wired into `/api/record` (canRecord), `/api/weekly` (canGenerateNewWeeklyReport), `/api/lifemap/refresh` (canRefreshLifeMap), after auth + rate limit, before work. Stale-session fallback (user row missing) soft-locks to `/auth/signin` instead of /upgrade. `/api/life-audit` skipped — route doesn't exist yet, lands with the paywall-PR Life Audit generator. 7 Vitest integration-shape tests covering PRO / active TRIAL / expired TRIAL / FREE / PAST_DUE / stale session. Total suite: 62/62.
- **Task 6 (Inngest): Day 14 audit cron stub** (commit `d99069c`). Scheduled function `day-14-audit-cron` at `0 22 * * *` UTC, registered alongside the existing four. Queries users with `subscriptionStatus="TRIAL"` + `trialEndsAt` in the next 24h. Logs a `safeLog.info("day-14-audit-cron.would_generate", { userId, email, trialEndsAt })` line per candidate. NO real audit generation — that's paywall-PR scope. Proof point for the scheduled-job primitive ahead of the paywall Life Audit lands.
- **Task 5 (Inngest PR 5): web client polling for async entry pipeline** (commit `aaffd32`). New `hooks/use-entry-polling.ts` hook with exponential backoff (2s×3, 4s, 8s, 15s, 30s-plateau) and 3-minute wall-clock budget. `record-button.tsx` refactored to a three-way fetch response handler: 201 → sync ResultCard (legacy), 202 → set polledEntryId → stepper-UI (QUEUED → TRANSCRIBING → EXTRACTING → PERSISTING) → ResultCard, 402 → redirect to `/upgrade?src=paywall_redirect`, 429 → rate-limited error message. Partial entries render with an amber "Partial" badge + inline notice. Mobile untouched. 6 Vitest cases on the pure-logic internals.
- **Task 4 (S9): lib/supabase.ts → supabase.server.ts with `import "server-only"` guard** (commit `f72755d`). All five import sites updated. Accidental browser-bundle exposure of `SUPABASE_SERVICE_ROLE_KEY` now fails at Next.js build time for any static import from a `"use client"` file.
- **Task 3 (S8): HTML-escape user content in email templates** (commit `7d00bfd`). Minimal `escapeHtml` helper; wrapped every user-supplied interpolation in the waitlist admin-notification template, the waitlist welcome email, and all four drip-sequence templates. Drip cron now strips CR/LF from the display name before interpolating into the subject line (header-injection defense). 6 Vitest cases for escapeHtml.
- **Task 2 (S7): strip PII from server logs via `safeLog` helper** (commit `2302205`). New `lib/safe-log.ts` sanitizes `email` → 8-char sha256 prefix (preserves correlation for debugging without plaintext), redacts `name`/`transcript`/`audioPath`/`audioUrl`/`phoneNumber` → `<redacted>`. Recurses into nested objects + arrays. Migrated 20+ debug console.log calls in `/api/waitlist` to two structured `safeLog.info()` checkpoints. Migrated the drip-cron failure branch. 7 Vitest cases.
- **Task 1 (S5): rate limiting via Upstash Redis across expensive endpoints** (commit `e907ed2`). `@upstash/ratelimit` + `@upstash/redis` installed. Five configured sliding-window limiters: `expensiveAi` (10/hr/user — record, weekly, lifemap/refresh), `auth` (5/15min/IP — signin POSTs only), `waitlist` (3/hr/IP), `accountDelete` (3/day/user), `audioPlayback` (60/min/user — replaces the S4 in-process stopgap, deleted). `checkRateLimit()` fails open with a one-time warning when `UPSTASH_REDIS_REST_URL` is unset. `rateLimitedResponse()` returns canonical 429 with Retry-After + X-RateLimit-* headers. Vitest alias for `server-only` shims to a no-op for testability. 11 Vitest cases.
- **Test-suite totals**: **62 passing** across 6 files (25 entitlements + 11 rate-limit + 7 safe-log + 6 escape-html + 6 polling + 7 paywall). Zero flaky, zero failing, ~250ms wall-clock.

### 2026-04-19
- **Privacy Policy + Terms of Service stubs shipped** at `/privacy` and `/terms` (commit `ac52682`). Pre-legal-review baseline. Privacy covers data we collect (audio, transcripts, AI extractions, account, subscription, analytics, ops logs), why we collect each, the seven named subprocessors with privacy-policy links (Anthropic, OpenAI, Supabase, Stripe, Resend, Vercel, Inngest), retention (indefinite while active, deletion-on-request with 30-day backup purge, ~7 yr Stripe records with redaction), GDPR Art. 15/17/20 + CCPA-mapped rights with `privacy@getacuity.io` channel + 30-day SLA, 13+ children's policy, security posture, change-notification commitment. Terms covers eligibility (18+), account responsibility (including consent for recording other people), acceptable use (no illegal/harassment/reverse-engineering/scraping/resale), subscription terms (14-day free trial, `{{PRICE_PER_MONTH}}`/mo, auto-renew, cancel anytime, no partial refunds, 30-day price-change notice, Stripe's 3-week retry window), content ownership (user owns; we license for service delivery only), the **callout-styled "Acuity is not therapy" disclosure** with 988 / 116 123 / findahelpline references, warranty disclaimer, liability cap (greater of 12 months fees or $100), termination, governing law via `{{JURISDICTION}}` template variable. Footer links in `landing-shared.tsx` + `landing.tsx` rewired from `#` to `/terms` + `/privacy`; Contact `#` → `mailto:hello@getacuity.io`. The auth/signin page already had `<a href="/terms">` + `<a href="/privacy">` in its "By continuing you agree…" copy — those links resolved 404 until this PR. Two template variables left for Jim: `{{PRICE_PER_MONTH}}` (Open Decisions: $12.99 vs $19) and `{{JURISDICTION}}` (governing law). Stubs are not legal-review-grade; Jim takes them through real legal review before public beta.
- **Life-area vocabulary reconciled** (commit `d9e4994`). Resolves a long-running inconsistency that's been flagged in `AUDIT.md` and `PROGRESS.md` since the audit landed: three vocabularies were live (constants.ts had Health/Wealth/Relationships/Spirituality/Career/Growth, web+mobile goal-list had Personal/Work/Health/Relationships/Finance/Learning, product spec specified CAREER/HEALTH/RELATIONSHIPS/FINANCES/PERSONAL/OTHER). Adopted the product spec as canonical. Three forms in code: `LIFE_AREAS` UPPER_CASE enum stored on `LifeMapArea.area` and `Goal.lifeArea`, `LIFE_AREA_PROMPT_KEYS` lowercase form for Claude prompts + UserMemory column suffixes, `LIFE_AREA_DISPLAY` for user-facing strings. UserMemory schema migration applied via psql in a single transaction (12 column renames: wealth*→finances*, relationship*→relationships*, spirituality*→personal*, growth*→other*). LifeMapArea data migration: 12 rows rewritten Title-Case→UPPER_CASE with refreshed display name + color + icon; 5 stragglers from a third pre-existing seed vocabulary on Keenan's account ("Health & Fitness", "Career & Work", "Finance", "Learning & Growth", "Fun & Creativity") deleted; sortOrder re-aligned to the new canonical order. Code touched: shared constants + types, lifemap prompts (compression/insight/extraction), memory.ts, auth.ts createUser seed, /api/lifemap GET, web + mobile goal-list maps, web + mobile insights lookup (matches on `.enum` not `.name`), pipeline.ts extraction prompt schema. Backward-compat note: existing `Entry.rawAnalysis` JSON keys ("wealth"/"spirituality"/"growth") won't show up under the new lookup but prod has 2 test users with no real data so the cosmetic gap is acceptable; new entries write the new vocabulary correctly.
- **Inngest PR 4 (refresh-lifemap) shipped** (commit `55a436b`). Same pattern as PR 2 + PR 3. New `apps/web/src/inngest/functions/refresh-lifemap.ts` with `retries: 2` (user-interactive), per-user concurrency=1, **10-minute debounce per userId** (coalesces back-to-back refresh-button taps into one Claude pair). Two steps: `maybe-compress-memory` (conditional on `lastCompressed > 7d ago`) and `generate-insights`. `onFailure` logs only — refresh failures are non-disruptive (the user's existing Life Map remains in place; same button retries). `/api/lifemap/refresh` route gated dual-path: async returns 202 in <100ms, sync path preserved verbatim.
- **Inngest PR 3 (generate-weekly-report) shipped** (commit `fde08df`). Background-job retry semantics (`retries: 3`, per-user concurrency=1). Four steps: `record-run-id` (sets WeeklyReport.inngestRunId, flips status to GENERATING), `load-entries-for-week` (re-verifies ownership + min-3 entries, NonRetriable on insufficient), `generate-narrative` (Claude call), `persist-report` (status=COMPLETE). `onFailure` marks placeholder FAILED with errorMessage. `/api/weekly` route dual-path: async creates WeeklyReport QUEUED + dispatches event + returns 202; sync path preserved verbatim. Schema updates: `WeeklyReport` gained `errorMessage` + `inngestRunId` + status default flipped GENERATING→QUEUED + inline state-vocabulary comment (QUEUED|GENERATING|COMPLETE|FAILED). Applied to prod via `prisma db push` cleanly (3.95s). **Stale Claude model fix piggybacked**: `CLAUDE_MODEL` constant updated `claude-sonnet-4-5` → `claude-sonnet-4-6` (single-line change flows to extraction, weekly synthesis, memory compression, lifemap insights). Grepped tree for stragglers — none in code.
- **Inngest PR 2 (process-entry) shipped** (commit `de3ee8c`). 8-step processEntryFn ports the synchronous pipeline to Inngest with `retries: 2` (user-interactive), per-user concurrency=1, throttle 10/hr per user. Steps: record-run-id → download-audio → transcribe-and-persist-transcript → build-memory-context → extract → persist-extraction → update-user-memory → update-life-map. Memory + lifemap steps are catch-inline (set Entry to PARTIAL with reason on failure rather than failing the whole run); transcribe / extract / persist propagate to onFailure handler which maps to FAILED (no transcript) vs PARTIAL (transcript saved, downstream failed). `/api/record` route dual-path: async creates Entry QUEUED + uploadAudioBytes + dispatch event + return 202; sync path preserved verbatim. New `apps/web/src/lib/audio.ts` with `getEntryAudioPath(entry)`, `uploadAudioBytes()` (no signing — aligns with SECURITY_AUDIT §4), and `mimeTypeFromAudioPath(path)`. `EntryDTO` gained `audioPath` field; `/api/entries` selects both audioPath + audioUrl during deprecation window.
- **Schema expansion for Inngest async pipeline** (commit `6230348`). Entry gained `audioPath` (object path replacing the to-be-deprecated audioUrl), `errorMessage`, `partialReason`, `inngestRunId`. Status default `PENDING`→`QUEUED`. Inline comment documenting the full state vocabulary (QUEUED|TRANSCRIBING|EXTRACTING|PERSISTING|COMPLETE|PARTIAL|FAILED + legacy PENDING/PROCESSING). Applied via psql ALTER TABLE in one transaction (Prisma's binary hit a transient P1001 against the Supabase pooler; psql worked instantly on the same URL).
- **Inngest migration PR 1 (bootstrap) shipped.** Installs `inngest@^4.2.4` in the web workspace; creates `apps/web/src/inngest/client.ts` (singleton Inngest client, app id `"acuity"`), `apps/web/src/inngest/functions/hello-world.ts` (one trivial smoke-test function triggered by `test/hello` event), `apps/web/src/app/api/inngest/route.ts` (App Router handler that wraps `serve()` from `inngest/next` and exports `GET`/`POST`/`PUT`, gated by the `ENABLE_INNGEST_PIPELINE === "1"` feature flag — returns 503 otherwise so the route is safely inert by default); adds `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `ENABLE_INNGEST_PIPELINE` to `.env.example` and to `turbo.json` `globalEnv`. Note: Inngest v4 (current) dropped the `EventSchemas`/`fromRecord<T>` typed-events API from v3 — the plan doc's client.ts example uses the v3 pattern. For PR 1 the client is untyped; typed events will come back when the full function suite lands (we can use per-function typed `event.data` or wait for a v5 Standard-Schema approach). The v4 `createFunction` signature is 2 args with `triggers: [{ event }]` in opts; updated accordingly. Typecheck passes; only remaining TS error in the tree is the pre-existing `lib/pipeline.ts:388` cast (AUDIT.md §3.8 adjacent — not touched in this PR). Manual setup steps for Jim checklisted in the new "Inngest Cloud Setup" section above.
- **Inngest migration plan** written to `./INNGEST_MIGRATION_PLAN.md`. Covers: current sync flow vs proposed async flow (diagrammed), Inngest setup (account + SDK + `/api/inngest` route + env vars), four function definitions (`processEntryFn` with 8 retryable steps, `generateWeeklyReportFn`, `refreshLifeMapFn`, `day14AuditCronFn` stub) + an `onFailure` catch-all, refactors of `/api/record` and `/api/weekly` to thin enqueue-and-return-202 shapes, client-side polling loop (recommended over Supabase Realtime for v1 — Realtime needs RLS which is blocked on Supabase access), `Entry.status` extended to `QUEUED | TRANSCRIBING | EXTRACTING | PERSISTING | COMPLETE | PARTIAL | FAILED` + new `errorMessage`/`partialReason`/`inngestRunId`/`audioPath` columns, feature-flag cutover via `ENABLE_INNGEST_PIPELINE` env var, "proven" criteria (7 days + 100 entries + forced-failure verification) before removing sync path, 10-PR migration sequence each testable in isolation, rollback plan (flip flag to 0 + cleanup query for orphaned QUEUED entries), and a §12 Hobby-viability check that walks every `/api/**` route — verdict: **Hobby is viable post-migration** if we enforce a 180s max server-side recording duration (keeps the transcribe step under Hobby's 10s per-step ceiling). Cost estimate: ~13.6K Inngest steps/month at 50-user beta scale, well within the 50K free tier; crossover to the $20/mo paid tier at ~180 users. Eight open questions flagged — none blocking for PR 1 (Inngest bootstrap with no behavior change).
- **Admin prerequisites verified against prod.** Linked repo to Vercel (`vercel link` → `keypicksems-projects/acuity-web` after switching to Keenan's Vercel login), pulled production env vars to `apps/web/.env.local` (gitignored correctly — `.env.*` rule in `.gitignore:14`). Ran `npx prisma db push` against prod Supabase: schema synced in 22.89s, no destructive-change warnings (the `isAdmin` column is nullable with a default). Verified via Prisma query against prod DB: User table has 2 rows (`jim@heelerdigital.com` + `keenan@heelerdigital.com`), both currently `isAdmin: false`. Jim flips his own flag manually via Supabase SQL editor. Separately: investigated the `/api/cron/waitlist-drip` invocation path (see Parked / Deferred above) — no scheduler wired anywhere.
- **Critical security fixes: admin auth (Next Up S1) + cron fail-closed (Next Up S6)** shipped on branch `fix/critical-security-admin-cron`. **Admin auth:** removed hardcoded `"acuity-admin-2026"` password from `apps/web/src/app/api/admin/dashboard/route.ts` and from the client page; added `isAdmin Boolean @default(false)` column to the `User` model in `prisma/schema.prisma` (not yet pushed — manual `prisma db push` step required). The API route now gates on NextAuth session + `isAdmin` lookup (401 if unauthenticated, 403 if not admin). The `/admin/dashboard` page is now a server component that `getServerSession`s, looks up `isAdmin`, and redirects to `/auth/signin` if logged out or `/dashboard` if logged in but not admin. UI moved to a new `admin-dashboard-client.tsx`; the old password form + sessionStorage cache are gone. **Cron fail-closed:** `/api/cron/waitlist-drip` returns 500 "Cron not configured" when `CRON_SECRET` env var is unset, 401 if header doesn't match. Grepped for other cron/admin-token fail-open patterns — none found (only one cron route exists in the repo). Branch pushed to GitHub but PR not opened yet (pending review of diff by Jim).
- **Security audit (public-beta readiness)** written to `./SECURITY_AUDIT.md`. Scope: RLS, API authorization/IDOR, service-role key exposure, audio bucket access, admin dashboard, NextAuth hardening, rate limiting, PII in logs, client-bundle leakage, account deletion. Three 🔴 CRITICAL findings block any public signup: (1) admin dashboard password `"acuity-admin-2026"` is hardcoded in source in a public repo (`apps/web/src/app/api/admin/dashboard/route.ts:4`) and the dashboard exposes real waitlist PII; (2) RLS status is unverifiable from the repo (no `supabase/` folder, no SQL policies, Prisma bypasses RLS via service-role connection) — needs live Supabase inspection before opening signups; (3) no account-deletion path anywhere in the codebase — GDPR Art. 17 / CCPA §1798.105 non-compliant the moment real signups start, and cascade is broken on six child relations so even a manual user delete would leave orphan rows. Also: `/api/cron/waitlist-drip` is fail-open if `CRON_SECRET` is unset (🟠), zero rate limiting anywhere (🟠), waitlist route logs PII to Vercel logs on every signup (🟠), admin-notification email HTML-injects user-supplied `name` (🟡), audio bucket state unconfirmed + signed URLs stored in DB expire after 1h with no re-sign route (🟠). Good news: every per-user API route enforces ownership correctly (no IDOR), service-role key is server-only today, no secrets in the client bundle, NextAuth defaults (HttpOnly/SameSite/Secure cookies, CSRF double-submit) are preserved. Full §11 prioritized fix list in the doc.
- **Credential leak audit** written to `./CREDENTIAL_LEAK_AUDIT.md`. Scope: `apps/web/.env.local.save` at commit `799a635` (2026-04-13, public repo). Findings: exactly one credential had a populated value — the Supabase DB password `KeenanJim525$` for project `rohjfcenylmfnqoyoirn`, appearing twice in raw connection strings prepended to line 1. Every other key in the file was an empty placeholder. No other `.env*` file has ever been committed besides `.env.example` (clean). `.gitignore` pattern `.env.local` is a literal match and does NOT cover `.env.local.save` — root cause. Recommended replacement: `.env` + `.env.*` + `!.env.example`. Full per-key classification + rotation order in the doc. Rotation queued in Next Up; Jim + Keenan do it manually.

### 2026-04-18
- **`.gitignore` hardened + gitleaks pre-commit hook installed.** Env block replaced with `.env` / `.env.*` / `!.env.example` (closes the `.env.local.save` loophole). Added AUDIT.md §8 patterns: `*.pem`, `*.p12`, `*.key`, `credentials.json`, `token.json`, `google-services.json`, `GoogleService-Info.plist`, `*.tfvars`. Husky 9 wired up at repo root; `.husky/pre-commit` invokes `gitleaks protect --staged` against `.gitleaks.toml` (extends gitleaks defaults + stack-specific rules for Anthropic, Resend, Supabase JWT, Postgres DSNs with inline passwords, Google OAuth `GOCSPX-`, Expo/EAS tokens, strict `AKIA…` AWS IDs). Verified: staging a file containing AWS's documented dummy access key (the one with the `…EXAMPLE` suffix AWS publishes for docs) and attempting `git commit` → hook exits 1, `leaks found: 1`. Test file deleted afterward.
- **Paywall plan rev 3** — all five pre-flight questions resolved. Analytics = PostHog. Tests = Vitest. No user backfill (no real users exist). Mobile keeps web redirect; `?src=mobile_profile` instrumented anyway for cross-surface measurement when IAP lands. Degraded Day 14 Life Audit fallback is full-template with no Claude call; hard-coded closing paragraph drafted inline in plan §7.3. Sequencing dropped the backfill step. `IMPLEMENTATION_PLAN_PAYWALL.md` is execution-ready behind the Inngest prerequisite.

### 2026-04-17
- **Paywall plan rev 2** — Jim approved with modifications. Added §7 (rollback for Life Audit failures: 48h extension + degraded fallback), §8 (6 required analytics events), §9 (Vitest full-matrix tests), §10 (price + push deferred). Overrode §5.5 (interstitial instead of disabled button for post-trial Life Map refresh). Rewrote §4.1 to embed hand-crafted example as a few-shot inside the Life Audit system prompt. Made Inngest migration a hard prerequisite in §5.8.
- **Soft-transition paywall implementation plan** written to `./IMPLEMENTATION_PLAN_PAYWALL.md`. Key finding while planning: the paywall effectively does not exist yet — `subscriptionStatus` is written by the Stripe webhook but never read as a gate anywhere, `trialEndsAt` is never populated, the Day 14 Life Audit generator doesn't exist, and the Stripe checkout's `trial_period_days: 7` conflicts with the upgrade-page copy's "14-day free trial." Plan covers entitlements helper, write-endpoint gating (not middleware), new `LifeAudit` + `Memoir` models, and concrete copy drafts.
- **Deep codebase audit** written to `./AUDIT.md` (Claude Opus 4.7). Covers architecture, per-feature build state, bugs/security, schema/DB, mobile TestFlight readiness, dependencies. 15 prioritized items; top of the list is rotating the leaked Supabase DB password.
- GitHub repo transferred to `jimheelerdigital`.
- Repo cloned locally to `~/Projects/Acuity`.
- VS Code opened on project.
- **[Pre-handoff, per Project Brief]** — Monorepo scaffold, Prisma schema, Supabase setup
- **[Pre-handoff]** — Next.js web: auth (Google + magic link) + middleware
- **[Pre-handoff]** — Web recording screen + `/api/record` route (Whisper + Claude pipeline)
- **[Pre-handoff]** — Task manager, Goals tracker, Insights page
- **[Pre-handoff]** — Weekly report generation + report card display
- **[Pre-handoff]** — Stripe checkout + webhook handler + paywall logic
- **[Pre-handoff]** — Expo mobile app: scaffold, auth, tab navigator
- **[Pre-handoff]** — 5 targeted landing pages + waitlist system
- **[Pre-handoff]** — Cloudflare DNS + Resend email verification

---

## Next Up (Priority Order)

### 🔴 Security — must ship before ANY public signup (from SECURITY_AUDIT.md §11)

~~S1.~~ ✅ **DONE 2026-04-19** — admin dashboard now gates on NextAuth session + `isAdmin` flag. Branch `fix/critical-security-admin-cron` pushed, PR pending review. Follow-ups required: (a) `npx prisma db push` once Supabase access is restored, (b) manually `UPDATE "User" SET "isAdmin" = true WHERE email = 'jim@heelerdigital.com';` for Jimmy's own account.
S2. **Verify Supabase RLS live.** Confirm RLS enabled + policies shipped on `User`, `Account`, `Session`, `VerificationToken`, `Entry`, `Task`, `Goal`, `WeeklyReport`, `LifeMapArea`, `UserMemory`, `Waitlist`. Screenshot and paste into a follow-up doc.
S3. **Ship account deletion.** New `DELETE /api/user/me` that purges every user-scoped table in a transaction + deletes the Supabase Storage `voice-entries/${userId}/*` prefix + archives the Stripe customer. Add `onDelete: Cascade` on the six child relations so the transaction works.
S4. **Audio bucket privacy.** Confirm `voice-entries` bucket is private. Add storage RLS scoped to `${userId}/` prefix. Store object path (not signed URL) in `Entry.audioUrl`; add authenticated route that re-signs on demand with ≤5-min TTL.

### 🟠 Security — must ship before public beta launch

S5. Rate limiting (`@upstash/ratelimit`) on `/api/record`, `/api/weekly`, `/api/lifemap/refresh`, `/api/auth/signin` (email), `/api/waitlist`.
~~S6.~~ ✅ **DONE 2026-04-19** — `/api/cron/waitlist-drip` is now fail-closed. `CRON_SECRET` must be set in Vercel Production or the route returns 500 (verify env var exists).
S7. Strip PII-logging `console.log` calls from `/api/waitlist/route.ts` (lines 9, 10, 17, 27, 29, 33, 41, 45, 54, 57, 59, 83, 84, 93, 95, 99, 102, 111).
S8. HTML-escape `name`/`email`/`source` in the waitlist admin-notification email template.
S9. Rename `apps/web/src/lib/supabase.ts` → `supabase.server.ts` with `server-only` import.

### Infrastructure / paywall path (pre-existing)

1. Purge `apps/web/.env.local.save` from git history (BFG or `git filter-repo`); force-push. Hygiene only — rotation is the actual fix because the repo was public.
2. Pull env vars from Vercel (`vercel env pull`).
3. Get web app running locally (`npm install` → `npm run dev`)
4. Push pending Prisma schema changes (`UserMemory`, `Waitlist`)
5. Verify Stripe webhook is live and pointed at `https://getacuity.io/api/stripe/webhook`.
6. **Inngest setup — migrate AI pipeline to background jobs.** HARD PREREQUISITE for the paywall plan below; Day 14 cron cannot ship reliably without it. **Plan:** `INNGEST_MIGRATION_PLAN.md` (2026-04-19) — 10 PRs, first is a no-behavior-change bootstrap. All §14 open questions resolved 2026-04-19. **Status:** PR 1 (bootstrap) shipped. PR 2 (define `processEntryFn` unwired) is next, gated on the "Inngest Cloud Setup" checklist above being completed.

### Paywall soft-transition implementation (from `IMPLEMENTATION_PLAN_PAYWALL.md` §5.8, rev 3)

Executes AFTER Inngest migration (step 6) is green on staging:

7. Set `trialEndsAt` in NextAuth `createUser` event; remove Stripe `trial_period_days`. No user-facing change. **No backfill.**
8. Add `LifeAudit` + `Memoir` Prisma models (plus `degraded` column + `trialEndsAtExtendedBy` on User); push to DB.
9. Wire PostHog SDKs (web + mobile + server); fire `trial_started` from `createUser`.
10. Build Life Audit generator, route, view page. Rendered to trial users only. Still no gating. Wire `life_audit_generated` + `life_audit_viewed`.
11. Add `entitlementsFor()` helper + Vitest unit tests covering the full §3 matrix + rollback cases. Tests pass before enforcement lands.
12. Enforce entitlements at the 4 write endpoints (`/api/record`, `/api/weekly`, `/api/life-audit`, `/api/lifemap/refresh`). Wire `?src=paywall_redirect`. Ghost-state annotations on history charts. Life Map interstitial for post-trial users.
13. Rewrite `/upgrade` page copy (two variants); wire `upgrade_page_viewed` + `upgrade_page_cta_clicked`; wire `subscription_started` in Stripe webhook. Add `?src=mobile_profile` to mobile upgrade button.
14. Inngest cron for Day 14 Life Audit pre-generation; full-template degraded fallback (hard-coded closing from plan §7.3); rollback path in the same PR.
15. Post-trial email campaign.

### Rest of the path to TestFlight

16. Build onboarding flow per onboarding spec (biggest chunk of work).
17. Decide Apple IAP strategy; implement RevenueCat if chosen.
18. EAS iOS build → TestFlight.
19. App Store Connect listing prep (privacy policy — include PostHog as sub-processor; App Privacy questionnaire; screenshots; description; permissions strings).

---

## Inngest Cloud Setup (action items — check off as completed)

PR 1 (code) is shipped, but Inngest doesn't do anything in production until this list is done.

**1. Create the Inngest Cloud account**
- [ ] Sign up at https://app.inngest.com/sign-up using `jim@heelerdigital.com`.
- [ ] Accept the terms; no credit card required for the Free tier.

**2. Create the Acuity app**
- [ ] Apps → + New App → name it `acuity` (must match `new Inngest({ id: "acuity" })` in `apps/web/src/inngest/client.ts`; renaming orphans history).
- [ ] Two environments should exist automatically: **Production** and a **Branch/Preview** environment. If only Production exists, create a Branch environment under the Environments tab — Inngest routes events by environment keyed off our deployment URL.

**3. Grab the keys from each environment**

Inngest dashboard → Apps → `acuity` → pick the environment → Settings → Keys.

Paste the values below as you collect them so future sessions can confirm which env matches which key. **Never commit populated values** — the gitleaks hook will block it.

_Production:_
- `INNGEST_EVENT_KEY` = ______________________________
- `INNGEST_SIGNING_KEY` = ______________________________

_Branch / Preview:_
- `INNGEST_EVENT_KEY` = ______________________________
- `INNGEST_SIGNING_KEY` = ______________________________

**4. Push the env vars into Vercel**

```
vercel env add INNGEST_EVENT_KEY      production
vercel env add INNGEST_SIGNING_KEY    production
vercel env add INNGEST_EVENT_KEY      preview
vercel env add INNGEST_SIGNING_KEY    preview
```

Leave `ENABLE_INNGEST_PIPELINE` **unset** or set to anything other than `"1"` until we're ready to activate. While unset, `/api/inngest` returns 503 "Inngest pipeline not enabled" on every invocation — the endpoint is safely inert.

**5. Register the deployment with Inngest**
- [ ] After a Vercel deploy with the three keys set, Inngest dashboard → Apps → `acuity` → Sync should auto-detect the `/api/inngest` handler. If it doesn't, trigger manual sync with the deployment URL.

**6. Flip the feature flag to activate (when ready for the smoke test)**
- [ ] `vercel env add ENABLE_INNGEST_PIPELINE production` → value `1`, redeploy.
- [ ] Send a test event from Inngest dashboard → Events → Send Event → name `test/hello`, data `{"message": "hello world"}`.
- [ ] Confirm the `hello-world` function run appears in the dashboard with the "log-greeting" step completed and the return value `{ ok: true, greeting: "Hello from Inngest: hello world" }`.

**7. Local dev**

For local development, set `ENABLE_INNGEST_PIPELINE=1` and either `INNGEST_DEV=1` (points events at the dev server) or copy the preview-env keys into `.env.local`. Run `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` in a second terminal — the dev UI is at http://localhost:8288.

---

## Notes for Future Sessions

- **Git workflow (set 2026-04-19):** default is to commit and push directly to `main`. Run `git pull --ff-only origin main` at the start of every session before making changes. Only create branches or open PRs when Jim explicitly asks for one.
- **Deploy to prod via `./scripts/deploy-main.sh`** (temporary workaround set 2026-04-20). Vercel's GitHub auto-deploy webhook is not firing — pushes land on GitHub but Production doesn't rebuild. The script pushes + triggers `vercel --prod` in one step. Guards: current branch must be main, warns on dirty tree, refuses if local is behind origin. Supports `--dry-run`. Retire when Vercel auto-deploy is fixed; see "Blocked on Inngest verification" for the root-cause recovery path.
- This repo is a Turborepo monorepo: `apps/web` (Next.js), `apps/mobile` (Expo), `packages/shared` (types/utils), `prisma/` (DB schema).
- Production domain is `getacuity.io` — deployed via Vercel (GitHub integration).
- Waitlist is live and collecting.
- Meta Pixel ID: `5752790988087389` — installed on landing pages.
- **`CREDENTIAL_LEAK_AUDIT.md` (2026-04-19)** is the per-key audit for the `.env.local.save` leak at commit `799a635`. Only one credential had a populated value (Supabase DB password); it has been rotated. The 23 other keys in the file were empty placeholders — no rotation needed on those. Residual concern (project ref exposure) accepted per 2026-04-18 decision.
- **`AUDIT.md` (2026-04-17)** is the authoritative current-state-of-the-codebase document. Read it before changing anything non-trivial. It catalogs architecture, per-feature build state, bugs, schema concerns, TestFlight blockers, and dependency drift, all with file:line references.
- **`INNGEST_MIGRATION_PLAN.md` (2026-04-19)** is the plan for moving the AI pipeline from synchronous Vercel functions to Inngest background jobs. Hard prerequisite for the Day 14 audit cron in the paywall PR (`IMPLEMENTATION_PLAN_PAYWALL.md` §5.1) and for moving the project off Vercel Pro onto Hobby. Read §11 for the 10-PR ship sequence (PR 1 is a no-behavior-change bootstrap), §12 for the Hobby-viability check per-route, and §14 for the 8 open questions that need Jim's input before PR 2.
- **`IMPLEMENTATION_PLAN_PAYWALL.md` (2026-04-18, rev 3)** is the execution-ready plan for the soft-transition paywall. All pre-flight questions resolved. Includes: exact `entitlementsFor()` rule (§3), file-by-file change list (§1), new schema models (§2 + §7 additions: `LifeAudit`, `Memoir`, `degraded` col, `trialEndsAtExtendedBy` on User), Life Audit few-shot prompt (§4.1), `/upgrade` page with `{{PRICE_PER_MONTH}}` template (§4.2), post-trial email (§4.3), rollback plan with hard-coded degraded closing paragraph (§7.3), PostHog event schema (§8), Vitest full-matrix coverage (§9), and deferred items including iOS App Privacy declarations (§10). **Inngest migration is a hard prerequisite** — do not start the paywall work until Inngest is shipped. Read §5.8 for the full sequenced ship order.
- **Three trial-length values don't agree today** (flagged in the paywall plan §0.3): Stripe checkout uses 7 days, `/upgrade` page copy says 14 days, schema default is `"TRIAL"` with `trialEndsAt` null. Decision says 14 days is canonical.
- **The Day 14 Life Audit does not exist** in code (only in marketing copy). Must be built as part of the paywall PR so the soft transition has a place to live.
