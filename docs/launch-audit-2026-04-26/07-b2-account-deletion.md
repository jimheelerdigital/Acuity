# B2 — In-app account deletion (mobile)

**Status:** spec only — not implemented yet.
**Owner:** Jim (mobile review) | Claude (code, when given the go-ahead)
**Estimate:** 4–6 hours, mostly UI + confirmation flow + device testing. Backend already exists.

## Why this is mandatory

Apple Guideline **5.1.1(v)**: apps that support account creation MUST also let users initiate account deletion *from within the app itself*, not by sending the user to a website. Mandatory since June 2022. We currently have web-only delete (`POST /api/user/delete`) — mobile Profile tab has only Sign out, Manage plan, Reminders, Apple Health, and Theme.

## What already exists (don't rebuild)

The backend is **already complete**:

- `POST /api/user/delete` (`apps/web/src/app/api/user/delete/route.ts`) — auth-gated (NextAuth or mobile bearer), rate-limited 3/day per user, requires `confirmEmail` body matching the session email exactly.
- Writes a `DeletedUser` tombstone with `originalCreatedAt` + `originalTrialEndedAt` so the trial-reset protection logic in `bootstrapNewUser` recognizes returning users.
- Cancels the Stripe customer (best-effort, logged on failure).
- Deletes `VerificationToken` rows (NextAuth-managed, not FK-cascaded).
- Deletes the `User` row inside a transaction — Prisma schema's `onDelete: Cascade` cleans up `Account`, `Session`, `Entry`, `Task`, `Goal`, `WeeklyReport`, `LifeMapArea`, `UserMemory`, `LifeAudit`, `UserOnboarding`, `UserDemographics`, `UserInsight`, `Theme`, `ThemeMention`, etc.
- Lists + removes every Supabase Storage object under `voice-entries/${userId}/`.
- Returns `200 { deleted: true }`.

So **B2 is purely the mobile UI + confirmation modal + post-delete navigation** — zero backend work.

---

## File-by-file changes

### Mobile (`apps/mobile/`)

**Edit: `apps/mobile/app/(tabs)/profile.tsx`**

Add a **Delete account** menu item below "Sign out", styled destructively (red text + trash icon). On tap → opens a custom Confirm modal (not the iOS native `Alert.alert` — we need a typed confirmation field that `Alert.prompt` doesn't support cleanly).

**New file: `apps/mobile/components/delete-account-modal.tsx`**
- Fullscreen modal, dark theme, four-step UX:
  1. **Warning** — "Delete account?" + bullet list of what gets removed (entries, recordings, reports, themes, life matrix history). Subtle but explicit: "This can't be undone."
  2. **Subscription warning** — only shown if `user.subscriptionStatus === "PRO"`: "You have an active subscription. Deleting will cancel it immediately. You won't be billed again."
  3. **Type-to-confirm** — text input asking the user to type their email address verbatim. Submit button disabled until input matches `user.email` exactly (case-insensitive).
  4. **Final tap** — destructive red "Delete my account" button → calls `api.post("/api/user/delete", { confirmEmail: user.email })`.
- Loading state during the network call (disable backdrop close, show spinner on button).
- Error state — surface the server's error (e.g., "Confirmation email does not match", rate-limit 429).
- On success — clear local secure-store tokens, sign out via `auth-context`, navigate to `/(auth)/sign-in` with a one-time toast: "Your account has been deleted."

**Edit: `apps/mobile/contexts/auth-context.tsx`**
- Add `deleteAccount(): Promise<{ ok: true } | { ok: false; error: string }>` to the context.
- Implementation: calls `api.post("/api/user/delete", { confirmEmail: user.email })`, on success calls existing `signOut()` to wipe `expo-secure-store` + cached user state.
- No new endpoint, just a typed wrapper around the existing one.

**Edit: `apps/mobile/lib/api.ts`** (only if the existing `api.post` doesn't surface 4xx body for error display)
- Verify the `api.post` helper returns `{ error, retryAfter? }` body on 429 so the modal can show "You've requested too many deletions today, try again tomorrow."

### Web (`apps/web/`)

No changes. The route already accepts mobile bearer auth via `getAnySessionUserId(req)` in the existing `getServerSession` + bearer-token shim. Mobile call lands on the same handler.

### Schema

No changes. `DeletedUser` already exists.

---

## New dependencies

**None.** Modal uses RN primitives + existing `react-native-reanimated` (for the slide-up). No new packages.

---

## Native config changes

**None.** No entitlements, no Info.plist keys, no app.json changes.

---

## Backend changes

**None.** The endpoint, rate limiter, tombstone logic, Storage cleanup, Stripe cancellation, and cascade deletes all exist and have been tested via the web flow.

One small audit-only verification:
- **Confirm `getAnySessionUserId` in `apps/web/src/lib/mobile-auth.ts` honors the mobile bearer token from a NextAuth-encoded JWT.** Already does (verified by every other mobile route working). Just sanity-check.

---

## Apple Developer portal setup

**None.** Apple's account-deletion requirement is purely an in-app UX requirement; no entitlement, no portal toggle. Reviewer will manually test by tapping through Profile → Delete account → confirm → verify the user's account no longer signs in.

What you DO need to do is:

- **Update `docs/APP_STORE_REVIEW_NOTES.md`** to call out the in-app deletion path explicitly: "Delete account: Profile → Delete account → type your email to confirm." Reviewers won't dig for it.

---

## Testing plan

| # | Test | Expected |
|---|---|---|
| 1 | Free user taps Delete → types correct email → confirm | Modal closes, user lands on sign-in screen, attempting to sign in with same email starts a fresh trial (3-day reduced if within 90d) |
| 2 | Free user taps Delete → types wrong email | Confirm button stays disabled |
| 3 | PRO user sees the "active subscription will cancel" warning | Stripe customer is canceled per `/api/user/delete` logic |
| 4 | User taps Delete → confirm → server returns 429 (rate-limit) | Modal shows the error, leaves the user signed in |
| 5 | User taps Delete → confirm → server returns 500 | Modal shows generic "couldn't delete, contact support" |
| 6 | User taps Delete → confirms → backgrounds the app mid-delete | Server completes regardless; user can re-sign-in but tokens are stale → signOut path runs cleanly |
| 7 | After delete, Sentry / PostHog stop seeing events from this user | Verify in Sentry + PostHog dashboards |
| 8 | After delete, Supabase Storage `voice-entries/${userId}/` is empty | Direct verification via Supabase dashboard |
| 9 | After delete, ALL related rows are gone (Entry, Task, Goal, etc.) | `SELECT COUNT(*) FROM "Entry" WHERE "userId" = '...'` returns 0 |
| 10 | Same email re-signs up → `trialDaysForEmail()` returns 3 (reduced) within 90d | Verify via PostHog `trial_started` event payload |
| 11 | Reviewer (Apple QA account) can delete their account end-to-end | TestFlight build, pre-flight on actual reviewer Gmail account |

**Note on test #6:** the modal must remain mounted during the `await api.post(...)` call. If the user backgrounds the app, RN may pause JS execution. Handle by treating the network call as fire-and-forget and trusting the server to complete. The modal closes optimistically once the request is *sent* (with a "Deletion in progress…" message before the response), then if the response comes back with an error, surface a one-time toast.

Actually, **don't** do optimistic close — the user might think it failed and stay signed in. Keep the spinner and let the modal block on the response. Then close + sign out on success.

---

## Estimated time breakdown

| Task | Time |
|---|---|
| `delete-account-modal.tsx` component (4-step flow + states) | 2 hr |
| `auth-context.tsx` `deleteAccount()` wrapper | 30 min |
| `profile.tsx` menu item + open modal | 30 min |
| Update `docs/APP_STORE_REVIEW_NOTES.md` for reviewer instructions | 10 min |
| EAS dev build + TestFlight push | 30 min |
| Manual device testing (11 cases) | 1.5 hr |
| Bug-fix iteration | 1 hr |
| **Total** | **~6 hr** |

---

## Risks / unknowns

- **Race against Stripe customer cancellation.** The route currently does `stripe.customers.del()` synchronously before the DB transaction; if Stripe's API is slow (rare but happens), the user sees a long spinner. Acceptable — the current web flow has the same shape and no one has complained. If we want to harden, we could move the Stripe call to a fire-and-forget Inngest event after the DB delete commits.
- **Mobile deep-link to delete from email.** Out of scope — not building "delete via email link" since Apple's requirement is "from inside the app."
- **No grace period.** Some apps offer a 30-day "you can recover your account" window. We don't. Acceptable per Apple's guideline (deletion can be immediate). If product wants this later, the existing `DeletedUser` tombstone is the foundation.
- **Storage cleanup is best-effort.** If Supabase Storage list/remove fails partway, audio files orphan but the User row is gone. Existing logged-and-proceed behavior is fine — privacy obligation (delete personal data) is met by deleting the User row + the FK-cascaded Entry rows that point at the audio paths. Orphan audio in Storage is an ops debt, not a privacy violation.

---

## What you'll see in the App Store review

Apple's reviewer will:
1. Sign in with the demo account (`acuity.reviewer.b19@gmail.com`).
2. Navigate to Profile.
3. Tap **Delete account**.
4. See the warning + type-to-confirm screen.
5. Confirm.
6. Get signed out, land on sign-in screen.
7. Try to sign in again — should land on a fresh sign-up flow with a reduced trial.

If any of those steps fail, Apple rejects with a 5.1.1(v) note. The implementation above covers all 7 steps.
