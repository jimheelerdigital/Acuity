# Play Console — Content rating answers (IARC questionnaire)

**Field name in Play Console:** App content → Content ratings → Start questionnaire
**Issued by:** IARC (International Age Rating Coalition) on Play's behalf
**Drafted:** 2026-06-03
**Status:** Walk-through checklist with recommended answers. Expected outcome: **ESRB Everyone (E)**, **PEGI 3**, **USK 0**, **ACB G**, **GRAC All**. Equivalent to Apple App Store 4+.

---

## Posture

Acuity is a private voice-journaling app with no social layer, no public content, no purchase UI shown in-app, no gambling, no violence, no nudity, and no profanity in any first-party copy. The IARC questionnaire is conservative — any "Yes" answer typically bumps the rating. Every "Yes" below has a defense; every "No" is unambiguous.

The questionnaire is delivered as a wizard that asks about ~30 specific content categories. The Play Console UI mirrors the IARC global questionnaire structure. Walk through every step and pick the answer below.

---

## Step 1 — Category selection

> Which category best describes your app?

**Answer: Lifestyle**

Lifestyle is the closest fit for a self-reflection / wellness-adjacent tool with no game mechanics. (Other plausible: Health & Fitness. Lifestyle is broader and reflects the brain-dump framing better than the medical framing of Health.)

---

## Step 2 — Violence

> Does your app contain any references to violence?

**Answer: No**

> Does your app contain any depictions of injury or death?

**Answer: No**

> Does your app contain any references to weapons?

**Answer: No**

**Defense:** No first-party copy contains violent imagery or language. User-generated voice content could theoretically contain it, but the same User Content carve-out applies — see IARC's "user-generated content" question at the end (Step 11).

---

## Step 3 — Sexuality

> Does your app contain any references to sex or nudity?

**Answer: No**

> Does your app contain any sexual themes?

**Answer: No**

**Defense:** Zero sexual content in any first-party copy or asset.

---

## Step 4 — Language

> Does your app contain any references to crude humor, profanity, or coarse language?

**Answer: No**

**Defense:** The app's copy is reviewed against `docs/Acuity_SalesCopy.md` which has banned-words and tone rules. No profanity. The "brain dump" phrase is the strongest casual word and is well within Everyone-rating norms.

---

## Step 5 — Controlled substances

> Does your app contain references to alcohol, tobacco, or drugs?

**Answer: No**

**Defense:** No first-party copy mentions alcohol, tobacco, or drugs in a promotional way. The crisis-line disclaimer ("not therapy ... call 988") references mental-health support, not substance use.

---

## Step 6 — Gambling

> Does your app contain any gambling content or activity?

**Answer: No**

> Does your app simulate gambling?

**Answer: No**

> Does your app provide odds or strategies for gambling?

**Answer: No**

**Defense:** No gambling mechanics, simulation, or content of any kind. Subscription pricing is fixed; there's no chance / wager / win mechanic anywhere.

---

## Step 7 — Fear / horror

> Does your app contain content that may be frightening or disturbing?

**Answer: No**

**Defense:** Tone of the app is calm, reflective, accountability-voice. No horror imagery or copy.

---

## Step 8 — Crude humor

> Does your app contain potty humor or other crude content?

**Answer: No**

---

## Step 9 — Discrimination / hate

> Does your app contain references to discrimination, hate, or prejudice?

**Answer: No**

**Defense:** No first-party content references discrimination or hate. User-generated content carve-out applies if a user discusses these topics in their voice entries.

---

## Step 10 — Miscellaneous content

> Does your app reference real-world issues or controversial topics?

**Answer: No**

> Does your app include simulated gambling?

(Duplicate of Step 6; answer **No**.)

> Does your app include any content that the developer would rate as mature (18+)?

**Answer: No**

---

## Step 11 — User-generated content + interactivity

This is the **most likely "Yes" question** — read carefully.

> Does the app allow users to interact with each other (e.g., chat, messaging, voice calls)?

**Answer: No**

**Defense:** Acuity has no chat, messaging, voice-call, comment, or any user-to-user feature. Each user's voice journal is private to that user. There is no public profile, no follow / friend mechanic, no shared timeline. The audio + transcripts are visible only to the signed-in account.

> Does the app share user-generated content with other users or the public?

**Answer: No**

**Defense:** Same — content is private to the user's account.

> Does the app share users' precise location with other users?

**Answer: No**

> Does the app allow users to make in-app purchases?

**Answer: No (in the Android app)**

**Defense:** v1.3 ships with NO Play Billing integration. The web has Stripe-based subscription. The mobile app shows no pricing and no purchase UI. If Play Console asks specifically about "external purchases referenced in-app," the answer remains No — the v1.3 paywall screen says "Continue on web" without listing prices, matching the iOS Guideline 3.1.3(b) Multiplatform Services posture (see `docs/APP_STORE_REVIEW_NOTES.md` §5).

> Does the app share users' personal information with third parties for marketing or advertising?

**Answer: No**

**Defense:** Audio is shared with OpenAI (for transcription) and transcripts are shared with Anthropic (for extraction) under API-tier contracts that explicitly prohibit training on the data. Neither is a marketing/advertising disclosure. PostHog receives sanitized usage events for analytics (sha256-hashed email prefix; no transcripts, no audio). No ad networks fire from the mobile app.

---

## Step 12 — Other questions Play may insert

Play occasionally surfaces optional follow-ups based on app category:

> Does your app collect health-related personal information?

**Answer: Yes** — see `data-safety-form.md` §2.7 (transcripts may contain user-volunteered health content). Note: this is the data-collection question, distinct from the content-rating question about "mature themes." A Yes here does NOT bump the content rating.

> Does your app include content related to suicide, self-harm, or related sensitive topics?

**Answer: Yes — but only as crisis support content.**

**Defense:** The full description includes the line "If you're in crisis, call or text 988 in the US, or visit findahelpline.com for global resources." This is mental-health resource information, not depicted self-harm. Conservative Yes here ensures Play knows the listing has this disclaimer; should NOT bump the rating because the framing is supportive/preventive, not exploitative.

---

## Expected outcome

Based on all-No answers (except the two declared Yes for honesty in Step 12), IARC will likely issue:

| Region | Expected rating |
|---|---|
| ESRB (US/Canada) | **E (Everyone)** |
| PEGI (Europe) | **PEGI 3** |
| USK (Germany) | **USK 0** |
| ACB (Australia) | **G (General)** |
| GRAC (South Korea) | **All ages** |
| ClassInd (Brazil) | **Livre (Free for all ages)** |

If IARC issues a higher rating in any region (rare for Lifestyle apps with all-No answers), check the rating-detail page for the triggering question, re-read the Defense above, and submit a re-rating request via Play Console support.

---

## Pre-submit checklist

- [ ] Walk Steps 1–11 above and confirm answers match.
- [ ] Where Step 12 surfaces optional follow-ups, use the answers in this doc.
- [ ] Submit the IARC questionnaire — it generates the rating immediately.
- [ ] Verify the rating displayed in Play Console matches the table above. If anything is higher, re-check the triggering question.
- [ ] The rating must be assigned BEFORE the app can be published to any production track. It can stay in Internal Testing without a rating, but the first promotion needs one in place.
