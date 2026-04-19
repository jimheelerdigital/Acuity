# Acuity — Inngest Migration Plan

**Date:** 2026-04-19
**Author:** Claude (Opus 4.7, 1M context)
**Scope:** Planning only. No code changes.
**Companion docs:** `AUDIT.md` (§3.3, §3.8, §4 call out the current sync-pipeline failure modes); `SECURITY_AUDIT.md` (§4 audio bucket hygiene aligns with the refactor here); `IMPLEMENTATION_PLAN_PAYWALL.md` §5.1, §5.8 (Day 14 audit cron depends on this).

**Changelog:**
- **rev 2 (2026-04-19)** — Four §14 open questions resolved by Jim: (1) polling confirmed as the v1 completion mechanism, Realtime deferred post-launch; (2) server-side recording duration hard cap set at **120s**, not 180s (aligns with the product spec's 30–120s range and the "60 seconds in" thesis; web moves from 60s client-side cap to 120s to match mobile); (3) retry budget split by function type — user-interactive functions (`processEntryFn`, `refreshLifeMapFn`) use 2 retries for ~3-min worst-case user-visible latency, background/scheduled functions (`generateWeeklyReportFn`, `day14AuditCronFn`) use 3 retries for better vendor-outage tolerance; (4) paywall PR interleaving approved — paywall PRs 1–7 run in parallel with Inngest PRs 1–6, paywall PR 8 (Day 14 cron) is the join point after Inngest is proven in prod. §12 also rewritten after Jim flagged that the prior draft conflated the 120s cap's Hobby-fit justification with its real rationale (UX consistency + cost); accurate framing below.

---

## 0. Decisions Locked (2026-04-19)

| # | Decision | Captured in |
|---|---|---|
| 1 | **Client completion mechanism: polling.** Supabase Realtime deferred until post-launch; revisit only if polling cost scales poorly. | §6 |
| 2 | **Recording duration hard cap: 120s, enforced server-side in `/api/record`.** Web client cap moves from 60s to 120s to match mobile. | §4.1, §12.3 |
| 3 | **Retry budgets split by function type.** User-interactive: `retries: 2` (`processEntryFn`, `refreshLifeMapFn`). Background/scheduled: `retries: 3` (`generateWeeklyReportFn`, `day14AuditCronFn`). | §3.1–§3.4 |
| 4 | **Paywall PR interleaving approved.** Paywall PRs 1–7 and Inngest PRs 1–6 run interleaved; paywall PR 8 is the join point. | §14.8 (struck) |

Remaining open questions (§14) are implementation details that don't block PR 1.

---

**Why this migration exists:**

1. **Reliability.** `/api/record` currently runs Whisper + Claude extraction + Prisma transaction + memory update + Life Map update inside a single Vercel function with `export const maxDuration = 120` (Pro-only). A mid-call failure leaves entries stuck in `PROCESSING`; partial failures silently swallow memory/lifemap errors (`lib/pipeline.ts:216`, `:304`). No retries. No dead-letter queue.
2. **Day 14 Life Audit cron prerequisite.** `IMPLEMENTATION_PLAN_PAYWALL.md` §5.1 hard-requires a durable scheduled job for pre-generating audits before `trialEndsAt`. Vercel Cron on Hobby is 1 cron/project and has no retry/backoff primitives; Inngest has unlimited scheduled functions with native retries.
3. **Hobby viability.** We intend to move off Keenan's personal Vercel Pro onto Heeler Digital's Hobby plan. Hobby's 10-second serverless timeout makes the current sync pipeline non-viable. Inngest decouples execution duration from HTTP request duration — routes stay under 10s, functions run as long as they need to.
4. **Correctness of user-perceived flow.** Today a user waits 10–30 seconds staring at a spinner with no feedback; a 502 at 120s costs them the recording entirely. Post-migration the route returns in ~1s, the UI shows granular progress (transcribing → extracting → …), and Inngest's retries make transient Whisper/Claude failures invisible to the user.

---

## 1. Architecture Overview

### 1.1 Current sync flow (record)

```
┌───────────┐                                                             ┌──────────┐
│  Client   │──── POST /api/record (multipart, up to 25MB audio) ────────▶│  Vercel  │
│ (web/iOS) │                                                             │ function │
└───────────┘                                                             └─────┬────┘
                                                                                │ (one HTTP request,
                                                                                │  up to 120s maxDuration,
                                                                                │  blocks the client)
                                                                                ▼
                                   ┌──────────────────────────────────────────────────────┐
                                   │  1. Auth check (getServerSession)                    │
                                   │  2. Parse multipart, validate mime + size            │
                                   │  3. Create Entry PENDING                             │
                                   │  4. Upload audio → Supabase Storage                  │  ~1-3s
                                   │  5. Transcribe (OpenAI Whisper)                      │  ~5-30s
                                   │  6. Build memory context (Prisma read)               │  <1s
                                   │  7. Extract (Claude Opus)                            │  ~3-20s
                                   │  8. Prisma transaction: update Entry + create Tasks  │  <1s
                                   │     + dedupe Goals                                   │
                                   │  9. Update UserMemory (Prisma write; every 10 entries│  <1s
                                   │     also calls compressMemory which is another       │  (+5-15s if it fires)
                                   │     Claude call)                                     │
                                   │ 10. Update LifeMap scores (Prisma write)             │  <1s
                                   │ 11. Return full entry+extraction inline              │
                                   └──────────────────────────────────────────────────────┘
                                                           │
                                                           ▼
                                                    ┌──────────┐
                                                    │  Client  │ finally unblocks
                                                    └──────────┘
```

**Failure modes today:**
- Step 5 or 7 throws → user sees 502 after 10–120s, entry stuck `PROCESSING`, no retry.
- Step 9 or 10 throws → caught, logged, Entry still marked `COMPLETE`. **Life Matrix silently drifts** (AUDIT.md §3.8).
- Vercel function hits 120s → 502. Audio lost for long recordings.
- Compress-memory Claude call fails → caught non-fatally (`memory.ts:149`), memory compression skipped silently.

### 1.2 Current sync flow (weekly report)

```
Client ── POST /api/weekly ──▶ Vercel function
                                │
                                ├─ Auth check
                                ├─ Fetch last 7d of COMPLETE entries (need >=3)
                                ├─ Fetch tasks + active goals
                                ├─ Create WeeklyReport GENERATING
                                ├─ Claude call (Opus, ~5-20s)
                                ├─ Parse JSON
                                ├─ Update WeeklyReport COMPLETE
                                └─ Return report

No maxDuration set — defaults to 10s on Hobby, 15s on Pro. AUDIT.md §3.8: no
transaction around "create → Claude → update" — mid-call failure leaves stuck
GENERATING reports.
```

### 1.3 Current sync flow (lifemap refresh)

```
Client ── POST /api/lifemap/refresh ──▶ Vercel function
                                         │
                                         ├─ Auth check
                                         ├─ compressMemory (if stale) — Claude call
                                         ├─ generateLifeMapInsights  — Claude call
                                         ├─ Re-read areas
                                         └─ Return areas

Two Claude calls sequentially. Easily exceeds 10s on Hobby.
```

### 1.4 Proposed async flow

```
┌───────────┐                                                            ┌─────────┐
│  Client   │──── POST /api/record (multipart, ≤25MB audio) ────────────▶│ Vercel  │
│ (web/iOS) │                                                            │ <2s fn  │
└─────▲─────┘                                                            └────┬────┘
      │                                                                       │
      │                                    ┌──────────────────────────────────┤
      │                                    │ 1. Auth check                    │
      │                                    │ 2. Validate mime + size          │
      │                                    │ 3. Create Entry QUEUED           │
      │                                    │ 4. Upload audio to Supabase      │ <2s
      │                                    │    Storage (object path stored,  │
      │                                    │    not signed URL — aligns w/    │
      │                                    │    SECURITY_AUDIT.md §4)         │
      │                                    │ 5. inngest.send({                │
      │                                    │      name: "entry/uploaded",     │
      │                                    │      data: { entryId, userId,    │
      │                                    │              objectPath,         │
      │                                    │              mimeType,           │
      │                                    │              durationSeconds }   │
      │                                    │    })                            │
      │                                    │ 6. Return 202 { entryId,         │
      │                                    │    status: "QUEUED" }            │
      │                                    └──────────────────────────────────┘
      │                                                                       │
      │                                                                       ▼
      │                                                            ┌──────────────────┐
      │                                                            │  Inngest Cloud   │
      │                                                            │  (durable queue) │
      │                                                            └────────┬─────────┘
      │                                                                     │
      │                                                                     │ invokes each step
      │                                                                     │ as a separate fn call
      │                                                                     │ to /api/inngest
      │                                                                     ▼
      │                            ┌──────────────────────────────────────────────────────┐
      │                            │ Function: processEntry (event: "entry/uploaded")     │
      │                            │                                                      │
      │                            │   step.run("download-audio",      …)  ← retryable    │
      │                            │   step.run("transcribe",          …)  ← retryable    │
      │                            │   step.run("build-memory-context",…)                 │
      │                            │   step.run("extract-claude",      …)  ← retryable    │
      │                            │   step.run("persist-entry",       …)  ← transactional│
      │                            │   step.run("update-user-memory",  …)  ← retryable    │
      │                            │   step.run("update-life-map",     …)  ← retryable    │
      │                            │   step.run("maybe-compress-memory",…) ← conditional  │
      │                            └──────────────────────┬───────────────────────────────┘
      │                                                   │
      │                                                   ▼
      │                                            ┌──────────────┐
      │                                            │ Entry row    │ status transitions:
      │                                            │ (Postgres)   │ QUEUED → TRANSCRIBING →
      │                                            └──────────────┘ EXTRACTING → PERSISTING →
      │                                                             COMPLETE (or PARTIAL / FAILED)
      │
      │
      │      polling every 2s (see §6)
      └──── GET /api/entries/[id] ◀────────────
```

**Key property:** the HTTP request the client sent returns in <2s. Everything else happens in Inngest's durable queue, with per-step retries, exponential backoff, and Vercel function invocations that each complete in under 10s.

### 1.5 Proposed async flow — weekly & lifemap refresh

Same shape. POST accepts request, writes placeholder (`WeeklyReport { status: "GENERATING" }` or a new `LifeMapRefreshJob`), fires event, returns 202. Inngest runs the Claude call(s) as steps. Client polls `/api/weekly` for updated status or `/api/lifemap` for refreshed scores.

---

## 2. Inngest Setup

### 2.1 Account

- Create account at `inngest.com` under Jim's Heeler Digital email (`jim@heelerdigital.com`).
- Create two environments: `production` (→ Vercel Production) and `preview` (→ Vercel Preview deployments). Inngest matches environments by URL pattern.
- No team seat needed for v1 — single-user account is fine.
- Note the signing key and event key per environment.

### 2.2 Package install

```
npm install inngest --workspace @acuity/web
```

Also installs `@inngest/cli` at the root for the local dev server:

```
npm install --save-dev inngest-cli --workspace-root
```

(Or `npx inngest-cli@latest` without installing.)

### 2.3 Files to create

**`apps/web/src/inngest/client.ts`** — singleton Inngest client.

```ts
import { Inngest, EventSchemas } from "inngest";

// Define the event shape once; TS pulls it through every send + handler.
type Events = {
  "entry/uploaded": {
    data: {
      entryId: string;
      userId: string;
      objectPath: string;    // voice-entries/${userId}/${entryId}.${ext}
      mimeType: string;
      durationSeconds?: number;
    };
  };
  "weekly/requested": {
    data: { reportId: string; userId: string };
  };
  "lifemap/refresh-requested": {
    data: { userId: string };
  };
  "life-audit/day-14-due": {
    data: { userId: string; trialEndsAt: string };
  };
};

export const inngest = new Inngest({
  id: "acuity",
  schemas: new EventSchemas().fromRecord<Events>(),
});
```

**`apps/web/src/app/api/inngest/route.ts`** — serves all Inngest functions via Next.js App Router.

```ts
import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { processEntryFn } from "@/inngest/functions/process-entry";
import { generateWeeklyReportFn } from "@/inngest/functions/generate-weekly-report";
import { refreshLifeMapFn } from "@/inngest/functions/refresh-life-map";
import { day14AuditCronFn } from "@/inngest/functions/day-14-audit-cron";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processEntryFn,
    generateWeeklyReportFn,
    refreshLifeMapFn,
    day14AuditCronFn,
  ],
});

export const maxDuration = 60; // upper bound for any single step invocation
```

Note: this route's `maxDuration` is **per-step**, not per-pipeline. Each step runs in its own 10–60s budget; Inngest invokes this route once per step. The overall pipeline can run for hours across retries without any single function invocation exceeding Hobby's limit. Under Hobby's 10s ceiling, individual steps must each complete in <10s — see §12 for which steps fit. If any single step exceeds 10s on Hobby, that step requires Pro. Transcription of a 2-minute recording is the tightest case and is addressed there.

**`apps/web/src/inngest/functions/process-entry.ts`** — the ported pipeline (§3).
**`apps/web/src/inngest/functions/generate-weekly-report.ts`** — §3.
**`apps/web/src/inngest/functions/refresh-life-map.ts`** — §3.
**`apps/web/src/inngest/functions/day-14-audit-cron.ts`** — §3.

### 2.4 Env vars to add

| Var | Where | Notes |
|---|---|---|
| `INNGEST_EVENT_KEY` | Vercel Production + Preview | Used by `inngest.send()` to authenticate event publishes. Rotate on compromise. |
| `INNGEST_SIGNING_KEY` | Vercel Production + Preview | Used by `serve()` to verify incoming function invocations. Must match the env's signing key from Inngest dashboard. |
| `ENABLE_INNGEST_PIPELINE` | Vercel Production + Preview | Feature flag (`"1"` / `"0"`). Controls cutover. See §8. |

Local dev: set `INNGEST_DEV=1` in `.env.local` — Inngest SDK detects dev mode and points events at the local dev server on port 8288.

Add all three to `turbo.json`'s `env:` array so Turbo cache invalidates correctly.

---

## 3. Function Definitions

All function IDs are stable — Inngest uses the `id` field to track function versions and dead-letter state. Renaming an `id` creates a new function and orphans in-flight work.

### 3.1 `processEntryFn` — record pipeline

```ts
export const processEntryFn = inngest.createFunction(
  {
    id: "process-entry",
    name: "Process nightly entry",
    retries: 2,                       // USER-INTERACTIVE: 2 retries caps user-visible latency
                                      // at ~3 min worst case. See §0 decision 3.
    concurrency: {
      key: "event.data.userId",
      limit: 1,                       // one in-flight entry per user; serializes
    },                                // back-to-back recordings for the same user
    throttle: {
      key: "event.data.userId",
      limit: 10,                      // max 10 entries per user per hour
      period: "1h",
    },
  },
  { event: "entry/uploaded" },
  async ({ event, step, logger }) => {
    const { entryId, userId, objectPath, mimeType, durationSeconds } = event.data;

    // Step 1: mark TRANSCRIBING + download audio
    const audioBuffer = await step.run("download-audio", async () => {
      await prisma.entry.update({
        where: { id: entryId },
        data: { status: "TRANSCRIBING" },
      });
      const { data, error } = await supabase.storage
        .from("voice-entries")
        .download(objectPath);
      if (error) throw error;
      return Buffer.from(await data.arrayBuffer()).toString("base64");
    });

    // Step 2: transcribe via Whisper
    const transcript = await step.run("transcribe", async () => {
      const buf = Buffer.from(audioBuffer, "base64");
      const file = await toFile(buf, "recording", { type: mimeType });
      const res = await openai.audio.transcriptions.create({
        file, model: WHISPER_MODEL, language: WHISPER_LANGUAGE,
        response_format: "text",
      });
      const t = (res as unknown as string).trim();
      if (t.length < 10) throw new NonRetriableError("Transcript too short");
      return t;
    });

    // Step 3: build memory context (Prisma read; fast)
    const memoryContext = await step.run("build-memory-context", async () => {
      return buildMemoryContext(userId);
    });

    // Step 4: extract via Claude
    const extraction = await step.run("extract", async () => {
      await prisma.entry.update({
        where: { id: entryId },
        data: { status: "EXTRACTING" },
      });
      return extractFromTranscript(
        transcript,
        new Date().toISOString().split("T")[0],
        memoryContext || undefined
      );
    });

    // Step 5: persist entry, tasks, goals in one transaction
    await step.run("persist-entry", async () => {
      await prisma.entry.update({
        where: { id: entryId },
        data: { status: "PERSISTING" },
      });
      return prisma.$transaction(async (tx) => {
        await tx.entry.update({ where: { id: entryId }, data: {
          audioPath: objectPath,        // <-- path, not signed URL (§4)
          audioDuration: durationSeconds ?? null,
          transcript,
          summary: extraction.summary,
          mood: extraction.mood,
          moodScore: extraction.moodScore,
          energy: extraction.energy,
          themes: extraction.themes,
          wins: extraction.wins,
          blockers: extraction.blockers,
          rawAnalysis: extraction as unknown as object,
          status: "COMPLETE",
        }});
        if (extraction.tasks.length) {
          await tx.task.createMany({ data: extraction.tasks.map(t => ({
            userId, entryId,
            text: t.title, title: t.title,
            description: t.description ?? null,
            priority: t.priority,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
          }))});
        }
        for (const g of extraction.goals) {
          const exists = await tx.goal.findFirst({
            where: { userId, title: { equals: g.title, mode: "insensitive" } },
          });
          if (!exists) {
            await tx.goal.create({ data: {
              userId,
              title: g.title,
              description: g.description ?? null,
              targetDate: g.targetDate ? new Date(g.targetDate) : null,
            }});
          }
        }
      });
    });

    // Steps 6+7: best-effort memory + lifemap updates
    // These are separate steps so Inngest can retry them independently
    // if they fail. On exhaustion they log but don't fail the whole run —
    // the entry is already COMPLETE.
    await step.run("update-user-memory", async () => {
      const entry = await prisma.entry.findUniqueOrThrow({ where: { id: entryId }});
      await updateUserMemory(userId, entry, extraction);
    }).catch(err => {
      logger.error("update-user-memory exhausted retries", { err });
      // Mark PARTIAL so this is auditable
      return prisma.entry.update({
        where: { id: entryId },
        data: { status: "PARTIAL", partialReason: "memory-update-failed" },
      });
    });

    await step.run("update-life-map", async () => {
      await updateLifeMap(userId, extraction.lifeAreaMentions);
    }).catch(err => {
      logger.error("update-life-map exhausted retries", { err });
      return prisma.entry.update({
        where: { id: entryId },
        data: { status: "PARTIAL", partialReason: "lifemap-update-failed" },
      });
    });

    // Step 8: maybe compress memory (every 10 entries)
    // Split into its own step with separate retries because it's the
    // slowest + most failure-prone piece.
    await step.run("maybe-compress-memory", async () => {
      const mem = await prisma.userMemory.findUnique({ where: { userId }});
      if (!mem) return { skipped: "no-memory-row" };
      if (mem.totalEntries % 10 !== 0) return { skipped: "not-10-multiple" };
      await compressMemory(userId);
      return { compressed: true };
    }).catch(err => {
      logger.error("maybe-compress-memory exhausted retries", { err });
      // Non-fatal; memory will compress on the next 10-multiple entry.
    });

    return { entryId, status: "COMPLETE" };
  }
);
```

**Status transitions written by this function:** `QUEUED` (written by `/api/record`) → `TRANSCRIBING` → `EXTRACTING` → `PERSISTING` → `COMPLETE` or `PARTIAL` or `FAILED`.

**Retry behavior (`retries: 2` per §0 decision 3):**
- Transient errors (5xx from OpenAI / Anthropic, network blips) → Inngest auto-retries the failed step up to **2×** with exponential backoff + jitter. In practice the first retry fires around 30s and the second around 2 min, bounding user-visible latency at roughly **3 min worst case** (first attempt + both retries).
- `NonRetriableError` (e.g. transcript too short, 4xx from Anthropic) → step fails immediately; Inngest marks the run failed; entry → FAILED.
- On function failure (all retries exhausted), Inngest fires an `inngest/function.failed` event. We register a catch-all `onFailure` handler (see §3.5) that sets `Entry.status = FAILED` and stores the last error.
- **Note:** Inngest SDK controls backoff timing via its internal exponential-with-jitter policy; `retries` is the only user-facing knob. The 30s / 2-min figures above are typical-case estimates from the default policy, not configured values.

**Concurrency guard:** `concurrency.key = event.data.userId, limit = 1` means a second entry from the same user queues behind the first. Prevents races on `UserMemory` (which is updated incrementally).

**Throttle guard:** `throttle.key = event.data.userId, limit = 10, period = "1h"` is the Inngest-level rate limit, complementing the HTTP-level rate limit (S5 in PROGRESS.md). Belt and suspenders.

### 3.2 `generateWeeklyReportFn`

```ts
export const generateWeeklyReportFn = inngest.createFunction(
  {
    id: "generate-weekly-report",
    name: "Generate weekly report",
    retries: 3,                       // BACKGROUND: 3 retries tolerates longer vendor outages
                                      // (worst case ~14 min wait). No user is watching a spinner.
                                      // See §0 decision 3.
    concurrency: { key: "event.data.userId", limit: 1 },
  },
  { event: "weekly/requested" },
  async ({ event, step }) => {
    const { reportId, userId } = event.data;

    const { entrySummaries, tasksOpened, tasksClosed, goals, weekStart, weekEnd } =
      await step.run("load-week-context", async () => { /* existing /api/weekly fetch logic */ });

    const claudeResponse = await step.run("claude-synthesize", async () => {
      return anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: CLAUDE_MAX_TOKENS,
        system: WEEKLY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildWeeklyUserMessage(/* ... */) }],
      });
    });

    const parsed = await step.run("parse-response", () => {
      return parseWeeklyReportJson(claudeResponse);
    });

    await step.run("persist-report", async () => {
      await prisma.weeklyReport.update({
        where: { id: reportId },
        data: {
          narrative: parsed.narrative,
          insightBullets: parsed.insightBullets,
          moodArc: parsed.moodArc,
          topThemes: parsed.topThemes,
          status: "COMPLETE",
        },
      });
    });

    return { reportId, status: "COMPLETE" };
  }
);
```

Simpler than `processEntry` because there's no audio download, no transcription, no multi-step persist. Single Claude call.

### 3.3 `refreshLifeMapFn`

```ts
export const refreshLifeMapFn = inngest.createFunction(
  {
    id: "refresh-life-map",
    name: "Refresh life map",
    retries: 2,                       // USER-INTERACTIVE: the user tapped the refresh button
                                      // and is watching the LifeMap UI. See §0 decision 3.
    concurrency: { key: "event.data.userId", limit: 1 },
    debounce: {
      key: "event.data.userId",
      period: "10m",  // coalesce back-to-back refresh requests
    },
  },
  { event: "lifemap/refresh-requested" },
  async ({ event, step }) => {
    const { userId } = event.data;

    await step.run("maybe-compress-memory", async () => {
      const mem = await prisma.userMemory.findUnique({ where: { userId }});
      if (!mem?.lastCompressed) return compressMemory(userId);
      const staleThreshold = new Date();
      staleThreshold.setDate(staleThreshold.getDate() - 7);
      if (mem.lastCompressed < staleThreshold) return compressMemory(userId);
    });

    await step.run("generate-insights", () => generateLifeMapInsights(userId));

    return { userId, refreshed: true };
  }
);
```

`debounce` coalesces multiple refresh requests from the same user within 10 minutes into one run. Prevents wasted Claude calls when a user spams the refresh button.

### 3.4 `day14AuditCronFn` — stub (for this migration)

```ts
export const day14AuditCronFn = inngest.createFunction(
  {
    id: "day-14-audit-cron",
    name: "Day 14 Life Audit generator",
    retries: 3,                       // BACKGROUND / SCHEDULED: no user watching.
                                      // See §0 decision 3.
  },
  { cron: "0 22 * * *" }, // daily at 22:00 UTC; real scheduling is per-user (§IMPLEMENTATION_PLAN_PAYWALL §5.1)
  async ({ step, logger }) => {
    // Stubbed for Inngest migration PR. Real implementation lands in the paywall PR.
    logger.info("day-14-audit-cron invoked (stub)");
    return { skipped: true, note: "Audit generator not yet built — see IMPLEMENTATION_PLAN_PAYWALL §5.1" };
  }
);
```

Ship the stub so the cron wiring is proven end-to-end before the paywall PR layers generation on top. The real schedule will iterate through `User` rows where `trialEndsAt` falls in the next 24h and dispatch a per-user event `life-audit/day-14-due`; a second function handles per-user generation. That's paywall-PR scope, not Inngest-migration scope.

### 3.5 `onFailure` handler (optional but recommended)

Single function that listens for any function failure and writes a user-visible error on the relevant row:

```ts
export const onFailureFn = inngest.createFunction(
  { id: "on-failure" },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    const { function_id, error, data } = event.data;
    const { entryId, reportId, userId } = (data as any)?.event?.data ?? {};

    if (function_id === "process-entry" && entryId) {
      await prisma.entry.update({
        where: { id: entryId },
        data: { status: "FAILED", errorMessage: truncateForUi(error.message) },
      });
    } else if (function_id === "generate-weekly-report" && reportId) {
      await prisma.weeklyReport.update({
        where: { id: reportId },
        data: { status: "FAILED" },
      });
    }
    // Post to Sentry / Slack webhook here when observability exists
  }
);
```

---

## 4. Refactor of `/api/record`

### 4.1 New shape

```ts
// apps/web/src/app/api/record/route.ts  (post-migration, feature-flag gated)

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import { inngest } from "@/inngest/client";
import { MAX_AUDIO_BYTES, SUPPORTED_AUDIO_TYPES } from "@acuity/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// maxDuration removed — route completes in <2s end-to-end

export async function POST(req: NextRequest) {
  // 1. Auth
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // 2. Paywall (paywall PR adds this — placeholder for sequencing)
  // if (!entitlementsFor(user).canRecord) return NextResponse.json(..., { status: 402 });

  // 3. Parse + validate
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }

  const audioFile = formData.get("audio");
  if (!audioFile || !(audioFile instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio" }, { status: 400 });
  }
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio exceeds 25MB" }, { status: 413 });
  }
  const rawMime = audioFile.type || "audio/webm";
  const mimeType = rawMime.split(";")[0];
  if (!mimeType.startsWith("audio/")) {
    return NextResponse.json({ error: `Unsupported mime: ${rawMime}` }, { status: 415 });
  }
  const durationSeconds = formData.get("durationSeconds")
    ? Number(formData.get("durationSeconds")) : undefined;

  // 3b. Server-side recording duration cap (§0 decision 2)
  //     Product spec: 30-120s range. Acuity positioning: "60 seconds in."
  //     Client-side caps (mobile 120s, web 120s post-migration) are UX — the
  //     server enforces this as the hard invariant regardless of client.
  if (typeof durationSeconds === "number" && durationSeconds > 120) {
    return NextResponse.json(
      { error: "Recordings are capped at 120 seconds." },
      { status: 413 }
    );
  }

  // 4. Create Entry QUEUED
  const { prisma } = await import("@/lib/prisma");
  const entry = await prisma.entry.create({
    data: { userId, status: "QUEUED" },
  });

  // 5. Upload audio to Supabase Storage (server-side, using service-role client)
  //    Store object path only — NOT signed URL (SECURITY_AUDIT.md §4 alignment)
  const ext = mimeType.split("/")[1]?.replace("x-m4a", "m4a") ?? "webm";
  const objectPath = `${userId}/${entry.id}.${ext}`;
  const { supabase } = await import("@/lib/supabase");
  const buffer = Buffer.from(await audioFile.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("voice-entries")
    .upload(objectPath, buffer, { contentType: mimeType, upsert: false });
  if (uploadError) {
    await prisma.entry.update({
      where: { id: entry.id },
      data: { status: "FAILED", errorMessage: "Upload failed" },
    });
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  // 6. Dispatch Inngest event
  await inngest.send({
    name: "entry/uploaded",
    data: { entryId: entry.id, userId, objectPath, mimeType, durationSeconds },
  });

  // 7. Return 202 with entryId so client can poll
  return NextResponse.json(
    { entryId: entry.id, status: "QUEUED" },
    { status: 202 }
  );
}
```

### 4.2 Feature flag during cutover

```ts
if (process.env.ENABLE_INNGEST_PIPELINE === "1") {
  // New async path (above)
} else {
  // Legacy sync path — keep lib/pipeline.ts::processEntry intact,
  // call it as before, return extraction inline with status 201.
}
```

Both paths share the upload step; only the "what happens after upload" differs. Cutover is a one-line env-var flip.

### 4.3 Lines deleted when cutover completes

- `export const maxDuration = 120;` — gone.
- `import { processEntry } from "@/lib/pipeline";` — gone.
- The ~60 lines of try/catch orchestration around `processEntry()`.
- `lib/pipeline.ts` shrinks to just the helper functions (`uploadAudio`, `transcribeAudio`, `extractFromTranscript`), which are now imported by the Inngest function instead.

---

## 5. Refactor of `/api/weekly`

### 5.1 POST (generate) — new shape

```ts
export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { prisma } = await import("@/lib/prisma");

  // Minimum viable data check — still in the route since it's a user-facing 400
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const entryCount = await prisma.entry.count({
    where: { userId, status: "COMPLETE", entryDate: { gte: weekAgo } },
  });
  if (entryCount < 3) {
    return NextResponse.json(
      { error: "Need at least 3 completed entries" },
      { status: 400 }
    );
  }

  // Guard against duplicate generation (one report per week per user)
  const existing = await prisma.weeklyReport.findFirst({
    where: { userId, weekStart: /* start-of-this-week */, status: { in: ["GENERATING", "COMPLETE"] } },
  });
  if (existing?.status === "GENERATING") {
    return NextResponse.json({ reportId: existing.id, status: "GENERATING" }, { status: 202 });
  }
  if (existing?.status === "COMPLETE") {
    return NextResponse.json({ report: existing }, { status: 200 });
  }

  const report = await prisma.weeklyReport.create({
    data: { userId, weekStart: /* ... */, status: "GENERATING", /* other placeholder fields */ },
  });

  await inngest.send({
    name: "weekly/requested",
    data: { reportId: report.id, userId },
  });

  return NextResponse.json({ reportId: report.id, status: "GENERATING" }, { status: 202 });
}
```

### 5.2 GET (list) — unchanged

`GET` returns the last 10 reports exactly as today. Status field lets the client distinguish `GENERATING` (show spinner) from `COMPLETE` (render) from `FAILED` (show error).

### 5.3 Refactor of `/api/lifemap/refresh`

```ts
export async function POST() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await inngest.send({
    name: "lifemap/refresh-requested",
    data: { userId: session.user.id },
  });

  return NextResponse.json({ status: "QUEUED" }, { status: 202 });
}
```

The Inngest function's `debounce` handles request coalescing. Client polls `GET /api/lifemap` until `LifeMapArea.updatedAt` is fresher than the refresh time.

---

## 6. Client Changes

### 6.1 Options considered

| Approach | Pros | Cons |
|---|---|---|
| **Polling** | Works on Hobby; works without RLS configured; same code for web + mobile; trivial to debug. | Not instant (2s granularity); small wasted bandwidth. |
| **Supabase Realtime** | Server pushes; instant. | Needs RLS policies live (blocked on S2 — Supabase access). Browser WebSocket reliability on mobile networks is mediocre. Separate client code paths web vs mobile. |
| **Server-Sent Events (SSE) from Next.js** | Simple server-push. | Hobby's 10s execution limit breaks the stream within 10s; requires Edge runtime + fluid compute, which is paid territory. Defeats the point of going to Hobby. |
| **Inngest → webhook → push notification** | Best UX; user can close the app and get notified. | Requires push infrastructure (Expo push tokens, APNS setup) which is v2 per PROGRESS.md. Doesn't help web. |

### 6.2 Decision: Polling (locked — §0 decision 1)

**Ship polling as the v1 completion mechanism.** Confirmed 2026-04-19. Rationale:

- It unblocks the migration without depending on RLS (blocked on Supabase access).
- Same client code for web + mobile — lowest-complexity implementation.
- Typical entry processing takes 10–30s; 2s polling is a tolerable perceived latency.
- Polling cost is negligible: 15 polls × 50 users × 30 entries/month ≈ 22.5K requests/month, well under Hobby's bandwidth ceiling.

**Revisit post-launch** if polling cost scales poorly (e.g., at 500+ users the poll volume + Vercel function-invocation count warrants Supabase Realtime for bandwidth). Not a migration-scope concern.

### 6.3 Client polling loop (web + mobile, same logic)

```ts
// lib/poll-entry.ts (new, shared by web + mobile)
export async function pollEntry(
  entryId: string,
  onProgress: (entry: Entry) => void,
  opts: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<Entry> {
  const maxAttempts = opts.maxAttempts ?? 60;      // 60 × 2s = 2 minutes
  const intervalMs  = opts.intervalMs  ?? 2000;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`/api/entries/${entryId}`, { credentials: "include" });
    if (!res.ok) throw new Error(`Entry fetch failed: ${res.status}`);
    const { entry } = await res.json();
    onProgress(entry);
    if (entry.status === "COMPLETE" || entry.status === "FAILED" || entry.status === "PARTIAL") {
      return entry;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error("Entry processing exceeded 2-minute polling window");
}
```

After `maxAttempts` (2 min), show a "Still working — check back later" message and stop polling. Don't burn requests forever.

### 6.4 UX — web (`dashboard/record-button.tsx`)

State machine:

```
idle ─ record ─▶ recording ─ stop ─▶ uploading
                                        │
                                        │ POST /api/record returns 202 { entryId, status: "QUEUED" }
                                        ▼
                                    processing (status visible as stepper)
                                    ├─ QUEUED           "Saving your recording…"
                                    ├─ TRANSCRIBING     "Transcribing your voice…"
                                    ├─ EXTRACTING       "Extracting insights…"
                                    ├─ PERSISTING       "Organizing your entry…"
                                    │
                                    ▼
                                 done (status: COMPLETE → show entry)
                                       or failed (status: FAILED → error + retry button)
                                       or partial (status: PARTIAL → show entry + warning toast)
```

Stepper is four pills with the current step highlighted. Each step lights up for ~3–8s; total perceived time ~15–25s. Feels purposeful, not dead-air.

### 6.5 UX — mobile (`app/(tabs)/index.tsx`)

Mobile has less real estate. Two-state UI:

- **Processing:** spinner + current status text ("Transcribing…" / "Extracting…" / …). Same polling loop; no stepper.
- **Done / Failed:** existing inline result display.

Same polling cadence (2s). No stepper because on a 390px-wide screen, the flicker of four pills updating is more distracting than informative; a single progress line works better.

### 6.6 Error states (all clients)

- **FAILED:** show the Entry's `errorMessage` (sanitized for user display by the `onFailure` handler) + a "Try again" button that POSTs to `/api/entries/[id]/retry` (new route — §11 PR 8). The route re-fires the Inngest event if the entry is still in QUEUED/FAILED state and the audio is still in Supabase Storage.
- **PARTIAL:** show the entry as usual, plus a toast: "Your entry is saved, but Life Matrix updates will catch up shortly." No action needed — next successful entry will re-trigger memory/lifemap updates.
- **Polling timeout (2 min):** show "Still processing… we'll have this ready when you come back" and stop polling. The Entry row is visible on the next dashboard load and will show whatever status it reaches.

### 6.7 Mobile auth consideration

`apps/mobile/lib/api.ts` uses `credentials: "include"` against cookie-based NextAuth sessions. Polling requests inherit the same session cookie; no changes needed.

---

## 7. Data Model Changes

### 7.1 `Entry` model updates

```prisma
model Entry {
  id                String    @id @default(cuid())
  userId            String
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)   // also fixes AUDIT.md §3.5
  audioPath         String?   // NEW — replaces audioUrl; store object path, sign on demand
  audioUrl          String?   // DEPRECATED — keep for one release; remove after cutover
  duration          Int?
  audioDuration     Int?
  transcript        String?
  summary           String?
  mood              String?
  moodScore         Int?
  energy            Int?
  themes            String[]
  wins              String[]
  blockers          String[]
  rawExtraction     Json?
  rawAnalysis       Json?

  // NEW status vocabulary (String for now; migrate to enum in a follow-on):
  //   QUEUED | TRANSCRIBING | EXTRACTING | PERSISTING | COMPLETE | PARTIAL | FAILED
  status            String    @default("QUEUED")

  // NEW error + debug columns:
  errorMessage      String?   // user-safe message for FAILED state
  partialReason     String?   // "memory-update-failed" | "lifemap-update-failed" | ...
  inngestRunId      String?   // for debugging; written at the top of processEntryFn

  entryDate         DateTime  @default(now())
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  tasks             Task[]

  @@index([userId, createdAt])   // also fixes AUDIT.md §3.5
  @@index([userId, status])
  @@index([status])              // for operational queries
}
```

**Migration path for existing entries:** `UPDATE "Entry" SET "status" = 'COMPLETE' WHERE "status" = 'COMPLETE';` no-op works; `UPDATE "Entry" SET "status" = 'FAILED' WHERE "status" IN ('PENDING', 'PROCESSING');` sweeps any stuck entries at cutover time.

**`audioUrl` deprecation:** for one release the Inngest function writes both `audioPath` (new) and `audioUrl` (old signed URL that'll expire). Client reads `audioPath` if present, falls back to `audioUrl`. Next release removes `audioUrl` from schema and clients.

### 7.2 `WeeklyReport` model updates

```prisma
model WeeklyReport {
  // ... existing fields ...
  status            String    @default("GENERATING")  // GENERATING | COMPLETE | FAILED
  errorMessage      String?   // NEW
  inngestRunId      String?   // NEW

  @@index([userId, weekStart])        // lookup by week (existing /api/weekly relies on this)
  @@index([userId, status])
}
```

Unique index on `(userId, weekStart)` would enforce "one report per user per week" but requires defining weekStart normalization. Deferred — the POST handler's duplicate check is sufficient for v1.

### 7.3 No new top-level models required

The Day 14 Life Audit model is defined in `IMPLEMENTATION_PLAN_PAYWALL.md` §2.2 and lands with the paywall PR, not this one.

### 7.4 Schema push strategy

All additive — new columns default NULL or have safe defaults. No renames, no drops. One `prisma db push` at cutover, no data migration needed.

---

## 8. Parallel Deployment Strategy

### 8.1 Feature flag, not direct cutover

**`ENABLE_INNGEST_PIPELINE`** env var in Vercel:

| Value | Behavior |
|---|---|
| unset / `"0"` | Sync pipeline (current behavior). `/api/record` blocks on Whisper + Claude; `/api/weekly` same; `/api/lifemap/refresh` same. |
| `"1"` | Async pipeline. POST routes return 202 immediately; Inngest runs the work. Clients poll. |

**In Vercel:** set `ENABLE_INNGEST_PIPELINE=1` in **Preview** first, verify on a preview deployment with real traffic (yourself + test accounts), then flip in **Production**.

**Rollback is trivial:** flip env var to `"0"`, redeploy. Next request hits the sync path. Existing queued Inngest jobs still run to completion (they're in Inngest's queue independent of our Vercel config), so no stuck entries.

### 8.2 Why feature flag beats direct cutover

- If Inngest has availability issues in the first week, we flip back without a deploy.
- Lets us run the sync + async paths side by side in preview and compare Entry status distributions, latency, error rates.
- Lets us shadow-mode test (not default) — with light code, dispatch to Inngest *and* run sync, compare outputs. Overkill for this migration; flag alone is enough.

### 8.3 When to remove the flag

After 7 days of green production (§9 "proven" criteria), the sync code path can be removed in a cleanup PR. Leave the flag infrastructure (reading env var) in place for one more release cycle in case of a late-breaking issue, then strip it.

---

## 9. Testing Strategy

### 9.1 Local: Inngest Dev Server

`npm run dev` starts Next.js on port 3000 as today.
`npx inngest-cli dev` starts the Inngest dev UI on port 8288.

Dev server auto-detects `/api/inngest` on localhost:3000 and pulls function definitions. Event sends go to local queue; invocations happen immediately. The UI (http://localhost:8288) shows function runs, step timings, retries, inputs/outputs — better than any logging story we have today.

No API key needed in dev mode. Set `INNGEST_DEV=1` to force dev mode even if other Inngest env vars are set.

**Local test loop:**
1. Start Inngest dev server.
2. Start Next dev server.
3. Record a test entry via the web UI.
4. Inngest dashboard shows the run appearing; each step ticks through TRANSCRIBING → EXTRACTING → ….
5. Inspect any step's input/output in the dashboard to debug failures.

### 9.2 Unit tests (Vitest — setup already committed in paywall PR §9)

- `process-entry.fn.test.ts` — mock Prisma + Anthropic + OpenAI clients. Verify:
  - Happy path: all 8 steps run, entry ends COMPLETE.
  - Whisper throws once → step retries → succeeds → entry COMPLETE.
  - Whisper throws 3× (initial + 2 retries) → step exhausted → run fails → `onFailure` fires → entry FAILED.
  - Transcript <10 chars → `NonRetriableError` → entry FAILED immediately (no retry).
  - Memory step fails → entry PARTIAL, rest of pipeline unaffected.
- `generate-weekly-report.fn.test.ts` — similar matrix.

### 9.3 Preview deployment testing

Each Inngest function gets a dedicated Preview environment (`git push` triggers Vercel Preview + Inngest auto-registers the new function URLs).

- Connect Vercel Preview env vars pointing at Inngest's **Preview** environment keys.
- Push a test recording via the preview URL.
- Verify via Inngest Preview dashboard: run shows up, completes, status transitions are correct.

### 9.4 "Proven" criteria — before removing sync path

The sync path stays in code behind the feature flag until:

1. **7 consecutive days** of `ENABLE_INNGEST_PIPELINE=1` in Production with:
   - **Zero FAILED entries** caused by Inngest issues (as distinct from upstream Whisper/Claude failures that would have failed either way).
   - **Zero orphaned QUEUED entries** (entries that never got their Inngest event delivered).
   - **P95 entry-to-COMPLETE latency under 45 seconds** (today's sync pipeline averages 15–30s; allowing 15s of Inngest queue overhead).
2. **100 successful real-user entries** processed through Inngest (or 7 days × test account entries, whichever arrives first at current scale).
3. **Manual failure-mode verification:** intentionally trip Whisper (send a 1-byte audio) and Claude (prompt that returns non-JSON) in Preview, confirm the FAILED + PARTIAL paths work end-to-end.
4. **Cost check:** one Inngest billing cycle in view (§13) so we know our actual step-rate is in the bucket we predicted.

All four met → open the "remove sync path" cleanup PR.

---

## 10. Rollback Plan

### 10.1 If Inngest is down (service outage)

**Symptom:** `inngest.send()` calls in `/api/record` throw or return errors; entries stay QUEUED forever.

**Response:**
1. Flip `ENABLE_INNGEST_PIPELINE` to `"0"` in Vercel Production env. Trigger a redeploy (or use `vercel env pull && vercel deploy` if we have that wired). All new requests go to the sync path.
2. Run a cleanup query marking orphaned entries as FAILED: `UPDATE "Entry" SET "status" = 'FAILED', "errorMessage" = 'Processing infrastructure outage — please try again' WHERE "status" = 'QUEUED' AND "createdAt" < now() - interval '10 minutes';`
3. When Inngest recovers, flip the flag back to `"1"`. Existing entries queued in Inngest before the outage will resume from their last completed step — no action needed there.

### 10.2 If an Inngest function has a bug

**Symptom:** a specific function (say `processEntryFn`) fails consistently on real events.

**Response:**
1. In Inngest dashboard, **pause** the function. New events of that type queue but don't invoke until unpaused.
2. Ship the fix. The paused queue drains on unpause.
3. OR flip `ENABLE_INNGEST_PIPELINE=0` to stop new events flowing while you fix; unpause + re-enable in lockstep.

### 10.3 If a downstream dependency (Whisper/Claude) is down

Inngest's retry policy handles this automatically. Steps retry at 1m / 3m / 9m; by the 9m mark the vendor is usually back. Entries stay in the intermediate status (TRANSCRIBING / EXTRACTING) and the client sees them as processing.

If the outage extends beyond 30 minutes, the client's 2-min polling window will have timed out — the user sees "Still processing… we'll have this ready when you come back" and can check back later. No user-facing failure for a 30-min vendor outage.

### 10.4 If Supabase is down

Audio upload fails in the route (before Inngest event). Route returns 502; client shows "Upload failed, please try again." No Inngest event fires, no ghost entry in the DB (the `prisma.entry.create` is before the upload; we'd need to roll it back on upload failure — pseudocode in §4.1 does this).

### 10.5 If we just want to flip Inngest off permanently

The sync path never left `lib/pipeline.ts` while the flag exists. Flip the flag, remove the Inngest functions from `serve()`, leave the files in place. No DB changes needed — the new status values (QUEUED, TRANSCRIBING, EXTRACTING, PERSISTING, PARTIAL) just become unused.

---

## 11. Migration Sequence (PR-by-PR)

Each PR is testable in isolation; merging any subset leaves the product in a working state.

### PR 1: Inngest bootstrap — no behavior change

**Branch:** none (direct to main per workflow).

**Files:**
- `apps/web/package.json` — add `inngest`.
- `apps/web/src/inngest/client.ts` — new.
- `apps/web/src/app/api/inngest/route.ts` — new, serves `[]` (empty function set).
- `turbo.json` — add `INNGEST_*` vars.
- `.env.example` — add `INNGEST_EVENT_KEY=""`, `INNGEST_SIGNING_KEY=""`, `ENABLE_INNGEST_PIPELINE=""`.

**Manual steps after merge:**
- Create Inngest account (§2.1).
- Set env vars in Vercel Preview + Production.
- Verify Inngest dashboard shows the `acuity` app registered on next deploy.

**Verification:** POST to `/api/inngest` returns `200 { functions: [] }`. No user-facing change.

### PR 2: Define `processEntryFn` — not wired

**Files:**
- `apps/web/src/inngest/functions/process-entry.ts` — new, ports `lib/pipeline.ts::processEntry` into Inngest `step.run()` structure.
- `apps/web/src/app/api/inngest/route.ts` — register `processEntryFn`.
- `apps/web/src/inngest/functions/on-failure.ts` — new, the catch-all.

**Verification:**
- In Inngest dashboard, manually send a test `entry/uploaded` event with a real `entryId` pointing at a test audio file already in Supabase Storage. Watch it run end-to-end.
- Unit tests (§9.2) pass.

### PR 3: Schema updates

**Files:**
- `prisma/schema.prisma` — new status values (string; not a migration to an enum yet), `errorMessage`, `partialReason`, `inngestRunId`, `audioPath`, indexes, `onDelete: Cascade`.
- `AUDIT.md` §3.5 cascade/index items also get fixed here — piggyback.

**Manual steps:** `prisma db push` with Supabase access.

**Verification:** `\d "Entry"` shows the new columns. No behavior change until PR 4.

### PR 4: Wire `/api/record` behind flag

**Files:**
- `apps/web/src/app/api/record/route.ts` — feature-flag branch (§4.2).

**Verification:**
- `ENABLE_INNGEST_PIPELINE=0` (default): identical behavior to today.
- `ENABLE_INNGEST_PIPELINE=1`: POST returns 202; Inngest dashboard shows the run; Entry transitions through statuses.

### PR 5: Client polling + UX

**Files:**
- `apps/web/src/lib/poll-entry.ts` (new, shared helper).
- `apps/web/src/app/dashboard/record-button.tsx` — handle 202 response, poll, render stepper.
- `apps/mobile/app/(tabs)/index.tsx` — handle 202 response, poll, render spinner + status.
- `apps/mobile/lib/api.ts` — add `pollEntry` helper (same logic, native fetch).

**Verification:** record an entry on web + mobile, watch stepper tick through statuses, land on COMPLETE. FAILED path tested via a forced-fail toggle.

### PR 6: Wire `/api/weekly` and `/api/lifemap/refresh` behind flag

**Files:**
- `apps/web/src/inngest/functions/generate-weekly-report.ts` — new.
- `apps/web/src/inngest/functions/refresh-life-map.ts` — new.
- `apps/web/src/app/api/weekly/route.ts` — flag branch.
- `apps/web/src/app/api/lifemap/refresh/route.ts` — flag branch.
- Clients in `insights-view.tsx` / mobile insights — poll `GET /api/weekly` for status transitions.

**Verification:** generate a weekly report with flag on. Report appears as GENERATING, then COMPLETE within 30s.

### PR 7: Day 14 cron stub

**Files:**
- `apps/web/src/inngest/functions/day-14-audit-cron.ts` — stub per §3.4.
- Register in `/api/inngest/route.ts`.

**Verification:** cron appears in Inngest dashboard with next scheduled invocation. Manually trigger once; logs "(stub)".

### PR 8: Retry endpoint + orphan cleanup

**Files:**
- `apps/web/src/app/api/entries/[id]/retry/route.ts` — new POST that re-fires `entry/uploaded` if Entry is FAILED or QUEUED and `audioPath` still resolves.
- `apps/web/src/app/api/admin/cleanup/route.ts` — admin-only endpoint (gated by `isAdmin`) that sweeps orphan QUEUED entries older than 10 minutes to FAILED.

### PR 9: Flip production flag

**No code change.** Vercel env var `ENABLE_INNGEST_PIPELINE=1` in Production. Redeploy.

### PR 10 (after "proven" criteria §9.4): Remove sync path

**Files:**
- `lib/pipeline.ts` — delete `processEntry()`; keep helpers (`uploadAudio`, `transcribeAudio`, `extractFromTranscript`) that Inngest still imports.
- `apps/web/src/app/api/record/route.ts` — remove `export const maxDuration = 120;` and the flag branch.
- `apps/web/src/app/api/weekly/route.ts` — same.
- `apps/web/src/app/api/lifemap/refresh/route.ts` — same.
- `schema.prisma` — drop `audioUrl` column, keep `audioPath`.

**Verification:** tag this as "Hobby-viable" point. §12 checklist goes green.

---

## 12. Hobby Viability Check

### 12.1 Execution model — what actually runs where

Jim flagged that the prior draft of this section was muddled about where Inngest steps execute. Correcting now, with citations to Inngest's own docs:

- Inngest's execution model is **"your functions run on your own compute, in any environment, including serverless."** Inngest itself is the orchestrator/queue — it does not run your step code.
- **Each `step.run()` call is a separate HTTP request** to our `/api/inngest` handler. Inngest re-invokes the endpoint with the event payload plus the persisted state of completed steps; the SDK memoizes those and runs the next unexecuted step.
- Because each step invocation is an HTTP call landing on our Vercel deployment, **our platform's function timeout applies to each individual step**, not to the whole pipeline.

**Implications on Vercel Hobby (10s per function invocation):**

- Each `step.run()` body must complete in under 10s.
- The overall pipeline can run for hours across many step invocations — Inngest's free tier allows up to **2 hours per step** and up to **1000 steps per function**, so Inngest is never the binding constraint for us; Vercel is.
- A step that takes >10s on Hobby will 504 from Vercel, which Inngest treats as a transient failure and retries. Retries don't help if the step is consistently slow — they just delay the eventual FAILED.
- The `/api/record`, `/api/weekly`, `/api/lifemap/refresh` POST handlers themselves (the ones the client calls) become <2s operations. That part isn't affected by Inngest at all — it's just that the handler offloads work instead of doing it inline.

### 12.2 Per-step execution times — the thing that actually determines Hobby fit

| Function | Step | Expected time | Fits Hobby 10s? |
|---|---|---|---|
| processEntry | download-audio (≤3MB at 120s cap) | 1–2s | ✅ |
| processEntry | transcribe (Whisper-1, ≤120s audio) | 3–7s typical; rare tail to ~10s under OpenAI load | ⚠️ mostly ✅, occasional risk |
| processEntry | build-memory-context | <1s | ✅ |
| processEntry | extract (Claude Opus, ~1500 output tokens) | 4–9s | ✅ |
| processEntry | persist-entry (Prisma transaction) | <1s | ✅ |
| processEntry | update-user-memory | <1s | ✅ |
| processEntry | update-life-map | <1s | ✅ |
| processEntry | maybe-compress-memory (Claude, every 10 entries) | 5–10s | ⚠️ close to ceiling |
| generateWeeklyReport | load-week-context | <1s | ✅ |
| generateWeeklyReport | claude-synthesize | 4–9s | ✅ |
| generateWeeklyReport | parse + persist | <1s | ✅ |
| refreshLifeMap | maybe-compress-memory | 5–10s | ⚠️ |
| refreshLifeMap | generate-insights | 5–10s | ⚠️ |

Three steps sit close to the 10s ceiling in the long-tail: **transcribe** (rare), **maybe-compress-memory** (regular), **generate-insights** (regular). These are all Claude-shaped calls where variance is driven by vendor latency + prompt/response size, not by our recording length.

**Mitigations if any step consistently breaches 10s on Hobby:**

- **Streaming the Claude response** via the Anthropic SDK's streaming mode — TTFT is very fast and the function can return once the response is parsed, not once the last byte is received. Not required for v1.
- **Shorter prompts** for compress-memory — the existing prompt in `buildCompressionPrompt` pulls 20 recent entries; trimming to 10 would cut call time meaningfully without harming compression quality.
- **Accept occasional FAILED** on tail latency and rely on Inngest's 2 retries (§3.1 decision) — a second attempt often lands inside 10s because vendor latency is independent across calls. A FAILED entry is always recoverable via the `/api/entries/[id]/retry` route (PR 8).
- **If compress-memory is regularly over 10s:** move the "every 10 entries" trigger out of `processEntryFn` entirely and into a separate scheduled compression job, decoupled from user-facing latency. Future refactor — not needed for v1.

**Bandwidth:** at 50 users × 30 entries/month × ≤3MB/audio (120s cap) = ~4.5GB/month upload + negligible JSON traffic. Under 5% of Hobby's 100GB/mo ceiling.

**Cron limit:** Vercel Hobby allows 1 cron per project. Inngest handles all our scheduled work — Day 14 audit cron + waitlist drip (when reactivated) — so Vercel Cron needs 0 slots.

### 12.3 The 120s recording cap — why (not Hobby fit)

Jim correctly pushed back on the prior draft here. The 120s cap is **not primarily a Hobby-fit decision**. At 120s audio, Whisper transcription typically completes in 3–7s — well inside Hobby's ceiling. The cap exists for two independent reasons:

1. **UX and product fit.** Product spec calls for a 30–120s range; the positioning copy is *"60 seconds in."* A 180s cap contradicts the product thesis. Web currently caps at 60s client-side, mobile at 120s — web moves to 120s to match mobile, and both align with the product-spec ceiling.
2. **Cost control.** Longer audio → more Whisper seconds billed, longer transcripts → more Claude input tokens in the extract step. A 120s cap is a natural unit-economics ceiling.

The cap is enforced server-side in `/api/record` (§4.1) as a hard invariant, independent of client version.

### 12.4 Per-route execution budget (the part that isn't changed by Inngest)

Every route under `apps/web/src/app/api/**` with expected post-migration execution time. These are the handlers the client calls; they do not run Inngest steps, they enqueue them.

| Route | Method | Expected post-migration time | Hobby? |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | <2s (OAuth redirects + DB session write) | ✅ |
| `/api/record` | POST | <2s (auth, upload ≤3MB to Supabase, one Inngest `send()`, return 202) | ✅ |
| `/api/entries` | GET | <1s (one Prisma query, LIMIT 30) | ✅ |
| `/api/entries/[id]` | GET | <1s (one Prisma query with include) | ✅ |
| `/api/entries/[id]/retry` | POST | <1s (Prisma read + Inngest send) | ✅ (new in PR 8) |
| `/api/tasks` | GET/POST/PATCH | <1s | ✅ |
| `/api/goals` | GET/POST/PATCH | <1s | ✅ |
| `/api/weekly` | GET | <1s (find last 10) | ✅ |
| `/api/weekly` | POST | <1s (count check + Prisma create + Inngest send) | ✅ |
| `/api/lifemap` | GET | <1s post-N+1-fix (AUDIT.md §3.8) | ✅ |
| `/api/lifemap/refresh` | POST | <1s (Inngest send) | ✅ |
| `/api/lifemap/history` | GET | <1s (8-week fetch + in-memory aggregation) | ✅ |
| `/api/stripe/checkout` | POST | 1–2s (Stripe API call) | ✅ |
| `/api/stripe/webhook` | POST | <1s (Stripe sig verify + Prisma update) | ✅ |
| `/api/waitlist` | POST | 2–4s (Prisma + two Resend sends via `Promise.allSettled`) | ✅ |
| `/api/waitlist/count` | GET | <1s | ✅ |
| `/api/cron/waitlist-drip` | GET | Currently parked. When reactivated: migrate to Inngest cron (not a Vercel cron route). | ⏸ parked |
| `/api/admin/dashboard` | GET | <1s (5 parallel Prisma queries) | ✅ |
| `/api/admin/cleanup` | POST | <2s (sweep query) | ✅ (new in PR 8) |
| `/api/inngest` | GET/POST/PUT | Per-invocation runs one Inngest step. See §12.2 for the actual binding constraint. | ⚠️ depends on the step — see §12.2 |

### 12.5 Verdict

**Hobby is viable post-migration.** Two things to know:

1. **Every route the client calls** (the "outer" API surface — `/api/record`, `/api/weekly`, `/api/lifemap/refresh`, etc.) finishes well inside Hobby's 10s ceiling because Inngest takes the long work out of the request path. **This is the core Hobby-viability argument**, not the recording cap.
2. **The inner `/api/inngest` handler** runs each step within Hobby's 10s ceiling. Three steps have tail-latency risk (transcribe, compress-memory, generate-insights) — rarely on transcribe, regularly within budget on the others. If any becomes a reliability problem in production, the mitigations in §12.2 apply, ordered by cost. None require Pro.

**Cron:** Inngest-scheduled, which invokes our `/api/inngest` endpoint the same way event-triggered functions do. Hobby serves `/api/inngest` fine. Vercel Cron is not used.

**Expect to see these in production logs** once Inngest is live:
- Occasional 504s on the `/api/inngest` route from long Claude calls — these are Inngest retries in progress, not user-visible failures.
- `Entry.status = FAILED` entries at a low rate (~1%) from exhausted retries. The retry endpoint (PR 8) makes these recoverable.
- No 504s on the outer API routes — those all return in under 2s by design.

---

## 13. Cost Estimate

### 13.1 Inngest's pricing (as of 2026-04)

Free tier: **50,000 function runs/month** (also called "steps" depending on plan generation). Concurrency: 5. Retention: 24h of run history.

Next paid tier: **$20/month** for 200K runs, unlimited concurrency, 7-day history.

### 13.2 Expected usage at beta scale

**Assumptions** — reasonable beta-launch numbers:
- 50 users, each recording 30 entries/month → 1,500 entries/month.
- Each entry runs `processEntryFn` with **8 steps** (download, transcribe, context, extract, persist, memory, lifemap, compress-maybe).
- Weekly reports: 50 users × 4 reports/mo × **3 steps** = 600 steps.
- Life Map refreshes: 50 users × 8 refreshes/mo × **2 steps** = 800 steps.
- Day 14 audit cron: 50 users × 1 audit × **4 steps** = 200 steps.
- Failure handler: ~1% of entries → 15 failures × **1 step** = 15 steps.

**Total:** `1,500 × 8 + 600 + 800 + 200 + 15` ≈ **13,600 steps/month**.

Fits comfortably within the 50K free tier — ~27% utilization.

### 13.3 Usage at 10× (500 users)

`500 × 30 × 8 + 500 × 4 × 3 + 500 × 8 × 2 + 500 × 4 + ~15 failures` = **134,500 steps/month**.

Exceeds free tier by ~3×. Paid tier ($20/mo for 200K) covers it.

### 13.4 Crossover point

Free tier accommodates roughly **180 users at 30 entries/month** before step budget exhausts. At that scale the product is generating revenue — $20/mo for Inngest is a rounding error.

### 13.5 Other costs unchanged

The Whisper + Claude costs are **the same as today** — Inngest doesn't touch token pricing. Migration doesn't raise or lower OpenAI/Anthropic bills. It raises reliability and lowers user-visible failures.

---

## 14. Open Questions

Items needing your input before implementation. None are blocking for PR 1 (which just bootstraps Inngest with no behavior change).

Four questions from rev 1 resolved 2026-04-19 and moved to §0 decisions:
- ~~Client completion mechanism — polling vs Realtime~~ → §0 decision 1 (polling).
- ~~Max recording duration enforced server-side~~ → §0 decision 2 (120s).
- ~~Retry budget for Claude calls~~ → §0 decision 3 (split: 2 for user-interactive, 3 for background).
- ~~Paywall PR interleaving~~ → §0 decision 4 (approved).

Still open:

1. **Inngest environment naming.** Match Vercel's `Production` + `Preview` convention, or something else? Recommendation: match. Decision needed before PR 1.

2. **Who owns the Inngest account?** If this will live under Heeler Digital long-term, create the account with `jim@heelerdigital.com` (not a personal email). Decision needed before PR 1.

3. **`PARTIAL` entry UX — is the warning toast sufficient, or do we want a "refresh failed updates" manual action on the entry page?** Recommendation: toast-only for v1; the next successful entry triggers memory/lifemap catch-up anyway. Decision needed before PR 5.

4. **Observability.** Inngest dashboard covers run-level visibility. Do we want Sentry/Datadog for errors from our code paths? Not blocking the migration — can be added anytime. Decision deferred.

---

*End of plan. See `PROGRESS.md` for the living task log and priority ordering.*
