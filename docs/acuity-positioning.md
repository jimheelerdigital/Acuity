# Acuity — Positioning & Brand Reference

**Status:** Canonical / source of truth. This reflects Acuity's *current* positioning and supersedes any older marketing docs that use duration claims ("60-second"), nightly/bedtime framing of the product, or $12.99 pricing. When anything conflicts with this file, this file wins.

**Last updated:** 2026-10-06 (terminology, claims, pain branches, personas, social proof and ad formats updated per Keenan; 2026-09-29 category + voice. Code source of truth: `apps/web/src/lib/positioning.ts`)

---

## What Acuity does

**Ripple is an AI life optimizer: a habit tracker, voice journal and insight tool that helps people change their lives for the better.** (Category set by Keenan, 2026-09-29.)

The core loop is simple: you record a "debrief" — you talk, out loud, any time of day, about whatever's in your head. Acuity transcribes it, then its AI does the work you'd never do yourself: it pulls out your to-dos, quietly tracks the goals you mentioned, scores your mood, notices patterns across days and weeks, organizes your life into domains, and hands you back a clear weekly narrative of what actually happened. You speak the mess; it gives you back the meaning.

The defining principle: **Ripple is on your side.** It shows you what's really going on in your own words (your tasks, habits, mood and patterns) and helps you act on it, so your life actually changes for the better. It is encouraging and practical, never preachy, never lecturing, and it never claims to treat, diagnose, cure or replace therapy. (Replaces "a mirror, not a coach", retired 2026-09-29. Never say "mirror, not a coach".)

In ads, say plainly what Ripple is and does. "Change your life for the better" and "build better habits" are fine; never promise health or mental-health outcomes or use before/after claims (Meta policy).

---

## Who we serve

Our real, paying audience is **women, roughly 40–50** (about 90% of signups are female). These are women carrying a heavy mental load — work, family, aging parents, the invisible labor of running other people's lives. They have a rich inner life and a constant swirl of things to track, but no time or energy to sit and journal by hand.

They are not productivity-hacker power users, and they are not 22-year-old wellness-app downloaders. They are capable, busy, reflective women who want to feel on top of their lives again without adding another chore.

---

## Feature stack (what they actually get)

Value is delivered across several surfaces, and different people convert on different ones — there is no single "the feature":

- **Voice debrief** — talk instead of type; the entry point to everything.
- **Task extraction** — the AI pulls action items out of spoken words automatically, so things you mention don't fall through the cracks.
- **Passive goal tracking** — goals you talk about get tracked without you having to manage them.
- **Mood detection & scoring** — automatic emotional read across entries.
- **Pattern detection** — surfaces recurring themes and trends across weeks and months.
- **Life Matrix** — your life organized into six domains, tracked over time, so you can see where you're thriving and where you're slipping.
- **Weekly report** — a written narrative of your week; the throughline you'd never assemble yourself.
- **Progress metrics & achievements** — streaks, entry counts, and milestones that reinforce the habit.

Underneath: native iOS and Android apps (where recording and push notifications live), a full web app, voice transcription, and AI extraction/generation doing the heavy lifting.

---

## Ideal client

A woman in her 40s who feels mentally overloaded and a little unseen — self-aware enough to want to reflect, but too stretched to keep a written journal. She wants clarity, not coaching. She wants to feel like something is finally keeping track of her life *for* her. She values the *feeling of relief* over any single feature, and she converts because the product makes her feel lighter and more in control — not because it has the longest feature list.

---

## Pains they use us to solve

- **Mental overload** — too much swirling in her head, nowhere to put it down.
- **Things falling through the cracks** — tasks, intentions, and goals she meant to act on but lost track of.
- **The blank-page problem of journaling** — she's tried to journal, hated typing, and quit. Talking is frictionless where writing was a wall.
- **Not seeing her own patterns** — repeating the same avoidance, the same stress, without noticing the throughline.
- **Feeling unseen / unheard** — no one is really tracking *her* inner life; Acuity becomes the thing that listens and remembers.
- **No sense of progress** — weeks blur together with no evidence she's moving forward.

---

## Who they're looking to become

They're not buying features — they're buying a future self. They want to become **the woman who has her life together without white-knuckling it.** Someone who feels *light* instead of buried. Clear-headed, on top of things, quietly self-aware — able to see her own patterns and growth, with a sense of forward motion. Someone who finally feels *seen and kept track of*, so she can stop holding everything in her head and just live.

**The transformation we sell: from overwhelmed and scattered → to clear, light, and in control of her own story.**

---

## Brand language rules (mandatory)

These apply to all customer-facing copy — site, ads, app, emails, blog, push notifications, app store listings.

### Terminology (2026-10-06)
- **In the app and product UI** (and emails to people who already have the app), the feature is a **"debrief"**. Never "brain dump", "journal entry" or "check-in" there. Jev still enforces this for in-app text.
- **Ads, hooks, SEO pages, outreach emails and creator briefs** may use customer words like **"brain dump"** and **"voice journal"**, because that is how people search and talk. When naming the feature itself, it's a "debrief". Jev does not reject ad or creator copy for "brain dump".
- **Time of day:** Ripple's own brand copy and visuals never pin the product to a time of day (❌ "use it every night", "before bed", "at 9pm"). People use it whenever. **Creators can describe their own routine however they like.**

### Claims (2026-10-06)
- **Never claim Ripple treats, diagnoses, cures, or replaces therapy.** (Replaces the old "no medical or clinical claims anywhere".)
- Creators may state their credentials ("I'm a therapist") and their personal experience.
- Jev rejects any copy that crosses that line. Meta ad policy still applies on top: no implying the reader has a condition, no health-outcome promises, no before/after.

### Other rules
- ✅ "Life Matrix"  ❌ "Life Map"
- ✅ multi-surface value  ❌ framing the weekly report as the sole conversion moment
- ❌ no recording-duration claims ("60-second," "90-second," etc.)
- Pricing: **$9.99/month** (default) and $89.99/year, 7-day free trial. Never lead with annual; never quote stale prices ($4.99, $12.99 eras). Subscribers from before the 2026-09 price change are grandfathered at $4.99/$39.99 — only mention that in copy aimed at EXISTING subscribers.
- Category: **AI life optimizer: habit tracker, voice journal and insight tool** that helps people change their lives for the better. "Voice journal" is allowed as part of the category.
- Voice: **on your side**: show what's really going on and help take the next step; never preachy, and never a treat/diagnose/cure/replace-therapy claim.
- Social proof rating line: five stars "on the App Store", no number and no user count (Keenan, 2026-09-24). Where a rating number or user count is shown, it comes from ONE config value, `APP_RATING` in `apps/web/src/lib/social-proof.ts`. No file hardcodes it. Numbers awaiting Keenan's confirmation of the live figures (2026-10-06).

---

## Pain branches (2026-10-06)

**The Load, The Treadmill, The Loop, The Gap, The Planner** are a **starting set, not a requirement**. Copy can use one of them or name a different pain. Nothing forces copy into one of the five.

| Key | Branch | The pain |
|---|---|---|
| load | The Load | carrying everyone's list in your head; tired from tracking, not from doing |
| treadmill | The Treadmill | busy all day, and none of it feels like moving forward |
| loop | The Loop | the same fights, the same stress, the same week on repeat |
| gap | The Gap | knowing what you should do and not doing it |
| planner | The Planner | planning, rewriting lists and starting new systems instead of progress |

Every generated ad is tagged with the branch it used (`| branch: <key>` in the AdLab angle's research notes; new pains get their own short label), so branches can be ranked by results.

---

## Personas (2026-10-06)

The Toon 3D avatar carousels have a persona setting (`CAROUSEL_PERSONA` in `apps/web/src/lib/content-factory/brand.ts`) with two values:
- **midlife** (current default): the existing Toon 3D heroine, a woman in her 40s. Used for midlife only.
- **ambitious**: a second lead in the same Toon 3D style block, in their mid-20s. **Character line is a DRAFT** for Keenan to edit.

---

## Ad formats (2026-10-06)

- **In-house animated ads:** the fixed per-template animated scripts Ripple renders itself (AdLab weekly batch video templates). These apply to in-house animation only.
- **UGC creator brief:** loose **hook → problem → demo → call to action**, said in the creator's own words. Every brief includes the claims rule above. Code: `apps/web/src/lib/adlab/ugc-brief.ts`.
