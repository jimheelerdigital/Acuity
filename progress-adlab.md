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

