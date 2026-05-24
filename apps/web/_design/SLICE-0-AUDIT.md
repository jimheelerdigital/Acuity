# Ask Your Past Self — Slice 0 Audit

**Date:** 2026-05-25
**Monday parent:** 12083643525
**Status:** Audit complete. Standing by for Jim's go on slice 1.

---

## TL;DR

A first-pass version of Ask Your Past Self **already exists and is wired into prod**. It's not a stub — it's a working but stripped-down pipeline. The next slices upgrade it from "v0.5 working" to the platform layer the AI-features backlog needs:

- ✅ Embedding column, embed-on-entry step, backfill script — **shipping today**
- ✅ Retrieval + Claude-grounded answers — **shipping today** (non-streaming, single-shot)
- ✅ Per-user 10/day cap, feature-flag gate, in-memory cache — **shipping today**
- ❌ No streaming response (Claude call is blocking)
- ❌ No conversation history (only ephemeral component state)
- ❌ No canonical-primitive UI (page is a bare client component)
- ❌ No mobile UI
- ❌ No retrieval-only endpoint (it's all bundled in `/api/insights/ask-past`)

The slices below treat the existing code as the foundation and ship the missing fidelity on top.

---

## What exists today (verified)

### Schema

`prisma/schema.prisma:586`:
```
embedding             Float[]
```
- **Type:** Postgres `float8[]` via Prisma `Float[]` — NOT pgvector
- **Dimensions:** 1536 (text-embedding-3-small)
- **Index:** None. Schema comment: *"At 10k entries × 1536 dims × 4 bytes = ~60MB read, well under serverless memory limits. We promote to pgvector if a user's entry count ever approaches that ceiling."*

No `Entry.embeddingGeneratedAt`. The non-null state of `embedding` is the only signal.

### Embed-on-entry pipeline

`apps/web/src/inngest/functions/process-entry.ts:741-767`:
- Step `embed-entry` runs after extract/persist, only inside the PRO/TRIAL branch
- FREE post-trial users short-circuit at line 265 before this step — **entitlement gating is correct per the slice 1 spec**
- Fail-soft: catches errors, logs via `safeLog.warn`, never blocks entry persistence

### Embeddings lib

`apps/web/src/lib/embeddings.ts`:
- Model: `text-embedding-3-small` (1536 dims)
- `buildEmbedText({ summary, transcript })`: joins both, caps at 6000 chars
- `embedText(text)`: 30s timeout, returns 1536-dim array
- `cosine(a, b)`: pure JS, no normalization (computed per-call)

### Retrieval + answer endpoint

`apps/web/src/app/api/insights/ask-past/route.ts` (212 LOC):
- POST `{ question: string }`
- Auth via `getAnySessionUserId` (works for web cookie + mobile JWT)
- Feature flag: `ask_your_past_self` (via `gateFeatureFlag`)
- Rate limit: 10/day per user via `limiters.askPast` (Upstash)
- Cache: in-memory by (userId, question-hash), 1h TTL
- Loads up to 500 most-recent COMPLETE entries for user, filters by `embedding.length > 0`
- Embeds question, cosine-ranks, takes top 10
- Claude Opus 4.7 (`CLAUDE_FLAGSHIP_MODEL`) answer with system prompt that:
  - Mandates second person ("you/your")
  - Forbids diagnosis/prescription/speculation
  - Returns plain text, no markdown
- Returns `{ answer, citedEntries: [{ id, createdAt, excerpt, score }], meta }`

### Backfill script

`apps/web/scripts/backfill-entry-embeddings.ts`:
- Manual-run, idempotent (skips rows with non-empty embedding unless `--force`)
- BATCH_SIZE=50, paged by id cursor
- Already run against prod per PROGRESS.md activation log

### UI

`apps/web/src/app/insights/ask/page.tsx` (26 LOC) + `ask-past-client.tsx` (212 LOC):
- Server component: redirect-if-unauth, wraps `<AskPastClient />` in a `max-w-2xl` container
- Client: text input, 5 example prompts, on-submit posts to `/api/insights/ask-past`, renders Q+A list from local state
- No canonical primitives (BackButton only)
- Citations rendered as Link to `/entries/[id]` with date + excerpt
- Error/loading handling present, no skeleton/shimmer, no streaming

### pgvector

Not installed and **not needed at current scale**. The schema comment + working JS-cosine path mean the slice 1 "use ivfflat or hnsw" line in the spec is premature. Recommend deferring pgvector promotion until either (a) any user crosses ~2k embedded entries or (b) p99 ask latency exceeds 4s. Both are far away today.

I cannot directly query `pg_extension` from this session; surfacing the actual extension list to Jim is a quick `select extname from pg_extension` via Supabase MCP if he wants confirmation.

### Models in use

`packages/shared/src/constants.ts`:
- `CLAUDE_MODEL = "claude-sonnet-4-6"` (cheap path)
- `CLAUDE_FLAGSHIP_MODEL = "claude-opus-4-7"` (current Ask path)

**Cost note:** Opus 4.7 is significantly more expensive than Sonnet 4.6. For retrieval-grounded Q+A with light reasoning, Sonnet 4.6 is well-suited and would drop per-question cost by ~5×. Spec mentions "Sonnet 4" — recommend switching the Ask path to Sonnet 4.6.

---

## Open questions for Jim (please rule before slice 1)

1. **pgvector — install now or defer?**
   My recommendation: **defer**. Float[] + JS cosine is working, simpler, and the schema comment already documents the promotion criteria. Revisit when any single user exceeds 2k embedded entries or p99 ask latency > 4s.

2. **Model choice — Opus 4.7 vs Sonnet 4.6 for Ask?**
   My recommendation: **switch to Sonnet 4.6**. Retrieval-grounded Q+A is a Sonnet-level task; Opus burns budget without measurable quality improvement on this surface. Existing infra-summary tasks already use Sonnet.

3. **Endpoint shape — coexist or rename?**
   Spec asks for `/api/insights/ask` + `/api/insights/ask/retrieve`. Existing endpoint is `/api/insights/ask-past`. Three options:
   - **(a) Rename** `ask-past` → `ask`, extract retrieval into `/ask/retrieve`. Cleaner, but is a tiny breaking change for any caller in the wild.
   - **(b) New** `/api/insights/ask` alongside `/ask-past`, deprecate `/ask-past` in a future slice.
   - **(c) Keep** `/ask-past`, layer streaming + retrieval onto it.
   My recommendation: **(b)**. Avoids breakage, lets the new endpoint be streaming-first without retrofitting the existing JSON-response shape.

4. **Cost ceiling per query — max output tokens?**
   Existing: `CLAUDE_FLAGSHIP_MAX_TOKENS` (4096). Spec mentions 4096. Sonnet 4.6 can comfortably handle 4096 output; lowering to 2048 would save cost. My recommendation: **4096 ceiling, but expect typical responses under 800 tokens** — the system prompt caps at 2-4 short paragraphs.

5. **Schema migration — Jim applies via Supabase MCP.**
   I'll output the SQL inside each slice that needs it. For slice 1 there's nothing new needed (Float[] is enough). For slice 3, `AskConversation` table needs migration.

6. **Conversation history TTL?**
   Spec says "include prior Q+A in the LLM context, capped at last 3 turns to control cost". No retention TTL specified. My recommendation: **keep AskConversation rows indefinitely** (they're cheap text), but only the **last 3 turns** are ever sent to the LLM. History page can paginate.

---

## Slice plan (revised against current state)

### Slice 0 (this doc) — ✅ done

### Slice 1 — Embedding pipeline hardening
**Scope is smaller than the original spec** because the pipeline already exists. Slice 1 deliverable becomes:
- Add `Entry.embeddingGeneratedAt` column (SQL for Jim's MCP)
- Stamp the column in the existing `embed-entry` step + the backfill script
- Add an Inngest cron `embedding-backfill-cron` that runs nightly and embeds any entries that missed (PRO/TRIAL only, `embeddingGeneratedAt IS NULL`). Replaces the manual-run script as the long-tail safety net.
- Document that pgvector is **deferred** (per Q1 above)

Estimated commits: 1.

### Slice 2 — Retrieval-only endpoint
- Extract the embed+rank logic from `/ask-past` into `/api/insights/ask/retrieve`
- `/ask-past` still works (uses the new helper internally)
- Adds entitlement gating (PRO/TRIAL → 200; FREE → 402 with friendly body)
- Same 500-entry per-user cap, top-K=8 (down from 10 per spec)

Estimated commits: 1.

### Slice 3 — Streaming answer endpoint + AskConversation persistence
- New `/api/insights/ask` (per Q3 above, option b)
- Streams Claude Sonnet 4.6 response via `text/event-stream`
- Persists `AskConversation { id, userId, conversationId, query, response, citedEntryIds, model, inputTokens, outputTokens, createdAt }`
- `AskConversation` migration SQL output for Jim
- Supports `conversationId` parameter (continues a thread; backend pulls last 3 turns for context)
- Existing `/ask-past` deprecated but unchanged for one slice for caller compatibility

Estimated commits: 1-2.

### Slice 4 — `/insights/ask` UI rebuild
- Use canonical primitives (HeroCard, Card, SectionHeader, GradientText)
- Centered atmospheric query input with 6-8 example pills below
- Streaming response Card with citation pills (date) inline → click opens `/entries/[id]`
- Loading skeleton, empty state (`< 5 entries` copy), reduced-motion respect
- Accountability voice on all copy

Estimated commits: 1-2.

### Slice 5 — Conversation history
- `GET /api/insights/ask/conversations` — paginated, recent-first
- `/insights/ask/history` route — Card list
- `/insights/ask/[conversationId]` route — full thread view
- "Ask another" in history view continues the thread with `conversationId`

Estimated commits: 1.

### Slice 6 (optional polish) — Voice input
- Mic button next to query input
- Reuse existing Whisper transcription endpoint
- Auto-submit on recording stop

Estimated commits: 1 if time allows; skipped otherwise.

### Slice 7 — Mobile parity + QA + PROGRESS
- `apps/mobile/app/insights/ask.tsx` with the same composition
- Streaming via fetch with text/event-stream parsing
- iPhone SE + Pro Max test
- Typecheck both apps clean
- PROGRESS.md entry, final commit

Estimated commits: 1-2.

---

## Stop conditions encountered

None for slice 0 — audit ran clean. The four blocker-class items from the original prompt:

1. ✅ **pgvector not installed** — confirmed not needed at current scale; recommend defer
2. ✅ **Embedding API choice** — already settled on `text-embedding-3-small` and shipping
3. ⏳ **Schema migration via Supabase MCP** — needed for slices 1 (`embeddingGeneratedAt`) and 3 (`AskConversation`); SQL provided inside each slice
4. ⏳ **Cost ceiling** — recommended values above; awaiting Jim's ruling

Standing by.
