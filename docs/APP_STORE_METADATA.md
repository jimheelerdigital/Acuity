# Acuity — App Store Connect Metadata

**Target app:** Acuity Daily — iOS
**Bundle ID:** `com.heelerdigital.acuity`
**App Store Connect ID:** `6762633410`
**Status as of 2026-04-20:** Metadata draft. Paste into App Store Connect when Jim submits; fields below fit Apple's character limits and submission flow.
**Companion docs:** `APP_STORE_PRIVACY_NUTRITION.md` (data-use questionnaire), `APPLE_IAP_DECISION.md` (Option C rationale), `iOS_LAUNCH_CHECKLIST.md` (the full submission runbook).

---

## 1. App Information

| Field | Value | Char count |
|---|---|---|
| **App Name** | `Acuity Daily` | 12 / 30 |
| **Subtitle** | `Voice journaling that sees you` | 30 / 30 |
| **Primary Category** | Health & Fitness | — |
| **Secondary Category** | Productivity | — |
| **Age Rating** | 4+ | — |
| **Pricing tier** | Free (subscription via web — see §5 Review Risk) | — |
| **Contains ads** | No | — |

### Promotional text (updateable without resubmission — 170 char max)

> Your nightly brain dump, listened to. Sixty seconds of talking. We pull out your tasks, track your mood, and write you a weekly report about the patterns you can't see.

*(169 chars — one under the cap)*

### Description (4000 char max, shown with line breaks preserved)

```
Acuity turns a sixty-second voice brain dump into the patterns hiding in your own life.

WHAT IT DOES
Talk for a minute each night about whatever's on your mind — your day, your worries, the thing you can't stop chewing on. Acuity transcribes what you said, pulls out the tasks you mentioned, scores your mood, tracks your goals, and watches for the themes that keep coming back.

On Day 14 you get a Life Audit — a long-form letter written from your own words about what showed up across the two weeks. On Sunday of every week you get a Weekly Report: a short read about what the pattern looks like right now.

WHO IT'S FOR
People who find journaling-by-writing too slow and therapy-only too infrequent. Founders tracking their own bandwidth. Shift workers who want a record of which weeks land hard. Anyone who's been told "you should journal" and never stuck with it.

HOW IT WORKS
1. Open the app at night. Hit record.
2. Talk. Up to two minutes. No structure, no prompt.
3. Watch your dashboard build itself. Tasks, themes, mood scores, goals — lifted from your own words.
4. Come back the next night. Add another minute.

Your six Life Areas — Career, Health, Relationships, Finances, Personal, Other — get scored over time so you can see what's lit up and what's been quiet. Weekly reports pull the common thread.

WHAT YOUR DATA DOES
Nothing is sold. Nothing trains AI models. Recordings are transcribed and deleted from our servers; transcripts and extracted signals stay in your account until you delete them. One-tap account deletion is available from Profile → Delete account; it removes everything and cancels your subscription.

WHAT IT DOESN'T DO
Acuity is not therapy. It's a record of your own observations, structured so patterns become visible. If you're in crisis, call 988 (US) or visit findahelpline.com.

FREE TRIAL + WHAT HAPPENS AFTER
Fourteen days free, no credit card. At the end you keep every entry, transcript, insight, and the Life Audit we generated. Continuing to record, refresh your Life Matrix, or generate new weekly reports requires a Pro subscription — managed through your Acuity account on the web.
```

*Character count: ~2,200 / 4,000. Room to expand if needed.*

### Keywords (100 char total, comma-separated, NO spaces)

```
journal,voice,memo,mood,tracking,therapy,mental,health,brain,dump,debrief,habit,mindful,wellness
```

*Count: 99 / 100. Drop one if Apple complains.*

### What's New in This Version

For the first submission, a brief changelog:

> First release of Acuity Daily on iOS. Record your nightly voice brain dump, let the app extract what matters, watch the pattern of your weeks come into focus.

---

## 2. URLs

| Field | Value |
|---|---|
| **Support URL** | `https://www.getacuity.io/support` |
| **Marketing URL** | `https://www.getacuity.io` |
| **Privacy Policy URL** | `https://www.getacuity.io/privacy` |

All three are live and indexable. Confirmed 2026-04-20 post-support-page-refresh.

---

## 3. App Review Information

### Reviewer notes

> Acuity Daily is a voice-journaling app. The user records a short voice note each night; the app transcribes it and extracts tasks, mood, and themes. Subscription is 14-day free trial then paid monthly, **managed entirely on the web at getacuity.io/upgrade — not through Apple IAP**. The mobile app is a companion that makes the same Acuity account accessible on the phone; it does not sell digital goods directly. See §5 below re: guideline 3.1.3(b) Multiplatform Services, which is the applicable carve-out.
>
> The app requires sign-in via Google OAuth. For review, please use the demo account below — it has two weeks of seeded entries and an active Pro subscription so the reviewer can see every screen including the post-trial state and the Life Audit.

### Demo account

| Field | Value |
|---|---|
| Email | **TO FILL** — Jim seeds via `npm run test-user:seed --email reviewer@test.getacuity.io --with-entries 14 --subscription-status PRO --with-onboarding-complete` before submission |
| Sign-in method | Google OAuth (Jim creates a Google account tied to this email ahead of review) |

### Contact information

| Field | Value |
|---|---|
| First name | Jim |
| Last name | Cunningham |
| Phone | **TO FILL** — Jim adds before submit |
| Email | `jim@heelerdigital.com` |

---

## 4. Build & Submission

| Field | Value |
|---|---|
| **Build uploaded via** | `eas submit --platform ios --latest` (per `iOS_LAUNCH_CHECKLIST.md`) |
| **Export compliance** | `ITSAppUsesNonExemptEncryption: false` — declared in `app.json`. Acuity uses HTTPS + standard iOS crypto only. |
| **Content rights** | All content is user-generated by the signed-in user. No third-party licensed content. |
| **Advertising identifier** | No. App does not use IDFA. |

---

## 5. Review Risk — Apple Guideline 3.1.3 Multiplatform Services

**This section flags the non-trivial submission risk: our subscription is NOT sold via Apple IAP. Apple may push back. Strategy + framing below.**

### The applicable guideline

**App Store Review Guideline 3.1.3(b) — Multiplatform Services:**

> Apps that operate across multiple platforms may allow users to access content, subscriptions, or features they have acquired in your app on other platforms or your website, including consumable items in multi-platform games, provided those items are also available as in-app purchases within the app. You must not directly or indirectly target iOS users to use a purchasing method other than in-app purchase, and your general communications about other purchasing methods must not discourage use of in-app purchase.

**Key phrase: "Multiplatform Services."** Acuity is a cross-platform service — we have a web app that predates the iOS app, subscriptions have always been web-first, and the iOS app is a companion surface. That's the posture Apple expects for apps using this carve-out (Netflix, Spotify, Dropbox, Kindle, Notion, etc. all operate this way).

### What we do and don't do inside the iOS app

✅ **Safe (compliant with 3.1.3(b)):**

- Users sign in with an existing Acuity account.
- Users who lack a subscription can open a link to `getacuity.io/upgrade` in Safari via SFSafariViewController (not an in-app WebView — ASWebAuthenticationSession / SFSafariViewController is what Apple explicitly permits for this pattern).
- The paywall screen in the app says **"Continue on web"** and **"Subscriptions are managed through your Acuity web account. Manage or cancel any time at getacuity.io"** — factual statements about where management happens, not purchase-steering language.

❌ **Not in the app (deliberately):**

- No in-app purchase button that bypasses IAP and takes payment directly.
- No pricing shown inside the app at all. Pricing lives on the web upgrade page.
- No "skip Apple's fees" or "cheaper on web" framing. That's the exact language 3.1.3 prohibits.
- No "buy now" buttons pointing at our web checkout.

### The specific risk

Apple sometimes interprets 3.1.3(b) narrowly and requires apps that unlock paid features to use IAP regardless of web-first posture. Known precedents:

- **Apps Apple has approved under 3.1.3(b):** Netflix, Spotify, Kindle, Dropbox, Notion, Basecamp (famously — 2020 DHH / Hey dispute resolved in favor of the app).
- **Apps Apple has forced onto IAP:** some smaller productivity/health apps have been required to add IAP after initial rejection. Decisions are not fully consistent.

### Our strongest defense framing

If review pushes back, the response is:

> Acuity is a multiplatform service. Subscriptions are sold through our web app at getacuity.io — which predates the iOS app — and the iOS app is a companion client. Per App Store Review Guideline 3.1.3(b), users with existing subscriptions can access their account on iOS. The app contains no purchase UI, displays no pricing, and makes no reference to cost or discounts; the "Continue on web" affordance informs users where account management happens, which is the factual, non-steering language contemplated by the guideline.

**Backup plan if Apple still rejects:** implement IAP via RevenueCat (see `APPLE_IAP_DECISION.md` Option A). Estimated two weeks of work. Triggers the 15-30% Apple cut. Bad outcome but not catastrophic.

### Defensive moves before submission

- [ ] Verify NO pricing text anywhere in the bundled JS — grep the mobile bundle for "12.99", "$", "month", "year", etc.
- [ ] Verify the paywall screen copy matches what's documented in §5 "Safe" above.
- [ ] Confirm the App Store description makes it explicit that subscriptions are web-based (see §1 description draft above — the "FREE TRIAL + WHAT HAPPENS AFTER" paragraph does this).
- [ ] Reviewer notes (§3) explicitly call out the web-based subscription model so review flags it for the right rubric from the start.

---

## 6. Localization

English (US) only for first release. Add a localization pass in Phase 2 once we have user-language signal from the DB.

---

## 7. After Submission

- Monitor App Store Connect inbox + Jim's email for reviewer questions. Respond within 24 hours.
- If Apple rejects on 3.1.3 grounds, reply with the framing in §5. Escalate to App Review Board if needed.
- If Apple rejects on any other ground, fix the issue, resubmit, note the delta in the next "What's New".
