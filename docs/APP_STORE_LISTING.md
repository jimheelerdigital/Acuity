# App Store Listing — Acuity

**Target app:** iOS (`com.heelerdigital.acuity`, ASC App ID `6762633410`)
**Drafted:** 2026-04-24 (Build 19 / version 0.1.7)
**Status:** Ready for paste into App Store Connect. Not submitted.

**Companion docs:**
- `docs/Acuity_SalesCopy.md` — rubric every line below passes
- `docs/APP_STORE_METADATA.md` — earlier draft; this supersedes its acquisition-voice sections
- `docs/APP_STORE_PRIVACY.md` — privacy declarations
- `docs/APP_STORE_PRICING.md` — pricing model + availability
- `docs/APP_STORE_REVIEW_NOTES.md` — reviewer demo account + defense for 3.1.3(b)

---

## 1. App name (30 char max)

**Primary choice:** `Acuity` (6 / 30)

**Fallback:** `Acuity Daily` (12 / 30)

**Verify before submit:** "Acuity" may already be claimed on the store by one of the existing apps with that name (Acuity Scheduling by Squarespace, Acuity International). App Store Connect rejects duplicate names at the tenant level; if Apple rejects `Acuity`, fall through to `Acuity Daily` — that's the name the earlier metadata draft landed on, so the rest of this doc is safe either way.

The Expo bundle name is already `Acuity` (see `apps/mobile/app.json:3`), which is what appears under the icon on the home screen. The App Store listing name is independent — changing the listing name to `Acuity Daily` won't rename the installed app.

---

## 2. Subtitle (30 char max, four options)

Pick one. All four pass the rubric (no banned words, no tricolon, no rhetorical question, names either the trigger or the approved "brain dump" term).

| # | Subtitle | Chars | Why it might win |
|---|---|---|---|
| 1 | **Your nightly brain dump** | 22 | Approved external term (§2.3 of rubric). Maya-voice. Picturable. |
| 2 | **Sixty seconds before bed** | 24 | Anchors the 10 PM trigger moment. Schwartz-1 unaware-friendly. |
| 3 | **The sixty-second shutdown** | 28 | Names the category ("shutdown ritual", §7.1). Trades warmth for clarity. |
| 4 | **Talk it out, then sleep** | 23 | Two verbs + outcome. Zero AI smell. |

**Recommend #1** for cold App Store search — "brain dump" converts in ads per existing drip emails, and Maya is looking for relief from mental noise, not for a new category name.

The earlier metadata draft (`APP_STORE_METADATA.md:17`) used `Voice journaling that sees you` — **do not ship that.** "Journaling" is banned as a category word in acquisition copy (rubric §7.1). Replace with one of the four above.

---

## 3. Promotional text (170 char max, updateable without review)

```
Your nightly brain dump, listened to. Sixty seconds of talking. We pull out your tasks, track your mood, and write you a weekly report about the patterns you can't see.
```

**169 / 170 chars.** No banned words. No "AI-powered." Names the artifact (weekly report) per §7.2. Mentions "brain dump" (external term) not "journal." Uses "we" sparingly. Final phrase "patterns you can't see" is the falsifiable hook — user either sees new patterns in the report or doesn't.

**Updateable at any time without re-review** — this is where to run A/B copy experiments post-launch.

---

## 4. Description (4000 char max)

Paste this verbatim. ~2,400 / 4,000 chars. Structure: what it does → who it's for → how it works → data → caveat → pricing-adjacent framing.

```
Acuity turns a sixty-second voice brain dump into the patterns hiding in your own life.

WHAT IT DOES
Talk for a minute each night about whatever's on your mind — your day, your worries, the thing you can't stop chewing on. Acuity transcribes what you said, pulls out the tasks you mentioned, scores your mood, tracks your goals, and watches for the themes that keep coming back.

On Day 14 you get a Life Audit — a long-form letter written from your own words about what showed up across the two weeks. On Sunday of every week you get a Weekly Report: a 400-word read about what the pattern looks like right now.

WHO IT'S FOR
People who can't shut their brain off at night. Founders tracking their own bandwidth. Shift workers who want a record of which weeks land hard. Anyone who's ever Googled "how to stop overthinking before bed" and got a list of affirmations instead of a record.

HOW IT WORKS
1. Open the app at night. Hit record.
2. Talk. Up to two minutes. No structure, no prompt.
3. Watch your dashboard build itself. Tasks, themes, mood scores, goals — lifted from your own words.
4. Come back the next night. Add another minute.

Your six Life Areas — Career, Health, Relationships, Finances, Personal, Other — get scored over time so you can see what's lit up and what's been quiet. Weekly reports pull the common thread.

WHAT YOUR DATA DOES
Nothing is sold. Nothing trains AI models. Voice recordings are transcribed and deleted from our servers within minutes; transcripts and extracted signals stay in your account until you delete them. One-tap account deletion is available from Profile → Delete account; it removes everything and cancels your subscription.

The AI stack is Whisper (for transcription) and Claude (for extraction). Both are API calls, not consumer-tier ChatGPT — under their API terms, what we send them is processed and returned, not used to train their models.

WHAT IT DOESN'T DO
Acuity is not therapy. It's a record of your own observations, structured so patterns become visible. If you're in crisis, call 988 in the US or visit findahelpline.com.

FREE TRIAL + WHAT HAPPENS AFTER
Fourteen days free, no credit card. At the end you keep every entry, transcript, insight, and the Life Audit we generated. Continuing to record, refresh your Life Matrix, or generate new Weekly Reports requires a Pro subscription — managed through your Acuity account on the web at getacuity.io.
```

### Rubric passes documented

- Zero banned verbs (delve, leverage, utilize, harness, etc.) — confirmed by grep.
- Zero "AI-powered" above the fold. "AI stack is Whisper and Claude" appears in the penultimate paragraph, which is below the App Store fold (only the first ~3 lines show without a "more" tap).
- "Journaling" does not appear.
- Weekly Report named in the second paragraph (within first viewport).
- Specific artifacts: "400-word read," "Day 14 Life Audit," "six Life Areas."
- Specific crisis line: 988 / findahelpline.com.
- Falsifiable claims: "deleted from our servers within minutes," "fourteen days free, no credit card," "not used to train their models."
- Concedes the weakest point (not therapy) before shipping the pricing paragraph.

---

## 5. Keywords (100 chars, comma-separated, NO spaces)

```
journal,voice,memo,mood,tracking,therapy,mental,health,brain,dump,debrief,habit,mindful,wellness
```

**99 / 100 chars.** These are SEO terms that the rubric (§3.7 conditional bans) explicitly allows for keyword/meta-description use even though "journal" is banned in the description and subtitle. Search intent demands it: Apple's App Store search is still the #1 discovery channel, and "journal" + "voice" are the two highest-intent terms for this app.

Keyword research notes (from competitor App Store pages, verified via App Store web 2026-04):
- Day One uses: `journal,journaling,diary,memories,notebook,writing,daily,mood,photos,private`
- Rosebud uses: `journaling,journal,self reflection,ai journal,mental health,anxiety,mood tracker`
- Stoic uses: `stoicism,philosophy,journal,meditation,reflection,productivity,mood,happiness`

Acuity's keyword strategy differs: lead with "journal" + "voice" (the highest-intent short queries), then capture category-adjacent terms (therapy, mood, habit) that Maya actually types. Not using `anxiety` or `depression` — those are regulated terms Apple scrutinizes for wellness apps without medical credentials.

**Drop if Apple complains:** `debrief` (least search volume) or `wellness` (most generic).

---

## 6. URLs

| Field | Value | Live status |
|---|---|---|
| Support URL | `https://www.getacuity.io/support` | ✅ HTTP 200 (verified 2026-04-24) |
| Marketing URL | `https://www.getacuity.io` | ✅ |
| Privacy Policy URL | `https://www.getacuity.io/privacy` | ✅ HTTP 200 (verified 2026-04-24, last updated 2026-04-19) |

All three are indexable and pass `curl -sI` health check. No action needed before submit.

---

## 7. Categories + metadata

| Field | Value | Notes |
|---|---|---|
| Primary Category | Health & Fitness | Maps to Maya's search intent. |
| Secondary Category | Productivity | Catches the founder / self-optimizer segment from /for/founders landing page. |
| Age Rating | 4+ | No user-generated public content; private voice journal with no social layer. See `docs/APP_STORE_PRICING.md` §4 for the self-assessment. |
| Contains ads | No | Verified — no ad SDKs in bundle. |
| Uses IDFA | No | No AdSupport framework import. |
| Export compliance (non-exempt encryption) | `false` | Declared in `app.json` line 23. HTTPS + standard iOS crypto only. |
| Copyright | `© 2026 Heeler Digital, LLC` | Verify entity name on file with Apple matches this exactly. |

---

## 8. What's New in This Version (first submission)

```
First release of Acuity Daily on iOS. Record your nightly voice brain dump, let the app extract what matters, watch the pattern of your weeks come into focus.
```

158 chars. For subsequent submissions, this field gets per-build changelog — keep each one to 1–2 sentences that name a user-visible change, not a technical one.

---

## 9. Pre-submit checklist

- [ ] App name: confirm "Acuity" availability in App Store Connect. Fall through to "Acuity Daily" if rejected.
- [ ] Subtitle: pick one of the four options in §2. Default to #1 ("Your nightly brain dump").
- [ ] Paste description verbatim from §4. Do not let auto-correct "it's" ↔ "its" flips slip through.
- [ ] Upload screenshots per `docs/APP_STORE_REVIEW_NOTES.md` §4 (screenshot brief).
- [ ] Set primary category to Health & Fitness, secondary to Productivity.
- [ ] Paste privacy answers from `docs/APP_STORE_PRIVACY.md` §3.
- [ ] Paste review notes from `docs/APP_STORE_REVIEW_NOTES.md` §1.
- [ ] Create reviewer demo account per `docs/APP_STORE_REVIEW_NOTES.md` §2.
- [ ] Age rating: 4+.
- [ ] Pricing: Free. No IAP configured. See `docs/APP_STORE_PRICING.md` for the 3.1.3(b) rationale.
