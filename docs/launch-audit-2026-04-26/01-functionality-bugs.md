# Functionality + bug hunt — 2026-04-26

## CRITICAL (will hit users on day 1)

- [ ] `/apps/web/src/lib/pipeline.ts:231` — **JSON.parse unguarded on Claude extraction response** — If Claude returns malformed JSON or truncates mid-object, `JSON.parse(jsonText)` throws an unhandled error. The caller (Inngest or sync path) catches it and marks the entry FAILED/PARTIAL, but the user sees "something went wrong" with no recovery path. Should wrap in try-catch and fall back to a graceful extraction shape with defaults.

- [ ] `/apps/web/src/app/api/record/route.ts:111-113` — **durationSeconds accepts negative and Infinity** — `Number(formData.get("durationSeconds"))` converts "−100" or "Infinity" without bounds checking. Entry.audioDuration persists invalid values. Should enforce `1 <= durationSeconds <= 3600`.

- [ ] `/apps/web/src/app/api/stripe/webhook/route.ts:33-36` — **Webhook signature error leaks raw Stripe SDK message** — Returns `{ error: "Webhook verification failed: <raw SDK message>" }`. Should return opaque `Invalid signature` to prevent attackers tuning forgeries off error text.

## HIGH (will hit users in first week)

- [ ] `/apps/web/src/app/api/weekly/route.ts:206` — **JSON.parse unguarded on weekly report Claude response** — Same as extraction: malformed JSON from Claude throws unhandled. Entry 225-234 catches it and marks FAILED, but 202-async path leaves report stuck in QUEUED forever if extraction step throws before the update. Weekly report generation should wrap extraction JSON parsing and emit a terminal FAILED status update on parse failure.

- [ ] `/apps/web/src/lib/pipeline.ts:603-609` — **Silent catch on entry FAILED update** — If the `await prisma.entry.update(...).catch(() => {})` fails (e.g., entry deleted mid-flight, pool exhaustion), the error is swallowed and the user's entry status is never set. Entry gets stuck in PROCESSING/EXTRACTING forever. Remove the catch and let Inngest retry the whole step.

- [ ] `/apps/web/src/app/api/entries/[id]/extraction/route.ts:204` — **groupIdByName.get() returns undefined if taskGroup missing** — When resolving task.groupName to a TaskGroup.id at line 218, `groupIdByName.get(t.groupName.trim().toLowerCase())` may return undefined. Line 228 falls back to `otherGroupId ?? null`, but if otherGroupId itself is null (no "Other" group seeded), tasks persist with `groupId: null`. Should either guarantee an "Other" group exists or explicitly handle null groupId.

- [ ] `/apps/mobile/app/entry/[id].tsx:195` — **Unchecked dereference of entry.transcript** — Line 195 renders `{entry.transcript}` unconditionally. While EntryDTO marks transcript non-nullable, if the API returns an entry with transcript=null or undefined (e.g., QUEUED/PROCESSING entries), React renders "null" as a string. Should check `entry.transcript &&` or provide a fallback "Transcribing…".

## MEDIUM (edge case but real)

- [ ] `/apps/web/src/app/api/entries/[id]/extraction/route.ts:224` — **Task title truncation at 300 chars silently drops user intent** — `title.trim().slice(0, 300)` truncates without warning. If the review UI showed the user's extracted task had 2000 chars and they committed it, they'd expect that text to persist; instead, a 300-char prefix gets saved. Consider 2000-char limit (matching description) or warn the user during review.

- [ ] `/apps/web/src/inngest/functions/process-entry.ts:149-152` — **NonRetriableError on short transcript but no grace period** — If Whisper returns <10 chars (valid silence, accidental pocket-recording), entry fails permanently. Users can't re-record or manually edit. Should allow one retry with a clearer error ("Please try again — no speech detected") before marking NonRetriable.

## LOW (theoretical or already-handled)

- [ ] `/apps/web/src/app/api/weekly/route.ts:71` — **Missing null check on entry.entryDate** — Line 72 queries `entryDate: { gte: weekAgo }` but entryDate is never populated in Entry table (schema uses createdAt). This is likely dead code; the weekly query should use createdAt instead. Low risk if confirmed unused, but creates silent logic error if a week's worth of entries get skipped from the report.

- [ ] `/apps/web/src/app/stripe/webhook/route.ts:122-135` — **updateMany can match zero users** — `where: { stripeCustomerId: customerId }` may match no rows if the Stripe customer ID is orphaned. Update succeeds silently with `{ modifiedCount: 0 }`, leaving the user's subscription status unchanged. Should log a warning when updateMany affects zero rows.

