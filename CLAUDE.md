# Working on Acuity

For any design, UI, visual, or copy work, READ `_design/DESIGN_SYSTEM.md` first. Match the visual language and tone defined there. This is the canonical reference for both mobile and web. Do not invent your own interpretation — mirror the doc.

---

## Progress Tracking Rules

This repo uses the existing progress.md at the root as the single source of truth for code changes. Both cofounders ship through Claude Code. These rules apply to every session.

### Before starting ANY task:
1. Read progress.md at the root of the repo
2. Note any unfinished manual steps from recent entries
3. Summarize the current state in 2 sentences before proceeding

### After completing ANY task:
1. Commit all changes with a descriptive commit message
2. Push to main
3. Append a new entry to the TOP of the existing progress.md (do not replace the file — add the new entry above the most recent entry)

### Entry format — use this exact structure

Each entry is a markdown section starting with an H2 heading. The format is:

H2 heading: "## [YYYY-MM-DD] — Short plain-English title"

Three bold metadata lines immediately below the heading:
- **Requested by:** Keenan | Jimmy | Both
- **Committed by:** Claude Code
- **Commit hash:** abc1234

Then four H3 subsections in this exact order:

H3: "### In plain English (for Keenan)"
One or two sentences explaining what this change means for the business, the user, or the product. No jargon. No file names. What did the user experience change to? What does this enable the business to do? If this fixes a bug, what was the bug in plain terms?

Example plain English: "Users can now see a progress bar when generating content, so they know the system is working instead of staring at a blank screen for 60 seconds."

H3: "### Technical changes (for Jimmy)"
Bullet list of the actual technical changes:
- File names modified or created
- Prisma schema changes (tables added, columns added, enums changed)
- New API routes or Inngest functions
- Libraries added or removed
- Config or env changes
- Any architectural decisions, for example "chose polling over SSE because of Vercel serverless limits"

H3: "### Manual steps needed"
Checkbox list of any manual actions still needed, or "None" if nothing is required:
- [ ] Task 1 (who owns it — Keenan / Jimmy)
- [ ] Task 2 (who owns it)

H3: "### Notes"
Context that future-us will need:
- Gotchas discovered while implementing
- Decisions made and why
- Environment-specific issues
- Anything that would save the next session from repeating a mistake

Do NOT use the Notes section for marketing language. This is an internal log.

### Identifying the requester
- Keenan = business cofounder (handles marketing, admin dashboards, content, copy, customer acquisition)
- Jimmy = technical cofounder (handles infrastructure, schema, bug fixes, mobile, API pipeline)
- Both = shared decision made on a call or async
- If the session prompter does not state who requested the change, ASK before proceeding

### 🔴 Schema rule — back-declare out-of-band SQL IMMEDIATELY

**Any change made to the database outside Prisma — a column, table, enum value, index, added via the Supabase SQL editor or a raw migration — MUST be added to `prisma/schema.prisma` in the same working session.**

Not "soon". Immediately. Here is why:

`prisma db push` reconciles the DATABASE TO THE SCHEMA. If `schema.prisma` doesn't know about something that exists in prod, push does not ignore it — **it drops it.** So an undeclared column is a live landmine for the next person who runs `db push` from any branch.

This has fired three times:
- **2026-08-16** — a push from a stale branch would have dropped 13 `CarouselPost` columns including 5 populated `storyVideoUrl` values. Caught by a manual diff, before running.
- **2026-08-19** — a push from a branch predating `RevenueCatEvent` **did drop that table**, and added `CarouselPost.format` (populated on all 120 rows), `storyVoiced`, and the `CarouselFormat` enum. Caught only by noticing the table had vanished.
- **2026-08-21** — a push **from main** would have issued 10 destructive statements: `DROP TABLE Habit`, `DROP TABLE HabitCheck`, `DROP TABLE InsightEvidence`, plus `User.v10Day2PushSentAt`, `UserReminder.kind`/`habitId`, and four `UserInsight` correction columns. Caught by the guard.

Neither of the first two was recklessness. The command is silently destructive when the schema lags, and nothing was checking.

**The third had a DIFFERENT cause, and the rule above did not cover it.** Nothing was added by raw SQL that time. Schema was pushed to prod **from feature branches** (`feat/onboarding-v10`), and `main` never declared any of it. So `main`'s schema silently fell *behind production* while every individual push looked correct from the branch it ran on.

### 🔴 Corollary — `db:push` runs from `main` ONLY

**Never run `npm run db:push` from a feature branch.** A branch push writes schema that only that branch declares. The moment it merges — or does not — `main` is behind production, and the next `db:push` from `main` proposes dropping whatever the branch added.

The workflow is:
1. Land the schema change on `main` (merge the branch first).
2. Run `npm run db:push` **from `main`**.
3. Never from anywhere else, however small the change.

If a branch genuinely needs its schema in a shared environment to be testable, that is a signal the branch should merge behind a flag — not a reason to push from it. Dark-but-merged is safer than live-but-stranded.

**Guardrail (added 2026-08-19):** `scripts/check-destructive-diff.ts` fails on any `DROP TABLE` / `DROP COLUMN` / `DROP TYPE` / column-type rewrite.
- `npm run db:push` runs it first and aborts on failure. **Use this, never bare `prisma db push`.**
- A `pre-push` hook runs it when `schema.prisma` differs from `origin/main`.
- `.github/workflows/schema-destructive-check.yml` re-checks on PRs (needs the `DIRECT_URL` repo secret).
- **CI should also run the guard against `main` on a schedule, not only on PRs.** The 2026-08-21 drift was invisible to PR checks: every branch PR was internally consistent, and the divergence existed only between `main` and production. A PR-triggered check cannot see a gap that no PR introduces. A scheduled run comparing `main`'s schema to prod is what catches it — and it should fail loudly, because a clean result is the only proof `main` can safely push.
- Deliberate drops: `ALLOW_DESTRUCTIVE_SCHEMA_DIFF=1`. Destruction should be a decision, never an accident.

If the guard fires, the fix is almost always **add the missing thing to `schema.prisma`** so the diff goes additive — not to force the push through.

### Manual step categories to always check
- npx prisma db push (required after any schema change — Keenan must run from home network, work Mac blocks Supabase ports). **Run `npm run db:push`, which is guarded — not bare `prisma db push`. From `main` ONLY, never a feature branch (see the corollary above).**
- New env vars in Vercel (specify which ones and who adds them)
- Vercel redeploy trigger (usually automatic on push, but required after env var changes)
- Inngest app resync (usually automatic on next GET to /api/inngest, but flag if manual resync is needed)

### Plain English section — writing guide
The plain English section exists because Keenan does not read code. Write it the way you would explain the change to a smart friend who has never opened the repo.

Good plain English examples:
- "Users who cancel will now keep access through the end of their billing period instead of losing it immediately."
- "The AI now generates one Reddit post draft per day alongside the other content types. The drafts are labeled clearly so they are never auto-posted."
- "Fixed a bug where the weekly report was silently failing for users whose first recording was on a Sunday."

Bad plain English (too technical):
- "Refactored webhook handler to use idempotency keys"
- "Added migration for GenerationJob schema"
- "Updated Prisma client to v5.22"

### Technical section — writing guide
The technical section exists because Jimmy needs to know exactly what changed in the code without having to diff the commit. Be specific.

Good technical examples:
- "New Prisma model: GenerationJob (fields: id, status, currentStep, stepLabel, errorMessage, startedAt, completedAt)"
- "Added apps/web/src/app/api/admin/content-factory/generate-status/[jobId]/route.ts"
- "Modified generateDailyFn in apps/web/src/inngest/content-factory.ts to update GenerationJob rows after each step"

Bad technical examples:
- "Made generation better"
- "Various improvements"
- "Refactored some stuff"

### Notes section — writing guide
Use for context future-us will need. Decisions with reasoning. Gotchas that cost time.

Good notes:
- "Chose polling every 2s over SSE because Vercel serverless has a 10s limit on streaming connections"
- "Inngest did not auto-register new functions until we triggered a redeploy — flag this for future similar work"
- "GA4 service account keys blocked on Google Workspace org policy — used personal Gmail account instead"

Bad notes:
- "Delivered significant value to users"
- "Exciting milestone for the team"
- "Huge win"

---

## Positioning & Brand Rules

Before writing or editing ANY customer-facing copy (landing pages, ad scripts, onboarding, paywalls, push notifications, emails, app store listings, blog CTAs, waitlist pages, /for/* landing pages, or anything else a user reads), read `docs/acuity-positioning.md` first.

That file is the canonical positioning and brand reference. It defines who we serve, what we sell, voice rules, and mandatory language rules. When anything conflicts with this file, this file wins.

Key rules to internalize (read the full doc for details):
- Acuity is an **AI-powered voice self-reflection app**. It's a **mirror, not a coach** — reflect, don't advise.
- Our audience is **women ~40–50** carrying a heavy mental load. Write for them, not productivity hackers.
- ✅ "debrief," "commit to memory" — ❌ "brain dump"
- ✅ records any time of day — ❌ "nightly," "before bed," any fixed time
- ❌ no recording-duration claims ("60-second," "90-second," etc.)
- Value is **multi-surface** (tasks, mood, patterns, Life Matrix, weekly report) — don't frame any single feature as the sole conversion driver.
- Pricing: **$4.99/month**, $39.99/year, 7-day free trial.

---

# Agent Instructions

You're working inside the **WAT framework** (Workflows, Agents, Tools). This architecture separates concerns so that probabilistic AI handles reasoning while deterministic code handles execution. That separation is what makes this system reliable.

## Commit Message Standards

Every commit Claude Code makes in this repo must follow this format:

```
<type>: <one-line summary in imperative mood, 50-72 chars>

<body: 2-4 sentences explaining WHAT changed and WHY, not HOW>

- <bullet 1: specific file or area affected>
- <bullet 2: specific file or area affected>
- <bullet 3: any notable side effects, migrations, or follow-ups needed>
```

**Rules:**
- `<type>` must be one of: `feat`, `fix`, `refactor`, `perf`, `docs`, `style`, `test`, `chore`, `seo`, `content`
- Summary line is imperative mood ("Add sitemap" not "Added sitemap" or "Adds sitemap")
- Body explains the user-visible or business-visible impact, not implementation details. Someone reading this in a Slack #deploys channel should understand what shipped without opening the diff.
- Bullets list the actual files or systems touched (e.g., `apps/web/src/app/sitemap.ts`, "Stripe webhook handler", "blog post rendering pipeline")
- If the commit fixes a specific issue or user-reported bug, reference it by name in the body
- Never write vague messages like "Update code", "Fix stuff", "Changes", or "WIP"
- If multiple unrelated changes are bundled, split them into separate commits

**Example good commit message:**

```
seo: Remove ad landing pages from sitemap and add noindex meta

Meta ad landers at /for/* were being indexed and diluting SEO signal toward the pillar content. This ships noindex headers on those pages and removes them from the sitemap, while keeping the pillar /voice-journaling page and blog posts indexable.

- apps/web/src/app/sitemap.ts: removed /for/* routes
- apps/web/src/app/for/[slug]/page.tsx: added robots noindex,nofollow metadata
- Verified build passes and /for/anxiety no longer appears in sitemap.xml
```

**Example bad commit message (never produce this):**

```
Update site
```

## The WAT Architecture

**Layer 1: Workflows (The Instructions)**
- Markdown SOPs stored in `workflows/`
- Each workflow defines the objective, required inputs, which tools to use, expected outputs, and how to handle edge cases
- Written in plain language, the same way you'd brief someone on your team

**Layer 2: Agents (The Decision-Maker)**
- This is your role. You're responsible for intelligent coordination.
- Read the relevant workflow, run tools in the correct sequence, handle failures gracefully, and ask clarifying questions when needed
- You connect intent to execution without trying to do everything yourself
- Example: If you need to pull data from a website, don't attempt it directly. Read `workflows/scrape_website.md`, figure out the required inputs, then execute `tools/scrape_single_site.py`

**Layer 3: Tools (The Execution)**
- Python scripts in `tools/` that do the actual work
- API calls, data transformations, file operations, database queries
- Credentials and API keys are stored in `.env`
- These scripts are consistent, testable, and fast

**Why this matters:** When AI tries to handle every step directly, accuracy drops fast. If each step is 90% accurate, you're down to 59% success after just five steps. By offloading execution to deterministic scripts, you stay focused on orchestration and decision-making where you excel.

## How to Operate

**1. Look for existing tools first**
Before building anything new, check `tools/` based on what your workflow requires. Only create new scripts when nothing exists for that task.

**2. Learn and adapt when things fail**
When you hit an error:
- Read the full error message and trace
- Fix the script and retest (if it uses paid API calls or credits, check with me before running again)
- Document what you learned in the workflow (rate limits, timing quirks, unexpected behavior)
- Example: You get rate-limited on an API, so you dig into the docs, discover a batch endpoint, refactor the tool to use it, verify it works, then update the workflow so this never happens again

**3. Keep workflows current**
Workflows should evolve as you learn. When you find better methods, discover constraints, or encounter recurring issues, update the workflow. That said, don't create or overwrite workflows without asking unless I explicitly tell you to. These are your instructions and need to be preserved and refined, not tossed after one use.

## The Self-Improvement Loop

Every failure is a chance to make the system stronger:
1. Identify what broke
2. Fix the tool
3. Verify the fix works
4. Update the workflow with the new approach
5. Move on with a more robust system

This loop is how the framework improves over time.

## File Structure

**What goes where:**
- **Deliverables**: Final outputs go to cloud services (Google Sheets, Slides, etc.) where I can access them directly
- **Intermediates**: Temporary processing files that can be regenerated

**Directory layout:**
```
.tmp/           # Temporary files (scraped data, intermediate exports). Regenerated as needed.
tools/          # Python scripts for deterministic execution
workflows/      # Markdown SOPs defining what to do and how
.env            # API keys and environment variables (NEVER store secrets anywhere else)
credentials.json, token.json  # Google OAuth (gitignored)
```

**Core principle:** Local files are just for processing. Anything I need to see or use lives in cloud services. Everything in `.tmp/` is disposable.

## Bottom Line

You sit between what I want (workflows) and what actually gets done (tools). Your job is to read instructions, make smart decisions, call the right tools, recover from errors, and keep improving the system as you go.

Stay pragmatic. Stay reliable. Keep learning.
