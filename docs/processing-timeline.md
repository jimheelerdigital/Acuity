# Processing timeline — where do the seconds go?

Added 2026-10-17 for the Miro "Speed up processing" item. Every entry that
goes through `process-entry` now gets `Entry.processingTimeline`, a jsonb
array of `{ p, at }` marks appended from inside existing steps
(`apps/web/src/lib/processing-timeline.ts`). `Entry.createdAt` is the
implicit "queued" mark.

Phases (in order):

| mark | meaning |
|---|---|
| `transcribe_start` | pipeline picked the entry up; about to download audio + call Whisper |
| `transcribe_done` | transcript persisted (voice) |
| `transcript_provided` | typed / handwritten entry — no Whisper |
| `extract_start` | Claude extraction step began (after memory/calendar context steps) |
| `extract_done` | Claude returned |
| `persist_done` | tasks/goals/themes transaction committed (user sees results) |
| `finished` | last step ran (people, embed, memory, lifemap, streak, achievements, push) |

## Read it (Supabase SQL editor)

```sql
with m as (
  select e.id, e."createdAt", e."inputMode", e."audioDuration", length(e.transcript) tlen,
    (select (x->>'at')::bigint from jsonb_array_elements(e."processingTimeline") x where x->>'p'='transcribe_start' limit 1) t0,
    (select (x->>'at')::bigint from jsonb_array_elements(e."processingTimeline") x where x->>'p' in ('transcribe_done','transcript_provided') limit 1) t1,
    (select (x->>'at')::bigint from jsonb_array_elements(e."processingTimeline") x where x->>'p'='extract_start' limit 1) e0,
    (select (x->>'at')::bigint from jsonb_array_elements(e."processingTimeline") x where x->>'p'='extract_done' limit 1) e1,
    (select (x->>'at')::bigint from jsonb_array_elements(e."processingTimeline") x where x->>'p'='persist_done' limit 1) p1,
    (select (x->>'at')::bigint from jsonb_array_elements(e."processingTimeline") x where x->>'p'='finished' limit 1) f1
  from "Entry" e
  where e."processingTimeline" is not null and e."createdAt" > now() - interval '14 days'
), d as (
  select *,
    t0 - extract(epoch from "createdAt")*1000 as queue_ms,
    t1 - t0 as whisper_ms,
    e0 - t1 as pre_extract_ms,
    e1 - e0 as extract_ms,
    p1 - e1 as persist_ms,
    f1 - p1 as tail_ms,
    p1 - extract(epoch from "createdAt")*1000 as to_results_ms,
    f1 - extract(epoch from "createdAt")*1000 as total_ms
  from m
)
select count(*) n,
  round(percentile_cont(0.5) within group (order by queue_ms)) queue_p50,
  round(percentile_cont(0.5) within group (order by whisper_ms)) whisper_p50,
  round(percentile_cont(0.5) within group (order by pre_extract_ms)) pre_extract_p50,
  round(percentile_cont(0.5) within group (order by extract_ms)) extract_p50,
  round(percentile_cont(0.5) within group (order by persist_ms)) persist_p50,
  round(percentile_cont(0.5) within group (order by tail_ms)) tail_p50,
  round(percentile_cont(0.5) within group (order by to_results_ms)) to_results_p50,
  round(percentile_cont(0.9) within group (order by to_results_ms)) to_results_p90
from d;
```

`to_results_ms` is the number that matters to the user (createdAt →
persist_done: when the entry's tasks/summary exist). `total_ms` includes
the background tail nobody waits on.

Prior signal (client-side `v10_processing_latency`, onboarding only,
Oct 15–16): 15–41 s observed end to end, median audio 50 s, median
transcript 549 chars.

## Hypotheses to test once a week of data exists
1. Step-boundary overhead: ~22 `step.run` calls, each a fresh serverless
   invocation. If `pre_extract_ms` + `persist_ms` + `queue_ms` is a large
   share, merge the context steps (memory/calendar/dispositional) into one.
2. Claude extraction (`extract_ms`) dominates for long transcripts → prompt
   size / max_tokens / streaming-first-token UX.
3. Whisper (`whisper_ms`) scales with audio length; verbose_json adds cost.

## Baseline + first change (2026-10-23)

57 PRO entries (10/16–10/23), medians in seconds: queue 2.8, whisper 4.9,
pre_extract 11.2, extract 21.3, persist 5.8 → **to_results 46.7** (p90 69.1).
ClaudeCallLog `entry_extraction`, 83 calls: 19.3 s median (p90 35.2 s),
~2.7k tokens in, ~1.25k out.

Hypothesis 1 confirmed: pre_extract was step boundaries, not work.
Change: entitlement + context reads + cancel check + status flip + Claude
now run inside ONE step (`prepare-and-extract`); the pre-persist cancel
check runs inside `persist-extraction`. Re-run the query above a few days
after deploy and compare pre_extract_p50 and to_results_p50.

Next lever is Claude itself (~1.25k output tokens at ~65 tok/s): a smaller
output schema or a faster model. Both change output quality, so they are a
product call, not a refactor.
