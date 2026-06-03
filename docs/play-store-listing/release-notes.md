# Play Console — Release notes

**Field name in Play Console:** Production / Internal Testing → Release → Release notes (en-US)
**Limit:** 500 characters
**Status:** Drafted 2026-06-03 for the first Android release. Paste verbatim.

---

## Release notes (paste verbatim)

```
First release on Android.

Acuity is your nightly brain dump, listened to. Talk for sixty seconds about whatever's on your mind. We pull out tasks, score your mood, and watch for the themes that keep coming back. Every Sunday you get a 400-word Weekly Report. On Day 14 you get a long-form Life Audit written from your own words.

Fourteen days free. No credit card.
```

**Character count:** 398 / 500.

---

## Why the value prop, not a changelog

This is the **first** Android release — there are no previous Android users for whom a "what's new" delta is meaningful. Play Store users browsing release notes on a search-result tap are evaluating whether to install at all. Leading with the value prop (sixty-second brain dump → weekly report) gives them a reason. The "First release on Android" line at the top sets expectations honestly without burying it.

For **subsequent releases** (1.3.1, 1.4, etc.), this field becomes a real changelog. Keep each one to 1–2 sentences naming a user-visible change, not a technical one. Examples:

> v1.3.1 — Fixed an issue where the Face ID lock wasn't firing after returning from the background.

> v1.4 — Calendar integration: connect Apple Calendar or Google Calendar so Acuity can send your extracted tasks back to where you already plan your day.

## Pre-paste checks

- [ ] Confirm the 500-char cap isn't violated by line endings — Play Console counts `\r\n` as 2.
- [ ] No "AI-powered."
- [ ] No platform-specific language ("on Android" appears once intentionally; otherwise the copy is platform-neutral).
- [ ] First sentence delivers the hook without requiring the user to expand "more."
