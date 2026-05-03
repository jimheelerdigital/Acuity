# v1.1 Apple Reviewer Account — Credentials + Runbook

**Status:** Ready to seed when v1.1 review opens.

This account exercises the **FREE post-trial** experience — the most important behavioral change in v1.1 and the one Apple needs to verify against 3.1.3(b). The v1.0 reviewer account (`jim+applereview@heelerdigital.com`, PRO tier) remains valid for testing the active-Pro experience and stays seeded.

---

## Credentials

```
Email:    jim+applereview-v11@heelerdigital.com
Password: m6d&s9DWdVn%fLKU
```

Paste these into ASC under App Review Information → Sign-In Information when submitting v1.1.

The email is allowlisted in `apps/web/scripts/seed-v11-reviewer.ts`. The script refuses to run against any other address — typo-proof.

---

## Seed command

```bash
set -a && source apps/web/.env.local && set +a && \
  npx tsx apps/web/scripts/seed-v11-reviewer.ts \
    --email jim+applereview-v11@heelerdigital.com \
    --password 'm6d&s9DWdVn%fLKU'
```

Add `--force` to recreate (e.g., between submission rounds).

The seed creates:

- **User row**: `subscriptionStatus = "FREE"`, `trialEndsAt = 7 days ago`, no `stripeCustomerId`. This is the canonical post-trial-free state — the entitlement layer maps it to `canRecord=true`, `canExtractEntries=false`.
- **UserOnboarding** complete (no onboarding redirect on first sign-in).
- **8 Entry rows** spanning the prior 30 days, transcripts + summaries populated, mood/energy varied, themes attached. Status COMPLETE on all 8.
- **ThemeMention rows** so the locked Theme Map preview has data behind the blur.
- **6 LifeMapArea rows** (CAREER / HEALTH / RELATIONSHIPS / FINANCES / PERSONAL / OTHER) with realistic 0-10 scores so the locked Life Matrix preview shows a populated radar.
- **2 Goal rows** (one IN_PROGRESS, one NOT_STARTED) so the locked Goals preview has cards.
- **3 Task rows** (mix of OPEN / DONE) so the locked Tasks preview has rows.
- **1 WeeklyReport row** (most recent week, status=COMPLETE) so the locked Insights preview shows a header.

Crucially, the seed leaves the account fully on the FREE side — `freeRecordingsThisMonth = 0`, `backfillPromptDismissedAt = null`. The reviewer can:

- Record a new entry (it transcribes + saves; it does NOT extract themes, since `canExtractEntries=false`).
- See the post-record locked card explaining "Continue on web →".
- Tap into /home, /life-matrix, /goals, /tasks, /insights and see the FREE locked-state for each.
- Tap "Continue on web" — verify it opens Safari (NOT a WebView), URL `https://getacuity.io`, no in-app purchase prompt.
- Tap Profile → Delete account → confirm by typing the email → account removes (Guideline 5.1.1(v)).

---

## Verification checklist (run after seed, before pasting creds into ASC)

1. **Sign in via web** at https://getacuity.io/signin and confirm:
   - Dashboard shows the locked banner ("Process the entries you recorded on free?" — banner suppressed if you previously dismissed; for a fresh seed it should appear).
   - Recording works.
   - The 8 seeded entries are visible in /entries.

2. **Sign in via mobile (TestFlight v1.1)** with the same credentials and confirm:
   - The locked-state cards on the 6 surfaces above are present and contain "Continue on web".
   - The Calendar surface (Profile → Calendar) shows the FREE-tier locked card (NOT the trial-or-pro "Connect from iOS app" placeholder — those are both 3.1.3(b)-safe but distinct surfaces).
   - Recording works; the post-record entry detail surfaces a locked extraction card.
   - Tapping "Continue on web" on any surface opens Safari (verify via the system tab indicator at the top of the screen).

3. **Database check** (from a Supabase SQL editor or `apps/web/scripts/check-reviewer-state.ts` if present):
   ```sql
   SELECT
     "subscriptionStatus",
     "trialEndsAt",
     "stripeCustomerId",
     "freeRecordingsThisMonth"
   FROM "User"
   WHERE email = 'jim+applereview-v11@heelerdigital.com';
   ```
   Expected: `FREE`, `<now - 7 days>`, `NULL`, `0`.

4. **Free-cap flag check**: confirm `featureFlag.enabled = false` for `key = "free_recording_cap"`. Should be FALSE at submission. If it has been auto-flipped, the reviewer would still get a 3.1.3(b)-compliant experience but the reviewer's recording flow would surface the "30 of 30 — this one is on us" modal at recording 30 — which is unlikely given they'll record at most 1-2 test entries.

---

## What the seed deliberately omits

- **No `LifeAudit` row.** The Day-14 audit is locked behind `canExtractEntries`, and seeding a completed one for a FREE account would misrepresent the experience.
- **No `extracted = true` on any seeded Entry.** The 8 entries deliberately have `rawAnalysis = NULL` and `extracted = false`, mirroring entries the user would have recorded during their free recording loop. This is also what triggers the slice 5 backfill banner — letting the reviewer see + dismiss it as part of testing the upgrade affordance UX (even though they cannot upgrade in-app).
- **No `freeCapState` triggered.** Counter is 0; the cap UX is dormant unless the flag flips and they record 30 times.

---

## Cross-references

- Reviewer notes: `docs/v1-1/app-review-notes-v1-1.md`
- v1.0 baseline: `docs/APP_STORE_REVIEW_NOTES.md`
- Seed script: `apps/web/scripts/seed-v11-reviewer.ts`
- v1.0 reviewer pattern (basis for the v1.1 script): `scripts/seed-app-store-reviewer.ts`
