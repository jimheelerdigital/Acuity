# Calendar Integration — One-Page Summary

**Full doc:** `docs/v1-1/calendar-integration-scoping.md`

**Decisions locked 2026-05-01:** see "Decisions locked" section at bottom.

## What we're shipping (v1.1)

Two calendar features for PRO + TRIAL users:
1. **AI context** — read user's calendar at extraction time, prepend a `calendarBlock` to the V5 prompt so reflections can reference real meeting load.
2. **One-way task sync** — Acuity tasks with due dates push to user's calendar. `Acuity:` title prefix. Strikethrough on completion. Delete on task delete.

Sync direction: **Acuity → calendar only**. Calendar-side edits are ignored.

## Provider order

| Phase | When | Provider | Effort |
|---|---|---|---|
| **A** | v1.1 launch | iOS EventKit (proxies Google + Outlook + iCloud through OS) | ~9.5 dev-days |
| B | post-launch | Google Calendar OAuth (web) | ~2 weeks after A |
| C | later | Outlook (Microsoft Graph) | ~1 week after B |

Phase A is the smart pick — EventKit on iOS gives us all three calendar systems through the user's existing OS account integration, with **zero OAuth code, zero refresh-token plumbing, zero KMS** for v1.1.

## The 10 questions, answered

| # | Question | Answer |
|---|---|---|
| 1 | Permission model | iOS 17 `NSCalendarsFullAccessUsageDescription` (no read-only key exists). Web (Phase B): Google `calendar.events` scope (read+write). Pre-prompt screen before OS dialog. |
| 2 | Sync engine | Inngest fn `sync-task-to-calendar` triggered on Task mutations. `Task.calendarEventId` is the idempotency key. State machine: NOT_SYNCED → PENDING → SYNCED / FAILED. |
| 3 | Storage | Use case 1: query on-demand, **no event mirror**. Use case 2: store only `calendarEventId` per Task. No event content in our DB ever. |
| 4 | AI integration | New `calendarBlock` in `pipeline.ts:extractFromTranscript` alongside `memoryContext` / `goalBlock`. **No V5 prompt body change.** |
| 5 | UI surfaces | `Profile → Integrations` (mobile) / `/account/integrations` (web). Two toggles: `autoSendTasks` (default OFF for review) and `calendarAiContextEnabled` (default ON). Per-task badges. |
| 6 | Privacy | Calendar event content **never persisted DB-side**. Pulls only title/start/end/attendeeCount/isAllDay/calendarSource. Excludes location, notes, attendee emails. New consent surface required. |
| 7 | Apple review | EventKit + write access = higher scrutiny. Mitigations: specific purpose string (drafted), pre-prompt screen, default OFF for auto-send, App Review Notes documenting iOS 17 read-only-key constraint. |
| 8 | Schema | `User`: 7 new columns (provider, calendar id, toggles, defaults). `Task`: 5 new columns (calendarEventId + sync status). Existing `CalendarConnection` model unchanged. |
| 9 | Edge cases | Documented 10 in full doc. Highlights: change target calendar = migrate events. Disconnect = events orphan in calendar. Connect with 1000 existing tasks = one-time prompt, default Skip. |
| 10 | Effort | **~9.5 dev-days** Phase A end-to-end. Riskiest piece: where does EventKit write actually run (mobile-only execution = up to 24h sync latency for web-created tasks; recommend Option α). Second: iOS 17 full-access UX + reviewer scrutiny. |

## Decisions needing your sign-off before Phase 2

1. **Where does EventKit write run?** Recommend Option α (mobile-side execution; up to 24h sync latency for web-created tasks). Option β (push-driven) costs ~3 extra dev-days and meaningful infra.
2. **Default `autoSendTasks` value at connect.** Recommend OFF for first ~50 App Reviews (reviewer-friendly), flip to ON after track record. Acceptable to ship ON if you'd rather have higher activation and accept review risk.
3. **One-time post-connect "Send all 47 tasks?" prompt.** Recommend default Skip. Acceptable to default Send all if conversion data favors it.
4. **PRO+TRIAL gating** uses a new `canSyncCalendar` entitlement that has to match whatever shape the free-tier redesign settles on. **Sequencing rule:** calendar Phase 2 slice C1 waits for free-tier entitlement-shape decisions to merge.

## Overlap-clean check

- ✅ **Free-tier redesign:** sequenced — calendar slice C1 picks up free-tier's entitlement shape after merge. Phase 1 (this doc) doesn't touch `entitlements.ts` / `paywall.ts`.
- ✅ **Theme extraction (V5):** sequenced — calendar slice C2 waits for V5 100% rollout. `pipeline.ts` change is additive (`calendarBlock` next to existing context blocks); V5 prompt body untouched.

## Recommended slicing (Phase 2)

| Slice | What | Depends on |
|---|---|---|
| C1 | Schema + entitlement | free-tier entitlement shape merged |
| C2 | Use case 1 (read-only AI context) end-to-end | C1 + V5 at 100% |
| C3 | Use case 2 (task sync) | C1 |
| C4 | Settings UI polish + post-connect backfill prompt | C2, C3 |
| C5 | Apple Review submission | C2-C4 + privacy policy update |
| C6 | Flag ramp 10/25/50/100% | C5 reviewed + approved |

## Out of scope for v1.1

Outlook (Phase C), Google Calendar web (Phase B), two-way sync, calendar-derived Theme Map nodes, people-level enrichment, recurrence-rule analysis, real-time push from Google, iOS background fetch.

---

## Decisions locked (2026-05-01)

The four open decisions in this doc were resolved by Jim:

| # | Decision | Resolution |
|---|---|---|
| 1 | Where does EventKit write execute? | **Option α — mobile-side execution.** Web-created tasks queue with `calendarSyncStatus = PENDING` until the user's next mobile foreground; mobile flushes the queue then. Up to 24h propagation latency for users who don't open mobile daily. Web UI shows "open mobile to sync" hint when relevant. |
| 2 | Default `autoSendTasks` at connect | **OFF.** Opt-in at connect time. Reviewer-friendly default for first ~50 App Reviews. Revisit flipping to ON after a clean review track record. |
| 3 | Post-connect "Send all 47 existing tasks?" prompt default | **Skip.** Default is non-action; user must explicitly tap "Send all" to backfill. |
| 4 | `canSyncCalendar` entitlement shape | **Adopt free-tier redesign's convention** — wait for that work's entitlement-shape changes to merge, then add `canSyncCalendar` matching whatever pattern (flat boolean, tier-keyed map, etc.) it settled on. |

### Phase 2 sequencing — approved with blockers

- **C1 (entitlement wiring + schema migration)** waits on free-tier redesign's entitlement-shape decisions to merge.
- **C2 (calendar block in `pipeline.ts:extractFromTranscript`)** waits on **both** (a) V5 dispositional themes reaching 100% rollout under `v1_1_dispositional_themes`, AND (b) the production Anthropic 401 (diagnosed in the recent triage turn) being resolved. Until 401 is fixed, no extraction-pipeline change is testable end-to-end.
- C3-C6 follow from C1+C2 per the original slice plan in this doc.

Standing by for the blockers above to clear before any code in Phase 2 starts.
