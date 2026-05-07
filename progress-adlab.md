# AdLab — Progress Log

**System:** AdLab — Automated Ad Research, Creative Generation, Launch & Optimization
**Lives inside:** Acuity Next.js app at `/admin/adlab/*`
**Gated to:** keenan@heelerdigital.com via middleware

---

## System Overview

**Purpose:** Configure a project once, run a topic brief, get angles → creatives → live Meta ads → 14-day monitored split test → auto-kill losers, auto-scale winners, learning loop into next cycle.

**First project:** Acuity. System is project-agnostic via configuration.

**Stack:** Next.js (existing), Prisma (existing), Supabase (existing), Anthropic API, Meta Marketing API via facebook-nodejs-business-sdk, Ideogram API, HeyGen API, Resend (existing), Vercel cron (existing).

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
| `IDEOGRAM_API_KEY` | Ideogram image generation API | Needs adding |
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
