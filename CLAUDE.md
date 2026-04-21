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

### Manual step categories to always check
- npx prisma db push (required after any schema change — Keenan must run from home network, work Mac blocks Supabase ports)
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
