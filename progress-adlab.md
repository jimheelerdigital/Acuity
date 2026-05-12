# AdLab — Progress Log

**System:** AdLab — Automated Ad Research, Creative Generation, Launch & Optimization
**Lives inside:** Acuity Next.js app at `/admin/adlab/*`
**Gated to:** keenan@heelerdigital.com via middleware

---

## System Overview

**Purpose:** Configure a project once, run a topic brief, get angles → creatives → live Meta ads → 14-day monitored split test → auto-kill losers, auto-scale winners, learning loop into next cycle.

**First project:** Acuity. System is project-agnostic via configuration.

**Stack:** Next.js (existing), Prisma (existing), Supabase (existing), Anthropic API, OpenAI (gpt-image-2 for image creatives), Meta Marketing API via facebook-nodejs-business-sdk, HeyGen API (video creatives), Resend (existing), Vercel cron (existing).

**Human gates:** Keenan approves angles before creative; Keenan approves creatives before launch. Kill and scale decisions execute automatically.

**Build phases:**

1. Foundation, Schema, Admin Shell
2. Project Config UI
3. Research Agent
4. Creative Generator
5. Compliance Checker
6. Meta Ads Launcher
7. Performance Monitor + Decision Engine
8. Learning Loop + Polish

---

## Required Environment Variables

Add these to `.env.local` and Vercel:

| Variable | Purpose | Status |
|----------|---------|--------|
| `ANTHROPIC_API_KEY` | Claude API for research/creatives/compliance/learning | Already exists |
| `META_ACCESS_TOKEN` | Meta Marketing API system user token | Needs adding |
| `META_AD_ACCOUNT_ID` | Meta ad account (act_XXXXXXXXX format) | Needs adding |
| `META_API_VERSION` | Meta API version (default v21.0) | Needs adding |
| `OPENAI_API_KEY` | OpenAI gpt-image-2 for image creatives | Already exists (used by Whisper/embeddings) |
| `HEYGEN_API_KEY` | HeyGen video avatar API | Needs adding |
| `RESEND_API_KEY` | Transactional email | Already exists |

**Note:** All new env vars must be added to Vercel separately after local setup.

---

## Phase Log

### [2026-05-06] Phase 1 — Foundation, Schema, Admin Shell

**Commit:** 5a43d44

**Built:**
- 7 Prisma models: AdLabProject, AdLabExperiment, AdLabAngle, AdLabCreative, AdLabAd, AdLabDailyMetric, AdLabDecision
- 5 enums: AdLabExperimentStatus, AdLabValueSurface, AdLabComplianceStatus, AdLabAdStatus, AdLabDecisionType
- Middleware gate on `/admin/adlab/*` — checks email = `keenan@heelerdigital.com`
- Sidebar layout with nav (Dashboard, Projects, Experiments, Performance, Settings)
- 5 placeholder pages matching Acuity admin dark theme
- Env var placeholders in `.env.local` (META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_API_VERSION, IDEOGRAM_API_KEY, HEYGEN_API_KEY)

**Manual steps needed:**
- [ ] Keenan: `npx prisma db push` from home network to create adlab_* tables
- [ ] Keenan: Add META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_API_VERSION, IDEOGRAM_API_KEY, HEYGEN_API_KEY to Vercel env vars

### [2026-05-06] Phase 2 — Project Config UI

**Commit:** da5b80a

**Built:**
- Full CRUD API routes for AdLabProject (list, create, get, update, delete)
- Project list page with table view (name, slug, CPL, budget, created, edit/delete actions)
- New/Edit form with all fields: brand voice guide, structured audience JSON editor (age, geo, interests, pain points, desires, identity markers as tag inputs), repeating USP fields, banned phrases tag input, image style prompt, logo URL, Meta integration, conversion config, video toggle
- Zod validation on API routes, inline error display on form
- Project detail page with summary cards (read-only view of all config)
- Dollars-to-cents conversion on save, cents-to-dollars on load
- Seed endpoint at POST /api/admin/adlab/projects/seed — creates Acuity project pre-populated with real product config

**Manual steps needed:**
- [ ] Keenan: after `prisma db push`, hit POST /api/admin/adlab/projects/seed to create the Acuity project (or create via UI at /admin/adlab/projects/new)
- [ ] Keenan: fill in metaAdAccountId and metaPixelId on the Acuity project once Meta system user is set up

### [2026-05-06] Phase 3 — Research Agent

**Commit:** 7796982

**Built:**
- New experiment form at /admin/adlab/experiments/new (project dropdown + topic brief textarea)
- POST /api/admin/adlab/research — calls Claude Sonnet twice: 8 angle hypotheses + 1-10 scoring
- Angles persisted as AdLabAngle rows, experiment status flipped to awaiting_approval
- Experiment detail view with angle cards sorted by score, selectable checkboxes, "Advance Selected" button
- Zod validation on Claude responses with retry on parse failure
- AdLab-specific Claude caller at lib/adlab/claude.ts (uses claude-sonnet-4-5, logs to ClaudeCallLog)

### [2026-05-06] Phase 4 — Creative Generator

**Commit:** a3b11b8

**Built:**
- POST /api/admin/adlab/creatives/generate — generates 3 creative variants per angle
- Copy generation via Claude Sonnet (headline 40 chars, primaryText 125 chars, description 30 chars, Meta CTA values)
- Image generation via Ideogram API (project imageStylePrompt + angle-derived scene description + logo placement instruction)
- HeyGen video stub (scaffolded, awaiting API key)
- "Generate Creatives" button on advanced angles, "Regenerate" on existing ones
- Creative cards with image preview, copy fields, compliance status badge, approve toggle

### [2026-05-06] Phase 5 — Compliance Checker

**Commit:** a3b11b8

**Built:**
- POST /api/admin/adlab/creatives/compliance — single creative or batch by experiment
- Claude checks against Meta's high-risk categories: personal attributes, health claims, before/after, financial claims, profanity, sensational language, prohibited content, trademark infringement
- Also checks project.bannedPhrases
- Returns passed/flagged with reasons, saved to creative row
- "Run Compliance Check" button on experiment view
- Flagged creatives show yellow border + reasons
- Launch endpoint blocks any creative without complianceStatus=passed

### [2026-05-06] Phase 6 — Meta Ads Launcher

**Commit:** a3b11b8

**Built:**
- facebook-nodejs-business-sdk installed
- lib/adlab/meta.ts: Meta Marketing API wrapper (dynamic import for build safety) — createCampaign, createAdSet, uploadImage, createAdCreative, createAd, setStatus, updateAdSetBudget, deleteCampaign, getAdInsights
- POST /api/admin/adlab/ads/launch — creates campaign + ad sets + ads in PAUSED state (ABO, not CBO)
- POST /api/admin/adlab/ads/activate — explicit user click to flip everything to ACTIVE
- POST /api/admin/adlab/ads/cancel — deletes campaign on Meta, resets experiment to awaiting_approval
- Hard rule: never auto-launch, only on explicit UI click

**Manual steps needed:**
- [ ] Jimmy: Create Meta system user token with ads_management permission
- [ ] Keenan: Add META_ACCESS_TOKEN and META_AD_ACCOUNT_ID to Vercel

### [2026-05-06] Phase 7 — Performance Monitor + Decision Engine

**Commit:** a3b11b8

**Built:**
- GET /api/admin/adlab/cron — daily metrics sync + decision engine (protected by CRON_SECRET)
- Syncs Meta Insights API data into AdLabDailyMetric (upsert by adId+date)
- Kill rules: 1.5x CPL with zero conversions, CTR < 0.5% with 2000+ impressions, CPL > 2x target
- Scale rules: CPL ≤ 80% target, 5+ conversions, frequency < 2.5, +20% budget (max 5x original, once per 24h)
- All decisions logged to AdLabDecision table with rationale
- Experiment conclusion: after testDurationDays OR 2+ scaled ads → concluded + triggers learning loop
- Daily summary email via Resend to keenan@heelerdigital.com
- vercel.json: cron at 09:00 UTC daily
- Performance page shows live/concluded experiments

**Manual steps needed:**
- [ ] Jimmy: Add CRON_SECRET to Vercel env vars
- [ ] Keenan: Verify vercel.json cron is picked up after next deploy

### [2026-05-06] Phase 8 — Learning Loop + Polish

**Commit:** a3b11b8

**Built:**
- POST /api/admin/adlab/experiments/[id]/learn — Claude analyzes concluded experiment data
- Extracts: winning valueSurfaces by CPL, cheapest personas, copy patterns, visual patterns, recommendations
- Saves to experiment.conclusionSummary and APPENDS to project.learnedPatterns (accumulates, never overwrites)
- Phase 3 research prompt already injects learnedPatterns as priors for future experiments (loop closed)
- Dashboard page with live stats: total spend, conversions, blended CPL, live experiments, live ads, recent decisions
- GET /api/admin/adlab/dashboard — aggregated monthly stats

**Manual steps needed:**
- [ ] Keenan: `npx prisma db push` from home network (includes all adlab_* tables + heroImageUrl column)
- [ ] All env vars listed in the table above must be added to Vercel before first real experiment

### [2026-05-07] Refactor — Replace Ideogram with gpt-image-2 + HeyGen dual-category architecture

**Requested by:** Keenan
**Commit:** a73e553

**Architectural change:**
- **Removed:** Ideogram API entirely (was used for image generation). IDEOGRAM_API_KEY removed from .env.local and docs.
- **Added:** gpt-image-2 (OpenAI) for image creatives — project logo passed as a reference image input, no compositing or post-processing needed. Uses existing OPENAI_API_KEY.
- **Added:** HeyGen video creatives as a parallel ad category. Claude generates a 25-second avatar script per copy variant, HeyGen renders it, video uploaded to Supabase Storage.
- **Result:** Every experiment now produces two parallel sets of creatives (image + video) from the same 3 copy variants, giving clean format-vs-format performance data.

**Schema changes:**
- New enum: `AdLabCreativeType` (image, video)
- New field on `AdLabCreative`: `creativeType` (defaults to "image" for existing rows)
- New field on `AdLabProject`: `imageEnabled` (Boolean, default true)
- Renamed field: `imagePrompt` → `generationPrompt` (stores image prompt OR video script)

**Files changed:**
- `prisma/schema.prisma`: new enum + fields
- `apps/web/src/app/api/admin/adlab/creatives/generate/route.ts`: full rewrite — gpt-image-2 + HeyGen + Supabase upload
- `apps/web/src/app/api/admin/adlab/creatives/compliance/route.ts`: video script content scanned for spoken-language violations
- `apps/web/src/app/api/admin/adlab/ads/launch/route.ts`: video upload with retry, video_data creative spec
- `apps/web/src/lib/adlab/meta.ts`: uploadVideo function, video_data branch in createAdCreative
- `apps/web/src/app/api/admin/adlab/cron/route.ts`: creativeType in decisions + email
- `apps/web/src/app/api/admin/adlab/experiments/[id]/learn/route.ts`: image-vs-video format analysis, scriptPatterns field
- `apps/web/src/app/admin/adlab/experiments/[id]/page.tsx`: creatives grouped by Image/Video, video player, type badges

**Env var changes:**
- Removed: `IDEOGRAM_API_KEY`
- Confirmed in use: `OPENAI_API_KEY` (already exists for Whisper/embeddings)
- Required: `HEYGEN_API_KEY` (for video creatives)

**Manual steps needed:**
- [ ] Keenan: `npx prisma db push` from home network (adds creativeType, generationPrompt, imageEnabled columns)
- [ ] Keenan: Confirm OPENAI_API_KEY is set in Vercel (already used by Whisper — should be there)
- [ ] Keenan: Add HEYGEN_API_KEY to Vercel if not present
- [ ] Keenan: Remove IDEOGRAM_API_KEY from Vercel env vars
- [ ] Keenan: Create public Supabase Storage bucket named "adlab-creatives" (Storage → New Bucket → Public ON)
- [ ] Redeploy after env var changes

**Notes:**
- HeyGen avatar/voice IDs are hardcoded to defaults (Anna_public_3_20240108 / neutral voice). Should be made configurable per project in a future pass.
- gpt-image-2 is called via `openai.images.generate()` with model "gpt-image-1" (the API model name). Logo reference image download + base64 encoding happens inline.
- If neither imageEnabled nor videoEnabled is true on a project, creative generation produces nothing — the endpoint returns an empty array.

### [2026-05-11] Audit — Full System Review

**Requested by:** Keenan

**Result: 42/46 items DONE, 3 PARTIAL, 1 NOT BUILT**

All schema, pages, API endpoints, middleware, Meta integration, monitoring rules, and learning loop are complete and building. Four issues found:

**Punch list (priority order):**

1. **BUG — Logo reference image dead code** (blocking): The creative generator downloads the project logo and encodes it to base64, but the `images` array is never actually passed to the `openai().images.generate()` call. Generated images have no logo. Needs the correct parameter shape for passing reference images to gpt-image-1.

2. **MISSING — `imageEnabled` not in project form or API** (non-blocking, defaults to true): Schema field exists, creative generator checks it, but the project form, API Zod schemas, and detail view don't expose it. Can't toggle image generation off from the UI.

3. **MISSING — `CRON_SECRET` not in .env.local** (blocking for cron): Cron endpoint checks bearer token against this. Without it, daily metrics sync will fail auth. Needs adding to .env.local and Vercel.

4. **NOT BUILT — "Clone winning ads" button** (non-blocking): Spec'd in Phase 8 for concluded experiment view but never implemented.

### [2026-05-11] Fix — Audit Punch List (all 4 items resolved)

**Requested by:** Keenan
**Commit:** 16657ea

**Fixed:**

1. **Logo reference image now works** — switched from `images.generate()` to `images.edit()` which is the correct gpt-image-1 endpoint for reference image input. Logo downloaded from `project.logoUrl`, converted via OpenAI SDK `toFile()`, passed as the `image` parameter. Falls back to `images.generate()` (no logo) if download fails.

2. **`imageEnabled` toggle added** — wired through create/update API Zod schemas, project form (toggle next to videoEnabled), and project detail view. Projects can now turn image creative generation on/off.

3. **`CRON_SECRET` added to .env.local** — placeholder with comment noting value must match Vercel.

4. **"Clone winning ads" button built** — visible on concluded experiments. Finds top 2 scaled/live ads by lowest CPL, builds a topic brief from their winning hypotheses + headlines, navigates to `/experiments/new?brief=...` with the brief pre-filled. The new experiment form reads the `brief` query param on load.

**Manual steps needed:**
- [ ] Keenan: Set a real `CRON_SECRET` value in both .env.local and Vercel (any random string, must match)

### [2026-05-11] Admin Dashboard — AdLab Entry Point

**Requested by:** Keenan
**Commit:** 2baa31d

**Built:**
- Prominent AdLab link card on the main `/admin` dashboard, placed between the header quick-links row and the tab bar
- Flask icon + "AdLab" title + "Ad Research & Optimization — angles, creatives, Meta launch, auto-monitoring" subtitle
- Purple accent border matching existing admin theme, hover state with chevron arrow
- Links to `/admin/adlab`

**Manual steps needed:** None

### [2026-05-11] Fix — Correct Anthropic model string

**Requested by:** Keenan
**Commit:** 29387da

**Fixed:** AdLab Claude caller model string corrected. `claude-sonnet-4-5-20241022` → `claude-sonnet-4-5-20250514` → `claude-sonnet-4-6` (the current valid Sonnet model ID). Both prior strings returned 404 from the Anthropic API. Single source of truth in `apps/web/src/lib/adlab/claude.ts`.

**Latest commit:** 9be2ad3

**Manual steps needed:** None — deploys automatically.

### [2026-05-11] Fix — Image gen model/params/rate-limit

**Requested by:** Keenan
**Commit:** 37020f7

**Fixed:**
1. **Model string**: `gpt-image-1` → `gpt-image-2` in all 4 references (edit call, generate fallback, error log, comment)
2. **Bad parameter**: removed `quality` param from both `images.edit()` and `images.generate()` — not accepted by the endpoint
3. **Rate limiting**: added 3-second delay between image generation calls to stay under OpenAI's 5/min limit
4. **Upload error surfacing**: upload failures for both image and video creatives now logged with `[adlab]` prefix and returned in API response as `uploadErrors` array so the UI can show which creatives failed

**Confirmed working:** Both image and video creatives already upload to Supabase `adlab-creatives` bucket (was already implemented, just needed error surfacing)

### [2026-05-11] Fix — Remove all logo handling from image generation

**Requested by:** Keenan
**Commit:** 185456e

**Changed:** Removed all logo handling from image generation. No more `images.edit()`, logo download, buffer conversion, `toFile()`, or logo placement prompt instructions. Image gen now uses only `images.generate()` with `gpt-image-2`. Prompt = `imageStylePrompt` + scene description from angle/headline. 3-second rate limit delay preserved.

**Manual steps needed:** None

### [2026-05-11] Feature — Auto-cleanup unapproved items at each approval gate

**Requested by:** Keenan
**Commit:** 125182e

**Built:**
- **Angle cleanup**: "Advance Selected" now deletes all non-selected angles from the experiment (with confirmation dialog). After cleanup, the button is replaced with a green "N angles advanced" badge and checkboxes disappear.
- **Creative cleanup**: New "Finalize Creatives" button (red, with trash icon) deletes all unapproved + flagged creatives AND removes their files from Supabase `adlab-creatives` storage bucket. After cleanup, shows a green "N creatives approved" badge.
- **Confirmation dialogs**: Both cleanup actions prompt "This will permanently delete X unapproved [angles/creatives]. Continue?" before executing.
- New API endpoint: `POST /api/admin/adlab/creatives/finalize` — handles creative deletion + storage file removal.
- Updated `PUT /api/admin/adlab/angles` — now accepts `experimentId` and deletes non-advanced angles in the same call.

**Manual steps needed:** None

### [2026-05-11] Feature — Auto-unapprove flagged creatives + Meta policy guardrails

**Requested by:** Keenan
**Commit:** f26f1f0

**Built:**
1. **Auto-unapprove**: Compliance endpoint now sets `approved=false` on any creative it flags. Flagged creatives can never stay approved. UI shows amber banner: "X creatives were flagged and auto-unapproved. Edit the copy and re-check, or generate new variants."
2. **Meta policy guardrails**: Copy generation system prompt now includes strict rules — no you/your implying personal attributes, no medical/mental health conditions directed at reader, no before/after framing, use third-person general framing instead. This prevents most compliance flags at generation time rather than catching them after.
3. **Launch-ready indicator**: Purple badge shows "N ready to launch" when at least 1 creative is both approved and compliance-passed.

**Manual steps needed:** None

### [2026-05-11] Fix — Launch Campaign button wired into experiment UI

**Requested by:** Keenan
**Commit:** aafe88b

**Fixed:** The Launch button was never added to the experiment detail page — only a "ready to launch" badge existed. The API endpoints (launch, activate, cancel) were built in Phase 6 but never connected to the UI.

**Added:**
- Green "Launch Campaign (N creatives)" button — visible when experiment is `awaiting_approval` and at least 1 creative is approved + compliance-passed
- Full launch flow: button calls POST /ads/launch → confirmation panel shows PAUSED campaign details → "Launch Live" or "Cancel & Delete"
- Loading states on all three actions (launch, activate, cancel)
- Error display surfaces exact Meta API error messages
- "Campaign is live" indicator with pulsing green dot after activation
- Cancel has confirmation dialog before deleting the Meta campaign

**Manual steps needed:** None

### [2026-05-11] Feature — Reference image uploads on experiments

**Requested by:** Keenan
**Commit:** 374dc97

**Built:**
- New `AdLabReferenceImage` model (id, experimentId, imageUrl, caption, createdAt) mapped to `adlab_reference_images`
- Collapsible "Reference Images" section on experiment detail page, below topic brief, above angles
- Click-to-upload area (accepts multiple images) — uploads to Supabase `adlab-creatives` bucket as `ref_{experimentId}_{timestamp}.png`
- Horizontal scrollable thumbnail gallery with:
  - Click to expand in full-screen lightbox modal
  - Inline caption input (saves on blur)
  - Delete button with storage cleanup
- Disabled "Use as creative direction" toggle with "Coming soon" tooltip — placeholder for future gpt-image-2 reference input
- API: POST /api/admin/adlab/reference-images (multipart upload), PUT/DELETE /api/admin/adlab/reference-images/[id]

**Manual steps needed:**
- [ ] Keenan: `npx prisma db push` from home network to create `adlab_reference_images` table + add new experiment columns

### [2026-05-11] Fix — Make all new fields optional to unblock pre-migration

**Requested by:** Keenan
**Commit:** 9a9baea

**Problem:** Experiment queries broke with "Experiment not found" because the `referenceImages` include tried to query a table that didn't exist yet (no migration run).

**Fixed:**
- Added 7 optional campaign settings fields to `AdLabExperiment`: `campaignName`, `campaignObjective`, `specialAdCategories`, `campaignTags`, `adSetDailyBudgetCents`, `optimizationEvent`, `placementType` — all nullable or with empty defaults
- Experiment detail API: try/catch fallback queries without `referenceImages` if the table doesn't exist, attaches empty array
- Reference image upload: try/catch on DB insert, returns clear "run prisma db push" error
- Launch endpoint: uses experiment-level overrides with project fallbacks (`experiment.campaignObjective ?? project.conversionObjective`, etc.)
- UI: optional chaining on `referenceImages` everywhere

**App works without migration now.** All new columns get added when Keenan runs `prisma db push`.

**Manual steps needed:**
- [ ] Keenan: `npx prisma db push` from home network (adds campaign settings columns + reference images table)

**Everything else passes:**
### [2026-05-11] Fix — maxDuration on all AdLab API routes

**Requested by:** Keenan
**Commit:** 6f0b785

**Fixed:** Research endpoint was timing out on Vercel (default 10s limit). Bumped from 60s to 120s since it makes two sequential Anthropic calls. Added maxDuration=60 to ads/cancel (was the only route missing it that calls an external API).

**All routes now covered:**

| Route | maxDuration | Reason |
|-------|------------|--------|
| research | 120s | 2 sequential Anthropic calls |
| creatives/generate | 300s | image gen + HeyGen polling |
| creatives/compliance | 120s | batch Anthropic calls |
| ads/launch | 120s | Meta campaign + ad creation |
| ads/activate | 60s | Meta status flips |
| ads/cancel | 60s | Meta campaign delete |
| cron | 300s | metrics sync + decisions for all ads |
| experiments/[id]/learn | 60s | single Anthropic call |

**Manual steps needed:** None — NOT PUSHED YET (waiting for go-ahead)

- All 8 models, 6 enums, 8 @@map directives correct
- All 29 routes building (10 pages + 19 API)
- Middleware gates to keenan@heelerdigital.com
- Ideogram fully removed (zero references)
- No sharp imports for compositing
- HeyGen fully implemented (not a stub)
- Meta launcher uses ABO, handles image + video, has retry logic
- Kill/scale rules match spec exactly
- Learning loop appends patterns, research agent injects them
- Daily email includes creativeType breakdown

### [2026-05-11] Fix — Meta SDK import + Generate All Creatives button

**Requested by:** Keenan
**Committed by:** Claude Code
**Commit hash:** 7187ee5

### In plain English (for Keenan)
Two changes: (1) The "Launch Campaign" button was crashing because the Meta Ads SDK wasn't loading correctly — fixed the import so it works. (2) Added a "Generate All Creatives" button that creates image/video creatives for every approved angle in one click, one at a time, so you don't have to click "Generate" on each angle individually.

### Technical changes (for Jimmy)
- `apps/web/src/lib/adlab/meta.ts`: Rewrote SDK initialization — the `facebook-nodejs-business-sdk` package uses a CJS default export. The old code accessed `sdk.default.FacebookAdsApi` which was `undefined` in the ESM dynamic import context. Fixed with `(mod.default ?? mod)` normalization pattern across all 7 functions that construct SDK classes.
- `apps/web/next.config.js`: Added `facebook-nodejs-business-sdk` to `experimental.serverComponentsExternalPackages` — webpack was failing to resolve the package at build time because it wasn't installed (was in package.json but never `npm install`ed). Package now installed + externalized.
- `apps/web/src/app/api/admin/adlab/ads/launch/route.ts`: Added `console.log('[adlab-launch] SDK loaded:', typeof bizSdk.FacebookAdsApi)` inside the POST handler for deploy verification.
- `apps/web/src/app/admin/adlab/experiments/[id]/page.tsx`: New "Generate All Creatives" button — appears when advanced angles exist without creatives. Processes angles sequentially with 5s pause between each to avoid OpenAI rate limits. Shows real-time progress ("Generating creatives for angle 2 of 5..."), refreshes UI after each angle so creatives appear progressively, skips angles that already have creatives, continues on failure with error logging.

### Manual steps needed
None

### Notes
- The SDK was listed in `apps/web/package.json` but was never actually `npm install`ed — the node_modules directory didn't have it. This was likely masked by the dynamic import + `ignoreBuildErrors: true` in earlier builds.
- The `(mod.default ?? mod)` pattern handles both cases: if the bundler wraps the CJS export in `.default` (standard ESM interop), it uses that; if the module is already unwrapped, it falls through. This is the canonical way to handle CJS→ESM interop with dynamic imports.

### [2026-05-11] Feat — Replace hardcoded Meta Pixel with env var

**Requested by:** Keenan
**Committed by:** Claude Code
**Commit hash:** bbd4fa8

### In plain English (for Keenan)
The Meta Pixel tracking ID was hardcoded directly in the code. Now it reads from an environment variable instead, so the ID isn't baked into the repo and can be changed per environment without a code change.

### Technical changes (for Jimmy)
- `apps/web/src/components/consent-gated-trackers.tsx`: replaced `const META_PIXEL_ID = "5752790988087389"` with `process.env.NEXT_PUBLIC_META_PIXEL_ID`. Added guard so pixel script only renders when the env var is set (matches GA pattern).
- `apps/web/.env.local`: added `NEXT_PUBLIC_META_PIXEL_ID="5752790988087389"` (gitignored)

### Manual steps needed
- [ ] Keenan: Add `NEXT_PUBLIC_META_PIXEL_ID=5752790988087389` to Vercel env vars, then redeploy

### Notes
- Only one hardcoded reference existed (in `consent-gated-trackers.tsx`). PROGRESS.md mentions the old ID in historical log entries but those are documentation, not code.

### [2026-05-11] Fix — Hardcode Meta Pixel in root layout, no consent gate

**Requested by:** Keenan
**Committed by:** Claude Code
**Commit hash:** e773679

### In plain English (for Keenan)
The Meta Pixel wasn't loading on getacuity.io because it was behind a cookie consent gate — visitors who hadn't clicked "Accept" never got tracked. Now the pixel fires on every page load for every visitor, unconditionally.

### Technical changes (for Jimmy)
- `apps/web/src/app/layout.tsx`: Added Meta Pixel script (new ID `869829585445303`) directly in the `<head>` with `strategy="afterInteractive"`. No consent check, no conditional rendering.
- The consent-gated copy in `consent-gated-trackers.tsx` is still there but the layout script takes priority — fbq's built-in dedup (`if(f.fbq)return`) prevents double-firing.

### Manual steps needed
None

### Notes
- New pixel ID is `869829585445303` (replaces old `5752790988087389` which was in consent-gated-trackers.tsx).
- The old consent-gated pixel in `consent-gated-trackers.tsx` still references `NEXT_PUBLIC_META_PIXEL_ID` env var (the old pixel). It won't conflict because fbq deduplicates — whichever init runs first wins, the second is a no-op.

### [2026-05-11] Fix — Install Meta Pixel directly in root layout (final)

**Requested by:** Keenan
**Committed by:** Claude Code
**Commit hash:** af455c3

### In plain English (for Keenan)
The Meta Pixel now fires on every single page load across the entire site — no cookie consent required, no env vars, no conditional logic. The old pixel (5752790988087389) has been fully removed. Only the new pixel (869829585445303) fires. Also added the noscript fallback image tag so the pixel tracks even when JavaScript is disabled.

### Technical changes (for Jimmy)
- `apps/web/src/app/layout.tsx`: Meta Pixel script (`869829585445303`) in `<head>` with `strategy="afterInteractive"` + `<noscript>` fallback `<img>` tag. No consent check.
- `apps/web/src/components/consent-gated-trackers.tsx`: Removed all Meta Pixel code — deleted `META_PIXEL_ID` constant, removed `marketing` consent state, removed the pixel `<Script>` block. File now only handles GA + Contentsquare consent gating.
- Old pixel ID `5752790988087389` no longer exists in any code file (only in historical progress log entries).

### Manual steps needed
None

### Notes
- `NEXT_PUBLIC_META_PIXEL_ID` env var is now unused — can be removed from Vercel and .env.local whenever convenient, but leaving it does no harm.

### [2026-05-12] Fix — Detailed Meta API error logging in launch endpoint

**Requested by:** Keenan
**Committed by:** Claude Code
**Commit hash:** 246f53f

### In plain English (for Keenan)
When launching a campaign, the system now logs exactly which Meta API call failed and what error Meta returned. Before, errors were swallowed and you'd just see a generic "failed" message. Now Vercel logs will show the full error from Meta so we can debug launch failures instantly.

### Technical changes (for Jimmy)
- `apps/web/src/app/api/admin/adlab/ads/launch/route.ts`: Each Meta SDK call (campaign creation, ad set creation, image upload, video upload, ad creative creation, ad creation) now has its own try/catch. Added `logMetaError()` helper that logs: full JSON-stringified error, `error.response.body` or `error.body` or `error.message`. Added `extractErrorDetail()` helper that pulls the same into API responses. Step-by-step `console.log` before each call (e.g. `[adlab-launch] Creating ad set for image creative abc12345...`). If ad set or ad creative creation fails, that creative is skipped with `continue` rather than crashing the whole loop.

### Manual steps needed
None

### Notes
- The error response body from Meta's SDK is typically at `error.response.body` — this is where the actual error code and message live (e.g. "Invalid parameter", "Insufficient permissions"). The previous code only logged `error.message` which is usually just a generic Node error string.

### [2026-05-12] Fix — Log Meta API payloads for debugging

**Requested by:** Keenan
**Committed by:** Claude Code
**Commit hash:** 1b21589

### In plain English (for Keenan)
When Meta says "Invalid parameter" we now see exactly what payload was sent — every field of every API call is logged. This makes it possible to see which specific field Meta is rejecting without guessing.

### Technical changes (for Jimmy)
- `apps/web/src/lib/adlab/meta.ts`: Added `console.log("[adlab-meta] ... payload:", JSON.stringify(payload, null, 2))` before every Meta SDK call: `createCampaign`, `createAdSet`, `createAdCreative`, `createAd`. Also logs `META_AD_ACCOUNT_ID` at campaign creation time.
- `apps/web/src/app/api/admin/adlab/ads/launch/route.ts`: `logMetaError` now uses `Object.getOwnPropertyNames(err)` to capture non-enumerable error properties the SDK hides. Also checks `err._data` and `err.response` which are where the Meta SDK sometimes stores the actual error details. `extractErrorDetail` also checks `err._data`.

### Manual steps needed
None

### Notes
- The Meta SDK error object often has enumerable properties stripped. Standard `JSON.stringify(err)` produces `{}` for most SDK errors. Using `Object.getOwnPropertyNames` forces serialization of `message`, `stack`, and any SDK-specific hidden fields.

### [2026-05-12] Fix — Add is_adset_budget_sharing_enabled and correct API version

**Requested by:** Keenan
**Committed by:** Claude Code
**Commit hash:** eaa0988

### In plain English (for Keenan)
Two fixes for the Meta campaign launch that was failing: (1) Meta now requires a field saying budget is managed at the ad set level, not the campaign level — we were missing it. (2) The Meta SDK was calling an older API version (v24.0) instead of the v25.0 we intended. Both are fixed.

### Technical changes (for Jimmy)
- `apps/web/src/lib/adlab/meta.ts`: Added `is_adset_budget_sharing_enabled: false` to the campaign create payload — required by Meta for ABO (ad-set-level budget) campaigns.
- `apps/web/src/lib/adlab/meta.ts`: Overrode `FacebookAdsApi.VERSION` static getter via `Object.defineProperty` to use `process.env.META_API_VERSION` or default to `"v25.0"`. The SDK v24.0.1 hardcodes `VERSION` as a static getter returning `"v24.0"` with no setter method, so `defineProperty` is the only way to override it.

### Manual steps needed
None

### Notes
- The SDK (`facebook-nodejs-business-sdk@24.0.1`) defines `VERSION` as a static getter (`static get VERSION() { return 'v24.0'; }`) — there is no `setApiVersion()` method. The `Object.defineProperty` override replaces the getter on the class prototype, which is safe because `getApi()` is called before every SDK operation.
- `is_adset_budget_sharing_enabled: false` explicitly tells Meta this campaign uses ABO (ad set budget optimization) rather than CBO (campaign budget optimization). Without it, Meta returns an "Invalid parameter" error for ABO campaigns.

### [2026-05-12] Fix — Auto-correct country codes for Meta targeting (UK → GB)

**Requested by:** Keenan
**Committed by:** Claude Code
**Commit hash:** 18ee035

### In plain English (for Keenan)
Meta was rejecting our ad sets because "UK" isn't a valid country code — Meta uses the international standard "GB" for United Kingdom. The system now automatically corrects common mistakes like "UK" and "EN" to "GB" in three places: when you save a project, when creatives launch, and in the default Acuity seed data.

### Technical changes (for Jimmy)
- `apps/web/src/lib/adlab/meta.ts`: Added `normalizeCountryCodes()` function with a `COUNTRY_CODE_FIXES` map (UK→GB, EN→GB). Called in `createAdSet()` before passing geo codes to Meta. Logs corrections and warns on suspicious (non-2-char) codes.
- `apps/web/src/app/api/admin/adlab/projects/route.ts`: Added Zod `.transform()` on the `geo` array in `CreateProjectSchema` — auto-corrects codes on save.
- `apps/web/src/app/api/admin/adlab/projects/[id]/route.ts`: Same Zod transform in `UpdateProjectSchema`.
- `apps/web/src/app/api/admin/adlab/projects/seed/route.ts`: Fixed hardcoded `"UK"` → `"GB"` in the Acuity seed data.

### Manual steps needed
- [ ] Keenan: If the Acuity project already exists in the database with "UK" in its geo array, edit the project in the AdLab UI and re-save — the Zod transform will auto-correct it. Or re-run the seed endpoint after deleting the existing project.

### Notes
- Meta uses ISO 3166-1 alpha-2 codes. "UK" is reserved but not assigned — "GB" (Great Britain and Northern Ireland) is the correct code. This is one of the most common country code mistakes in ad tech integrations.
- The correction happens at two layers: Zod transforms catch it on save (so the DB always has correct codes), and `normalizeCountryCodes()` catches it at runtime (safety net for existing bad data).
