# App Store Pricing + Availability — Acuity

**Target app:** iOS (`com.heelerdigital.acuity`)
**Drafted:** 2026-04-24
**Status:** Recommendation. Final call is Jim's + Keenan's.

**Companion docs:**
- `docs/APPLE_IAP_DECISION.md` — Option A vs B vs C breakdown; this doc aligns with the existing Option C recommendation.
- `docs/PRO_TIER_SPEC.md` — what's free vs gated post-trial.
- `docs/TIER_STRUCTURE.md` — feature-by-feature tier matrix.
- `docs/APP_STORE_METADATA.md` — earlier draft; this doc is the source of truth for pricing decisions.

---

## 1. TL;DR — the v1 recommendation

| Question | Answer |
|---|---|
| **App Store price** | **Free** — no paid download, no Apple IAP configured. |
| **Monetization model** | Freemium via web-based subscription. iOS app is a companion client that reads entitlements from the user's web account. |
| **Free tier (on device)** | 14-day trial with every feature unlocked. No card required. |
| **Paid tier** | $12.99/month OR $99/year (saves $56.88 vs monthly, ~36%). Already-verified pricing from `apps/web/src/app/upgrade/upgrade-plan-picker.tsx:14,102`. |
| **Post-trial behavior** | Soft conversion — entries, transcripts, and the Life Audit stay accessible. New recordings, Life Matrix refresh, and new weekly reports require Pro. |
| **Launch geography** | US + EN-speaking markets (US, CA, GB, AU, NZ, IE). Full global expansion after first 100 user learnings. |
| **Age rating** | 4+. |

**Rationale for Free + web subscription (not IAP):** this is the Option C path already settled in `docs/APPLE_IAP_DECISION.md`. One day of engineering work, no Apple 15–30% cut, compliant with App Store Review Guideline 3.1.3(b) Multiplatform Services. Revisit Option A (native IAP via RevenueCat) once PostHog attribution shows mobile-captured subs are a material share of revenue — concrete criteria in `APPLE_IAP_DECISION.md §5`.

---

## 2. Competitive landscape (reference prices, 2026-Q2)

Prices verified via competitor App Store listings 2026-04-24. "Trial" column is the on-device trial the App Store label shows; trial length can differ on web.

| App | Monthly | Annual | Effective annual $/mo | Trial | Model |
|---|---|---|---|---|---|
| Day One (Automattic) | $2.99 | $34.99 | $2.91 | 7 days | Native IAP, freemium |
| Rosebud (AI Journal) | $12.99 | $107.88 | $8.99 | 7 days | Native IAP, freemium |
| Stoic | $7.99 | $59.99 | $5.00 | 7 days | Native IAP, freemium |
| Reflectly | $8.99 | $49.99 | $4.17 | 7 days | Native IAP, freemium |
| How We Feel | Free | Free | — | — | Nonprofit, no paid tier |
| Finch (self-care) | $17.99 | $59.99 | $5.00 | 7 days | Native IAP, freemium |
| Morning Pages | $4.99 | $29.99 | $2.50 | — | Native IAP |
| Mindsera | $19.99 | $119.88 | $9.99 | 7 days | Native IAP + web |

**Where Acuity's $12.99/mo lands:**
- Same monthly price as Rosebud (the closest category competitor with AI extraction).
- Above Stoic and Reflectly; they have older product surfaces + no AI extraction.
- Below Finch and Mindsera; they sit in the "premium self-care" bucket.
- The $99/yr tier puts effective monthly at $8.25/mo — competitive with Rosebud annual ($8.99/mo effective) and undercuts Mindsera ($9.99/mo effective).

**Acuity's positioning:** highest-trust price in the AI-journaling segment. Not the cheapest (that's Day One with no AI), not the most expensive (that's Mindsera which overlaps with therapy-coach products). Matches where Maya would expect a premium but reasonable wellness app to sit — the "$9-$13 per month" mental zone.

### Trial length

Most competitors are 7 days. **Acuity ships 14 days.** The rationale is in the product itself: the weekly report (which is the hero conversion artifact per `Acuity_SalesCopy.md §7.2`) doesn't generate until the user has ~4 entries in the week, and the Life Audit arrives on Day 14. A 7-day trial forces the user to convert before they've seen the product's main output. 14 days lets them hold the Life Audit before they're asked to pay.

---

## 3. Why Free + web subscription beats native IAP (for v1)

Detailed analysis in `docs/APPLE_IAP_DECISION.md`. Summary:

### Against native IAP (Option A):
1. **Revenue tax.** Apple takes 15% (Small Business Program, under $1M ARR) — $1.95 off every $12.99 subscription. At 1,000 subs = $23,400/yr lost. Stripe fees are 2.9% + $0.30 = ~$0.68 per transaction.
2. **Build cost.** ~5–7 days of engineering (RevenueCat SDK, webhook handling, cross-platform identity, restore-purchases flow, sandbox testing) for an app that has zero mobile-captured subscription data yet to justify the investment.
3. **Ongoing ops.** Separate billing system to reconcile. Apple's sandbox StoreKit is flaky; webhooks drop silently a few times a year; reconciliation crons needed.
4. **Premature.** Mobile is a brand-new surface. We have no data that says mobile is a meaningful acquisition channel yet.

### For Free + web (Option C):
1. **Zero revenue tax.**
2. **Already built.** `apps/mobile/app/paywall.tsx` + the Safari redirect from Profile → Upgrade already works. Minor polish needed per `APPLE_IAP_DECISION.md §4`.
3. **Compliant under 3.1.3(b).** The iOS app shows no pricing, contains no "Subscribe" button, uses "Continue on web" / "Manage at getacuity.io" language. That's the exact framing Apple's guideline contemplates.
4. **Upgrade path is clean.** If mobile becomes a material acquisition channel, swap to Option A (RevenueCat + IAP) in a later build. No user migration needed — web subscriptions stay intact.

### Risk

Apple may still reject under 3.1.1. Defense framing is in `docs/APP_STORE_REVIEW_NOTES.md §3`. Backup plan (RevenueCat + IAP in a follow-up build) is scoped at 5–7 engineering days.

---

## 4. Age rating self-assessment (4+)

Apple's age rating questionnaire asks about 13 categories. Acuity's answers:

| Category | Acuity's answer | Reasoning |
|---|---|---|
| Cartoon or Fantasy Violence | None | No violence of any kind. |
| Realistic Violence | None | — |
| Sexual Content or Nudity | None | — |
| Profanity or Crude Humor | None (depends on user input — see note below) | The app transcribes what the user says. Acuity itself ships zero profanity. |
| Alcohol, Tobacco, or Drug Use or References | None | — |
| Mature or Suggestive Themes | None | — |
| Horror or Fear Themes | None | — |
| Medical or Treatment Information | None | Acuity is explicitly not a medical device (see Description §4 of listing doc). |
| Gambling or Contests | None | — |
| Unrestricted Web Access | None | No in-app browser; only Safari redirect via `Linking.openURL` to specific Acuity URLs. |
| Gambling Simulation | None | — |
| User-Generated Content | **No** (private content only) | User content is their own voice notes. Not shared, not visible to any other user, no social layer. Apple treats strictly-private user content as not triggering the UGC escalation. |
| Contests | None | — |

**Result: 4+.**

**The one edge case:** users might say profane words into their own voice journal. This is NOT UGC in Apple's sense — it's not published, not social, not visible to any other user. Treat the same way Apple treats Voice Memos, which is also 4+.

---

## 5. Availability (geography)

### Recommendation: launch in English-speaking markets only

| Country | Launch? | Reasoning |
|---|---|---|
| United States | **Yes** | Primary market. All marketing + Reddit research is US-centric. Stripe supports. |
| Canada | **Yes** | English-majority, similar demographics to US ICP. |
| United Kingdom | **Yes** | Stripe supports. Day One + Rosebud both do well there. |
| Australia | **Yes** | — |
| New Zealand | **Yes** | — |
| Ireland | **Yes** | — |
| All others | **Hold** | Wait for translation pass + local payment research before expanding. |

### Why not global day one:
1. **Whisper non-English accuracy varies.** English transcription is ~95%+ on common US accents; drops meaningfully on heavy non-native English accents and even more on Spanish/French/German/Japanese. Shipping into those markets without a localization and QA pass would create a first-impression problem we can't undo.
2. **Claude extraction is English-tuned.** Prompts are written in English and tested against English transcripts. Non-English transcripts produce lower-quality task/theme extraction.
3. **Stripe Tax compliance.** Different VAT regimes in EU, GST in India, etc. Stripe handles this but each market needs configuration + review.
4. **Apple marketing metadata is per-market.** Adding a market means translating the description + subtitle + keywords. Not in scope for v1.

### Expansion criteria:
- First 100 active users (not waitlist) in primary markets.
- Transcription accuracy monitored on actual user audio (falls out of `apps/web/src/lib/` analytics on confidence score per transcript).
- Localization budget confirmed.

### Rating by country:
Apple requires specific age ratings per country. "4+" is the US rating; EU / UK / AU equivalents will apply automatically if 4+ is selected in App Store Connect.

---

## 6. In-app purchase configuration

**For v1: none.** Do not configure any IAP SKU in App Store Connect.

Consequences of this choice:
- No "In-App Purchase" product list on the App Store page.
- No "Subscriptions" tab in the Profile section of the App Store listing.
- The App Store Connect questionnaire's "Does your app use IAP?" question gets a No.
- Reviewers see an app that's free-to-download with no purchase UI. That aligns with the 3.1.3(b) Multiplatform Services posture.

**If Apple rejects and requires IAP** (medium-risk per `APPLE_IAP_DECISION.md §5`), the fallback is:
1. Add RevenueCat SDK + configure a `pro_monthly` product at $12.99/mo and `pro_yearly` at $99/yr.
2. Match web pricing exactly — same $12.99/mo, same $99/yr.
3. Honor cross-platform entitlements so a web-subscribed user doesn't see the iOS IAP.
4. ~5-7 days of engineering, per the prior Option A estimate.

---

## 7. Pricing communication in the app (what NOT to show)

**Defensive move per 3.1.3(b):** the iOS app should show zero pricing text anywhere in the bundle. Grep-verified list of things that must NOT appear:

- ❌ `$12.99`, `$99`, `$12`, or any dollar sign pricing
- ❌ `/month`, `/year`, `/mo`, `/yr` tokens near a number
- ❌ "Subscribe", "Upgrade Now", "Buy", "Purchase"
- ❌ "Pro", "Premium", "Plus" as tier names inside the app (they're fine on `/upgrade` on the web; not in the iOS bundle)

**Safe language to use:**
- ✅ "Continue on web" (the Paywall CTA button)
- ✅ "Manage your subscription at getacuity.io" (the Profile row)
- ✅ "Your trial ends [date]" (no mention of what happens after)
- ✅ "Your subscription is active" / "Your subscription expired"

**Pre-submit grep:** before submit, run this from the repo root:
```bash
grep -rn "\$[0-9]\|12\.99\|99/mo\|/month\|Upgrade Now\|Subscribe\|Buy Now" apps/mobile/app apps/mobile/components
```
Should return zero matches. If any land, remove or rephrase before submit.

---

## 8. Decision checklist

- [ ] Confirm: launch price $12.99/mo + $99/yr. (Default. Keenan has copy that references these — see `apps/web/src/lib/drip-emails.ts:336–337`.)
- [ ] Confirm: 14-day trial, no card. (Default. Matches the Day 14 Life Audit anchor.)
- [ ] Confirm: free download on App Store; web-only subscription. (Option C per `APPLE_IAP_DECISION.md`.)
- [ ] Confirm: US + CA + GB + AU + NZ + IE for launch. Hold other markets.
- [ ] Confirm: 4+ age rating.
- [ ] Run the pre-submit grep from §7 — zero matches.
- [ ] Skip IAP configuration entirely in App Store Connect.
