# Play Console — Full description

**Field name in Play Console:** App details → Full description
**Limit:** 4000 characters
**Status:** Drafted 2026-06-03. Paste verbatim into Play Console.

---

## Description (paste verbatim)

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

FEATURES
• Voice-first capture — talk, don't type
• Automatic transcription you can search later
• Tasks extracted from what you said, organized by life area
• Mood tracking that scores itself from tone and content
• Goals tracked across entries — Acuity notices when you've gone quiet on something
• Theme detection — surfaces the things you keep returning to
• Life Matrix across 10 life areas, scored over time
• Weekly Report every Sunday — 400 words about your week's pattern
• Day-14 Life Audit — a long-form letter from your first two weeks
• Reminders at 9 AM and 8 PM in your local time zone
• Biometric app lock for entry privacy

YOUR LIFE AREAS, SCORED OVER TIME
Career, Health, Relationships, Finances, Personal, Energy, Mind, Body, Purpose, Habits — ten dimensions get tracked from your entries. See what's lit up and what's been quiet. Weekly reports pull the common thread.

WHAT YOUR DATA DOES
Nothing is sold. Nothing trains AI models. Voice recordings are transcribed and deleted from our servers within minutes; transcripts and extracted signals stay in your account until you delete them. One-tap account deletion is available from Profile → Delete account; it removes everything and cancels your subscription.

The AI stack is Whisper (for transcription, by OpenAI) and Claude (for extraction, by Anthropic). Both are API calls — under their API terms, what we send them is processed and returned, not used to train their models.

WHAT IT DOESN'T DO
Acuity is not therapy. It's a record of your own observations, structured so patterns become visible. If you're in crisis, call or text 988 in the US, or visit findahelpline.com for global resources.

FREE TRIAL + WHAT HAPPENS AFTER
Fourteen days free, no credit card. At the end you keep every entry, transcript, insight, and the Life Audit we generated. Continuing to record, refresh your Life Matrix, or generate new Weekly Reports requires a Pro subscription — managed through your Acuity account on the web at getacuity.io.

Privacy Policy: https://www.getacuity.io/privacy
Support: https://www.getacuity.io/support
```

**Character count:** ~3,580 / 4,000. Room to expand if Play asks for more.

---

## Diff from the iOS description

The iOS description in `docs/APP_STORE_LISTING.md` §4 was the source. Adaptations for Android:

1. **Stripped iOS-specific language:**
   - Removed mentions of "App Store" / "iPhone" / "iOS" anywhere it appeared.
   - Added a Features bullet list (Play Console search ranks heavily on featured terms; iOS App Store doesn't read body bullets the same way).

2. **Updated Life Areas vocab:**
   - iOS draft said "six Life Areas." v1.3 ships with the 10-axis Life Matrix (Phase D vocab). Updated to "ten dimensions" + named the axes.

3. **Added features the iOS draft pre-dated:**
   - Reminders at 9 AM / 8 PM (v1.3 notifications cron)
   - Biometric app lock (v1.3 lock context)

4. **Explicit URLs at the bottom:**
   - Play Console doesn't surface a separate Privacy URL field with the same prominence iOS does. Repeating the URLs at the foot of the description ensures they're discoverable.

5. **Tightened the AI paragraph:**
   - Names OpenAI and Anthropic explicitly. Apple Guideline 5.1.1(i)/5.1.2(i) drove that change for iOS too; on Android the Data Safety form does the disclosure work, but explicit naming in the body description doubles as user-facing transparency.

## Rubric passes documented

- Zero banned verbs (delve, leverage, utilize, harness, etc.) — confirmed.
- Zero "AI-powered." Names the providers and the limits ("not used to train their models") in the privacy paragraph below the fold.
- "Journaling" does not appear in the body.
- Weekly Report named in the second paragraph (within first viewport on most Android devices).
- Specific artifacts: "400-word read," "Day 14 Life Audit," "10 life areas."
- Specific crisis line: 988 / findahelpline.com.
- Falsifiable claims: "deleted from our servers within minutes," "fourteen days free, no credit card," "not used to train their models."
- Concedes the weakest point (not therapy) before shipping the pricing paragraph.

## Pre-paste checks

- [ ] Open the Play Console preview and confirm the first 80–120 characters render as the search snippet without an awkward truncation.
- [ ] Confirm bullet characters (`•`) render correctly — some Android locales fall back to a box glyph; ASCII `*` is the safer alt if any preview looks bad.
- [ ] Verify no auto-correct slipped "its" / "it's" or smart-quote substitutions.
