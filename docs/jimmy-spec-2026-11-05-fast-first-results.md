# Spec: debrief results in 10 seconds (onboarding + every debrief): quick analysis first, deep analysis behind the scenes

**Requested by:** Keenan · **Written:** 2026-11-05 (bench results added same day) · **Owner:** Jimmy (build + review) · **Ships in:** the next app version (server part first, then the OTA/build for everyday debriefs) · **Go-live:** Monday 11-09 at the earliest (funnel-change rule)

**Status:** the quick analysis is already on `main` as `apps/web/src/lib/quick-debrief.ts`, benched on prod (section 2.6). It isn't wired into any live path yet. Start from it and apply the three prompt fixes in 2.2.1.

---

## 1. Why

The biggest drop in the in-app funnel is **Finished the recording → Saw their results**: about 24% of people who finish their first recording never see results.

Data (last 30 days, prod):

| | |
|---|---|
| Finished a recording (`v10_recording_completed`) | 105 |
| Analysis came back to the phone (`v10_processing_latency`) | 81 |
| Saw results (`v10_reveal_viewed`) | 79 |
| `v10_processing_failed` | 7 (mostly 1–5s recordings → 422 "too short or unclear") |
| `v10_processing_backgrounded` with no return | 3 (left at 6s, 15s, 23s) |

The wait, measured on the phone (`v10_processing_latency.ms`): **p50 20.7s, p90 40.9s**, max 9.7 min.

Where the time goes:

| Step | Time | Source |
|---|---|---|
| Upload + network | ~1–2s | Remainder |
| Whisper (`whisper-1`) | p50 ~1.7s, 4.7s on a 58s clip | Bench on 8 founder recordings, 11-05 |
| **`extractFromTranscript` (Sonnet 4.6, full prompt)** | **p50 17.8s, p90 28.3s** | `ClaudeCallLog` purpose `entry_extraction`, userId null, n=86 |

The full extraction writes about 1,100 output tokens (p50; 1,784 p90). The results screen (`apps/mobile/app/onboarding-new/_v10/reveal.tsx` → `normalize()`) reads only **`summary`, `pullQuote`, `themes` (string[]), `tasks[].title`**. We generate the whole debrief while she waits, and then show four fields.

## 2. What changes

```
TODAY
phone ── upload ──> /api/mobile/try-recording
                      whisper-1 (~1.7s)
                      extractFromTranscript, Sonnet 4.6 full (~18s)
                      TrySession.create(extractionData = full)
         <── { sessionToken, extraction, expiresAt } (~21s total)

NEW
phone ── upload ──> /api/mobile/try-recording
                      gpt-4o-mini-transcribe (~1.2s; whisper-1 fallback)
                      quickDebrief, Haiku 4.5 (2.4s p50, measured)
                      TrySession.create(extractionData = quick, _depth:"quick")
         <── { sessionToken, extraction, expiresAt } (target p50 < 8s)

claim (account created) ── /api/try-recording/claim
                      Entry.create from quick data (extracted = false)
                      inngest.send("entry/deep-extract", { entryId })
                        └─> full extractFromTranscript on Entry.transcript
                            persist mood/wins/blockers/goals/lifeAreas/…, extracted = true
                            KEEP the quick tasks (don't replace what she saw)
```

**Onboarding part: no app update needed.** (Everyday debriefs, 2.5, need an OTA.) The response shape is the same, and `normalize()` already handles every field the quick analysis returns. **No Prisma schema change**: the depth flag lives inside the `extractionData` JSON.

### 2.1 Transcription: switch to `gpt-4o-mini-transcribe`

Bench, 8 founder recordings (11–58s, m4a), 11-05:

| Model | Typical | Words vs Whisper |
|---|---|---|
| `whisper-1` (now) | ~1.7s | baseline |
| **`gpt-4o-mini-transcribe`** | **~1.2s** | **identical on 8/8** |
| `gpt-4o-transcribe` | ~1.3s | **truncated 2/8** (20 vs 47 words, 17 vs 75); **don't use** |

- Change: `transcribeAudio` in `apps/web/src/lib/pipeline.ts`. Add an optional model arg, or a separate `transcribeAudioFast`. Apply it **only on the try path** at first; signed-in entries stay on whisper-1 until this has soaked.
- On error or empty text, fall back to `whisper-1` once.
- Keep the Whisper non-speech filter (`lib/whisper-speech-filter.ts`). Confirm it still behaves with the new model's output: the 4o models lowercase the start and punctuate differently.
- Saves ~0.5s typical, ~2s on long clips. Small, but nearly free (and half the price).

### 2.2 Quick analysis (new)

**Already exists:** `quickDebrief(transcript, userId)` in `apps/web/src/lib/quick-debrief.ts` (ef6fdabd). Prompt `QUICK_DEBRIEF_SYSTEM`, parser `parseQuickDebrief`, returns `null` on failure, logs ClaudeCallLog purpose `quick_debrief`. Use it for both onboarding and everyday debriefs; apply 2.2.1 first.

- **Model:** `claude-haiku-4-5`. No thinking. `max_tokens` ~600.
- **Output (JSON only):**
  ```json
  {
    "summary": "2 sentences written to her (you), naming what's really going on",
    "pullQuote": "one short line Ripple noticed: a pattern or tension under what she said, not a recap",
    "themes": ["1–3 word theme"],
    "tasks": [{ "title": "a to-do she actually said" }]
  }
  ```
  `themes`: max 4. `tasks`: only ones she said; may be empty.
- **Voice/positioning:** follow `docs/acuity-positioning.md` and `lib/positioning.ts`. Warm and specific; never diagnose; no time-of-day; no duration claims. **Keenan should approve the final prompt wording** (it's customer-facing copy).
- **`pullQuote` is new value:** the full extraction never writes `pullQuote`, so today "Ripple noticed" always falls back to `resolveObservationFallback()` (a canned line per branch). The quick analysis fills it with a real line.
- **Keep the existing gates:**
  - `MIN_TRANSCRIPT_CHARS`: the 422 "too short" path stays.
  - `THEME_WORD_FLOOR`: suppress themes on thin transcripts. Reuse the same constant so the results screen and the Entry agree.
- **Validation:** parse; drop anything that isn't the right type; cap lengths.
  - If the call or parse fails: **fall back to the current full `extractFromTranscript`** (slow but correct). Never return an error just because the quick path failed.
- **Logging:** `ClaudeCallLog` purpose `quick_debrief` (already wired). Add a `safeLog` line with transcribe ms + analysis ms.
- **Store:** `TrySession.extractionData = { ...quick, _depth: "quick" }`. The full-path fallback writes `_depth: "full"`.

#### 2.2.1 Required prompt fixes (from the 11-05 bench, section 2.6)

1. **To-dos, completeness:**
   - List **every** to-do she said, however many; long debriefs are where it under-counts (647 words: 2 found vs 4). Raise `MAX_TASKS` from 6 to ~10.
   - Each to-do is one concrete action in her words.
2. **To-dos, no junk:**
   - Never write a to-do about the debrief itself ("Keep a list of this product insight").
   - Never write two versions of the same to-do ("Buy Christmas gifts for mother" + "Add mother's Christmas gifts to list").
   - Server-side: drop near-duplicates by normalized title.
3. **Thin debriefs:**
   - Under ~8 real words, or a known transcription glitch phrase, don't analyze. Return the existing "too short, say a bit more" path (422 in onboarding).
   - Seen in the bench: "Thanks for watching!". Check `lib/whisper-speech-filter.ts` for the other common silence phrases and share one list.
   - The bench had a debrief whose whole transcript was "Thanks for watching!"; the quick summary invented "You've just finished sharing something with someone".
4. **"Ripple noticed" (`pullQuote`):** return `null` when the debrief is thin (fewer than ~25 words). A filler line ("The debrief is too brief to understand…") is worse than the existing fallback.

Re-run the bench (2.6) on the same 30 after the fixes. Pass bar:
- To-do count within ±1 of the full analysis on ≥ 24/30.
- No meta or duplicate to-dos.
- Thin/glitch debriefs return the "too short" path.
- p90 still under 4s.

### 2.3 Deep analysis, behind the scenes, after the account is created

Run it **at claim, not at record time.**
- **Cheaper:** nobody who leaves before signing up costs anything extra.
- **Nobody waits:** after claim she's on the paywall.

Changes in `apps/web/src/app/api/try-recording/claim/route.ts`:
1. If `extractionData._depth === "quick"`, create the Entry from the quick fields (summary, themes, tasks). Leave mood/wins/blockers/goals empty and set **`extracted = false`**, `rawAnalysis = null`.
   - This is the same shape the FREE/Haiku branch already writes; `backfill-extractions.ts` documents it.
2. Create Task rows from the **quick** tasks (what she saw on the results screen). The deep pass may **add** to-dos the quick one missed (title match, see 2.5 step 5), never remove or rename hers.
3. `inngest.send({ name: "entry/deep-extract", data: { entryId, userId, keepTasks: true } })`.
4. If `_depth === "full"` (fallback path, or a TrySession from before the deploy), behave exactly as today.

New Inngest function (or reuse the per-entry step in `apps/web/src/inngest/functions/backfill-extractions.ts`, which already does "re-extract an entry that has a transcript, persist, embed, flip `extracted = true`"):
- Run full `extractFromTranscript(entry.transcript, …)` with the user's context.
- Persist everything except the quick tasks: with `keepTasks`, don't re-create them; only add genuinely new ones (normalized-title match). Optionally attach goal links to the existing ones.
- Idempotent: no-op if `extracted` is already true. Per-user concurrency 1. Retries are fine.
- Afterwards: anything process-entry normally kicks off for a first entry (memory, life map, embedding) should run. **Check what claim does today** so the first entry isn't missing anything that existing first-entry flows (insights unlock, day counts) depend on.

**Inngest:** a new function needs `curl -X PUT https://goripple.io/api/inngest` after deploy; deploys don't auto-sync.

### 2.4 Things that must not break

- **`/api/mobile/try-recording/result`** (recovery when the phone lost the request): same 200/202/410 contract. It reads `TrySession.extractionData`, which is now quick data. Fine, the shape is the same.
- **Web funnel:** if anything on web calls `/api/try-recording` (the non-mobile route), leave it on the full path for now.
- **Claim idempotency:** the existing double-claim guard (`claimed: false` conditional update) stays. The Inngest send goes after the guard, so a parallel claim can't send twice. The function's idempotency check is the backstop.
- **Typed debriefs** (mic-denied, `audioPath` null) go through the same quick path.

## 2.5 Everyday debriefs in the app (signed-in), same pattern

Keenan, 11-05: "we should have the initial debrief results within 10sec or less and then get more info from the transcript after the fact." This applies to **every debrief**, not just onboarding.

**Today:**
1. `apps/mobile/app/record.tsx` uploads, then `hooks/use-entry-polling.ts` polls `/api/entries/[id]` until status is `COMPLETE`/`PARTIAL`/`FAILED`, then `router.replace('/entry/[id]')`.
2. `inngest/functions/process-entry.ts`: transcribe → `prepare-and-extract` (full Sonnet extraction **with memory context**, ~18s p50 / ~29s p90; ClaudeCallLog `entry_extraction`, signed-in, n=194) → `persist-extraction` (sets COMPLETE) → habits, people, embedding, memory, life map, streak.

She waits on the record screen for transcription + the full extraction.

**New:**
1. **Transcribe** with `gpt-4o-mini-transcribe` (whisper-1 fallback), same as 2.1.
2. **New step `quick-extract`**, right after transcription, before `prepare-and-extract`:
   - Same `quickDebrief` (lib/quick-debrief.ts) as 2.2, so one prompt serves both paths.
   - Write `summary`, `themes`, and quick tasks to the Entry. **Leave status at `EXTRACTING`.**
   - Don't use `COMPLETE`: weekly report, insights, achievements and life-audit read `COMPLETE` to mean "fully analyzed".
3. **Polling (app):**
   - `use-entry-polling.ts` gets a new "quick ready" state: status is `EXTRACTING`/`PERSISTING` **and** `summary` is set.
   - `record.tsx` navigates to the entry on quick ready, the same way it does on complete.
   - **No schema change:** "summary set while not yet COMPLETE" is the signal.
   - Older app versions ignore it and keep waiting for COMPLETE, i.e. today's behavior, so this is safe to ship server-first.
4. **Entry screen (app):** `app/entry/[id].tsx` shows the summary, themes and to-dos right away. Mood, wins, blockers, reflection, goals and life areas show a soft "Ripple is still reading this…" placeholder. Keep polling until COMPLETE, then fill them in without moving what's already on screen.
5. **Full extraction** runs exactly as today, with one rule: **don't replace what she already saw.**
   - Keep the quick `summary` (write the deep one to `reflection`, or keep it in `rawAnalysis` only).
   - Tasks: add only ones that aren't already there (normalized-title match), never delete or duplicate the quick ones.
   - Signed-in to-dos go through the **extraction review** (`rawAnalysis.tasks` → `components/extraction-review.tsx` → `lib/commit-extraction.ts`, with the `commit-extraction-backstop` cron).
   - The quick to-dos show in review first. The deep pass appends its extra ones into `rawAnalysis.tasks` **before** she commits. If she has already committed, add them as new suggestions; don't silently create Task rows.
   - **Drop the `insights` field** from the full extraction prompt and output (field audit, 2.6): nothing on either entry screen reads it.
   - **Skip the deep pass on thin debriefs** (under ~8 real words): there's nothing to find.
6. **FREE users** already get a one-sentence Haiku summary and no extraction (`summarize-free`). They can use the quick step as their summary instead; the paywall rules stay the same.

**Target: results on screen in ≤ 10s for typical recordings.**
- Budget: upload ~1–2s + transcribe ~1–2s + Haiku ~2–4s + one poll interval. **Check the poll interval in `use-entry-polling.ts`;** at 2s+ it adds up to 2s on its own. Consider 1s while status is TRANSCRIBING/EXTRACTING.
- **Long recordings (3–5 min) will miss 10s:** transcription alone grows to ~5–10s. Fixing that needs transcribe-while-recording (phase 2 below). Measure the target on p50 and on recordings under 2 min.
- Add a timing event: `entry_quick_ready_ms` from the stop tap to navigation, plus server-side `ClaudeCallLog` purpose `entry_quick_extraction`.

**Needs an OTA** (polling + entry screen), unlike the onboarding part. The server part can ship first and do nothing visible until the app update lands.

## 2.6 Bench results (prod, 2026-11-05)

Ran `POST /api/admin/bench/quick-debrief` (admin or `Bearer CRON_SECRET`, read-only) on Keenan's last 30 debriefs (3–647 words, median 75). It compares the quick analysis with what the full analysis already saved on each entry. Full-analysis times come from the matching `entry_extraction` ClaudeCallLog rows (19 of 30 matched).

**Speed**

| | p50 | p90 | max | Output tokens (p50) |
|---|---|---|---|---|
| **Quick (`claude-haiku-4-5`)** | **2.4s** | **3.1s** | **3.2s** (on the 647-word one) | **163** |
| Full (`claude-sonnet-4-6`, today) | 18.4s | 28.5s | 33.0s | 1,148 |

- 30/30 quick replies parsed.
- Projected stop → results: upload ~1–2s + `gpt-4o-mini-transcribe` ~1–2s + quick ~2.4s ≈ **5–7s**.

**Quality**

| Field | Finding |
|---|---|
| Summary | **Better for the screen than today's.** Written to "you" and specific ("You're caught between wanting Ripple to work and feeling like it's draining money without payoff…"). Today's full summary reads like a report ("An average, reflective day… The user is questioning…"). |
| "Ripple noticed" (`pullQuote`) | Filled on 30/30; today it's never written. Strong on real debriefs ("You have a great life without it, so why does this one thing feel like it has to be the answer?"), filler on thin ones → fix 2.2.1 #4. |
| Themes | Similar: avg 2.8 quick vs 3.2 full. |
| To-dos | 54 quick vs 55 full in total; same count on 12/30. Misses some on long debriefs; occasionally invents a meta to-do or doubles one; sometimes catches ones the full pass missed ("Go to the store", "Recruit and onboard UGC creators"). → fixes 2.2.1 #1–2, plus the deep pass adding missed ones. |
| Thin / glitch | The "Thanks for watching!" transcript got an invented summary (the full pass also "analyzed" it). → fix 2.2.1 #3. |

**Field audit (which extraction fields anything reads)**
- 16 of 17 have a real reader: the entry screens, Home, mood chart, Theme Map, Life Matrix, weekly report, goals/habits.
- Only `insights` is effectively unused: no column, never on either entry screen, only the Obsidian export and the web post-record card. The mobile `entry.insights` read is dead code, because `/api/entries/[id]` never returns it.
- So the deep pass stays roughly full-size; drop `insights` and skip thin debriefs (2.5 step 5).

## 3. Optional phase 2 (app update / OTA, separate)

Not needed for the speed-up; lower priority.
1. **"Say a bit more" nudge:** don't allow stop under ~5s of speech, or nudge before submitting. Most `v10_processing_failed` rows are 1–5s recordings.
2. **Start uploading while she's still recording** (chunked/resumable), so the upload is done at stop. Saves ~1–2s. For everyday debriefs, also **transcribe chunks while she talks**, so long recordings hit 10s too.
3. OTA via `cd apps/mobile && npm run ota -- --message "…"`, never `eas update`.

## 4. Rollout

- **Ship in the next app version.**
  1. Server part first: onboarding needs nothing on the phone, and everyday debriefs keep today's behavior on old builds.
  2. Then the polling + entry-screen change (2.5 steps 3–4) in the next OTA/build.
  3. OTA with `cd apps/mobile && npm run ota -- --message "…"`, never `eas update`.
- Ship behind a server flag, e.g. `FAST_TRY_ANALYSIS=true` env or a RemoteConfig key. Flipping it back = today's behavior.
- Go live **Monday 11-09** (funnel-change rule). Keenan gives the push yes.
- No schema change → no `db:push`.

## 5. Test plan

- [ ] Unit: `parseQuickDebrief` parse/validate; fallback to full on throw or bad JSON.
- [ ] Unit: claim with `_depth: "quick"` → Entry `extracted=false`, tasks from quick, one Inngest event; with `_depth: "full"` → unchanged.
- [x] Bench on prod: done 11-05, 30 debriefs (section 2.6).
- [ ] Re-run the bench after the 2.2.1 fixes and check the pass bar.
- [ ] Device pass: fresh install → record 20s → results in < 8s → account → paywall → Home. 1 min later the first entry has mood/wins/goals and **the same to-dos** she saw.
- [ ] Airplane mode mid-processing → recovery route still returns the result.
- [ ] 3s recording → still the "too short" message.

## 6. Success measures (read the week after go-live, admin → App funnel)

| | Now | Target |
|---|---|---|
| Everyday debrief: stop → entry screen, p50 | ~20s+ (measure first) | ≤ 10s |
| Quick analysis alone, p90 (ClaudeCallLog `quick_debrief`) | 3.1s (bench) | < 4s |
| `v10_processing_latency` p50 | 20.7s | < 8s |
| `v10_processing_latency` p90 | 40.9s | < 15s |
| Saw results ÷ finished recording | ~76% | > 88% |
| Trials ÷ first question | 5.1% | Watch; small numbers, read over 2+ weeks |

## 7. Cost

| | Today | New |
|---|---|---|
| Per onboarding recording | ~$0.028 (Sonnet full ~$0.024 + Whisper ~$0.004) | ~$0.004 (Haiku ~$0.0015 + mini-transcribe ~$0.002) |
| + deep analysis | — | ~$0.024, **only for people who create an account** |
| Per month (~105 recordings) | ~$3 | ~$1–2 |

## 8. Open questions for Jimmy

1. Reuse `backfill-extractions`' per-entry step for `entry/deep-extract`, or write a small dedicated function?
2. Does anything read `Entry.extracted`/`rawAnalysis` within the first minute after claim (Home insights teaser, day count, welcome flow) that would show something wrong before deep extraction lands?
3. Move signed-in entries to `gpt-4o-mini-transcribe` too, after a week of soak?
4. Any reason the non-speech filter needs retuning for the 4o-mini output?
5. Everyday debriefs: does anything besides the entry screen react to `summary` appearing before COMPLETE (the "brief ready" banner, widgets, the Home list)?
6. Everyday debriefs: keep the deep `summary` out of the visible summary (2.5 step 5), or overwrite once she's left the screen?
