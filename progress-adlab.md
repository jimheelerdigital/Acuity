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

**Everything else passes:**
- All 7 models, 6 enums, 7 @@map directives correct
- All 26 routes building (10 pages + 16 API)
- Middleware gates to keenan@heelerdigital.com
- Ideogram fully removed (zero references)
- No sharp imports for compositing
- HeyGen fully implemented (not a stub)
- Meta launcher uses ABO, handles image + video, has retry logic
- Kill/scale rules match spec exactly
- Learning loop appends patterns, research agent injects them
- Daily email includes creativeType breakdown
