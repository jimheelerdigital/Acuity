# Ripple app redesign: build plan (approved 2026-10-31)

**For:** Jimmy (mobile + API). **Approved by:** Keenan, 2026-10-31.
**Clickable prototype:** https://claude.ai/artifact/GmTy2bvENk5xQL7Bsxxec4 (press Play; tap through every tab, the record flow, and the unlock).

The goal is retention. Today 33% of paying users have never recorded, and only 28% come back after their first week. The redesign puts value in front of her in the first two minutes and gives her a reason to return tomorrow:
- an instant payoff after every debrief
- insights that unlock as she keeps recording
- teasers built from her own data
- concrete "do this" guidance

---

## 1. Structure

| New tab | Replaces | Purpose |
|---|---|---|
| **Home** | Home | What matters right now: record, today's tasks and habits, current insights, what's next |
| **Plan** | Tasks + Growth (Habits/Goals) | Everything she has to *do*. Segments: Today · Tasks · Habits · Goals |
| **Record** (center button) | Home button in the center slot | The core action, reachable from every tab |
| **Insights** | Insights | The deeper dashboard, led by guidance ("what your debriefs are telling you") |
| **You** | Profile + Entries | Account, debrief history and search, appearance, reminders, subscription |

- **Tab bar:** a floating pill, 14px from the screen edges and 16px from the bottom, 68px tall, radius 30, frosted (blur 20). Record sits in the center, raised 14px, with a slow "breathing" glow.
- **Remove from the current app:**
  - the LV badge
  - the empty MINUTES tile
  - the "AT RISK" streak card
  - the duplicate goal/insight cards on Home
  - the Life Matrix radar on the main Insights view (it can move into a Day 7+ unlock)
  - the "Generate weekly report" button (reports arrive on their own)

## 2. Visual tokens (light, default)

| Token | Value | Use |
|---|---|---|
| bg | `#FFF2EA` | Page background (very light peach) |
| surface | `rgba(255,255,255,.66)` + `backdrop-filter: blur(18px)` | Cards (glass) |
| surfaceSolid | `#FFFFFF` | Inputs, inner boxes |
| surface2 | `rgba(255,255,255,.55)` | Quiet fills, segmented controls |
| cardBorder | `1px solid rgba(255,255,255,.9)` | All cards; no hard grey outlines |
| cardShadow | `0 14px 34px rgba(242,84,30,.12)` | All cards (orange-tinted, soft) |
| text / text2 / text3 | `#2A231D` / `#5E5348` / `#6F6458` | Body, secondary, labels. All pass 4.5:1 |
| accent gradient | `#FF9459 → #F04A18` (135°) | **Only big moments:** Record button, "What's on your mind?", "Your one change this week", unlocked day badges |
| accent solid | `#F2541E` | Rings, NEW pill, progress fill |
| coralSoft / coralText | `#FFE2D1` / `#A8360C` | Tints, chips, tags, the ready card |
| heroSoft | `linear-gradient(135deg, #FFE2D1, #FFF4EC)` | Today's read, "Try this" boxes |
| secondary (violet accent) | `#B4A8F8`, light `#D8D1FF`, soft `#F4F2FF`, text `#6A5AD8` (lavender: keep it light) | **Slight accents only:** habit ring (2/3), habit checks + week bars, Day 7 progress ring (5/7) + day-bars, "71% written" chips, Insights tab dot |
| Tasks tile | `linear-gradient(160deg, rgba(255,255,255,.88), rgba(255,206,178,.88))` | |
| Habits tile | `linear-gradient(160deg, rgba(255,255,255,.88), rgba(255,224,204,.88))` | |
| ambient light | Two drifting radial glows, `rgba(255,100,40,.38)` and `rgba(255,170,130,.40)` | 18s and 22s loops |

**Color rules (Keenan):**
- **No yellow or gold.**
- **Violet only as a slight accent** for progress and habits, never on big surfaces or the main gradient.
- Everything else stays in the white, peach and orange family.

**Dark mode** (user choice: Light / Dark / Match my phone, under You → Appearance):
- bg `#1A1714`, surface `rgba(40,34,29,.72)` + blur, text `#F3EDE4` / `#C9BFB2` / `#A89D90`
- accent `#FF6B2E → #FF9A55`, coralText `#FFA57A`, violet accent `#A99BFF` (soft `rgba(139,124,240,.2)`, text `#C9BFFF`)
- Same layout and same rules.

**Type:**
- Fraunces (serif) for headings, card titles and quotes: 600 weight, slight negative tracking.
- Inter for everything else.
- Sizes: screen titles 30, section titles 18–19, card titles 16–17, body 14–15, labels 11 (800 weight, 1px tracking, uppercase).

**Shape:**
- Cards radius 26, the hero button 30, small chips fully round.
- Touch targets at least 44px.
- Spacing between sections: 14–18px.

## 3. Motion (all of it respects "Reduce Motion": no animation, rings and sheens hidden)

| Element | Animation |
|---|---|
| Screen enter | Fade + rise 14px, 0.5s, `cubic-bezier(.2,.8,.2,1)`; content staggers in 70ms steps |
| Ambient glows | Slow drift and scale, 18s / 22s loops |
| Record button | Center tab button: **no ring or outline** (Keenan); just a soft orange shadow that breathes (scale 1.03, 3.2s). Focus outline shows only for keyboard focus. Home hero keeps its two rings |
| Recording orb | 118px orange blob, slow morph (7s) + spin (24s), gentle breath (scale 1.03, 4.8s). Two lavender layers fade in and out (6s, offset 3s) so the color drifts orange ↔ lavender. **Pond ripples, kept subtle:** 2 faint thin rings (1.5px, orange then lavender, ~32% opacity) start at the orb's edge and travel outward to 2.7× while fading, 2.4s apart (4.8s each). Keenan: keep the round, glossy blob from the old app; fewer ripples. **While recording, the blob itself is the visualizer** (no bars inside, no icon). It scales with her voice: roughly `1 + level × 0.15`, smoothed over about 120ms, where `level` is the normalized mic metering from expo-av's `isMeteringEnabled` / `metering` dB (map −50 dB → 0, −10 dB → 1). Its shape morphs faster (1.6s) while she speaks, and it settles back to the slow breath in pauses. The prototype fakes this with an uneven speech-like loop. Rings come faster (3s). No floating or bobbing (Keenan: "too much"). 64px gap below the orb before the prompts |
| Big orange cards | A light sheen sweeps across every ~3.6s |
| Progress bars | Fill from 0 over 1.1s on appear |
| Check-off | Check icon pops (0.35s overshoot); circle fills orange |
| Ready unlock (Day 3) | Pulsing rings on the node, NEW pill glow, sheen on the card |
| Locked nodes | Lock icon gives a small wiggle every ~3.4s, staggered between nodes |
| "What's next" line | A faint glow travels down the progression line every 3.2s |
| Unlock reveal | 14 orange and peach sparks burst out from the day badge |
| Teaser tap | Card does a small shake + bottom message slides up for ~2.5s |
| **Honest wait (after Done talking)** | "Sorting your debrief · This usually takes 30 to 60 seconds." A 60s progress bar with a sheen, a live "About N seconds left", 4 stages ticking off (Writing down what you said → Finding your tasks and dates → Spotting what keeps coming up → Writing today's read), her transcript with key phrases lighting up, and **Browse while you wait** (Home / Plan / Insights + "We'll notify you when it's ready"). Leaving does not cancel processing. When done: on this screen it goes straight to "I caught N things"; elsewhere a top banner shows "Your debrief is ready · I caught 5 things · See it ›" plus a push notification if the app is backgrounded. **Drive the bar and stages from real pipeline status** (Inngest step updates), not a fixed timer |
| **Tasks fly home** | "Looks right": each new task becomes a small orange pill that flies into the Plan tab (0.85s, staggered); the Plan tab gets a "+3" badge that pops; the Tasks tile number goes up. Same motion for "Add to my plan" / "Make it a habit" in Insights |
| **Day counter rolls** | First Home visit after recording on a new day: the flame flares (scale 1.5) and the number rolls up (5 slides out, 6 slides in, 0.45s) |
| **Check-off** | Circle fills orange + check pops, a line sweeps across the task (0.35s), then **after 1s the row fades and slides right (0.55s) and the list closes up**. Tapping again within that second cancels it; finishing all of today's habits sets off a small orange/lavender burst + an "All done today" pill |
| **Insights count-up** | KPIs count from 0 to their value over 0.9s (ease-out) each time Insights opens; mood bars grow in one by one |
| Haptics (to add) | Light tap on check-off; success haptic on unlock; soft tick when each "caught" item lands |

## 4. Screens

### Home
1. **Header:** "Good afternoon," + name (Fraunces 30). Right side: the **days-recorded chip** and the avatar.
   - **The chip:** a solid orange pill with a white two-tone flame that flickers gently, a big serif number, and a small stacked "DAYS RECORDED" label.
   - **Tapping the chip** opens *This week · Sun–Sat*: 7 day circles (S M T W T F S; filled = recorded, dashed = not), "4 days recorded" this week, "5 days recorded in total · best week: 4 · never resets", plus a nudge tied to the next unlock.
   - **This is not a streak.** The count never drops, and nothing is ever "at risk."
   - **Below the header:** a dismissible **"NEW" banner** whenever a release ships (e.g. "Debrief in one tap from your Action Button ›"). It opens What's new.
2. **Record hero:** "What's on your mind?" / "Talk it out. Ripple sorts it." Accent gradient, mic with rings. Opens Record.
3. **Tiles: two identical twins.** Each has:
   - a label, with a small badge on the right
   - a big serif single number + words ("**4** open" / "**2/3** done", same size and style), in Fraunces' default figures (Keenan likes that 4)
   - a thin progress bar
   - one "Next: …" line (ellipsis if long)

   Tasks is peach/orange, Habits is lavender. Both have a deeper shadow, a glossy top highlight and a white-to-tint fill. Each opens Plan on its segment.
4. **Your insights** (one glass card), with "Dashboard ›" linking to Insights:
   - **Today's read:** one useful line generated from her latest debrief. Available from debrief 1.
   - **Stepper (6 icons):** Day 1 ✓ · Day 3 ✨ · Today · Day 7 (5/7 ring) · Day 14 🔒 · **+4 More**. "More" slides the row sideways to ‹ · Day 30 · 90 · 180 · 365 (all locked).
   - **Ready card:** the newest unlock, with its actual finding ("Mom comes up in 4 of your last 5 debriefs"). Opens the reveal.
   - **What's next:** a thin progression line in the left margin joins:
     - **Day 7 teaser card:** blurred personal sentence, "71% written", 7 day-bars. Tap = shake + message.
     - **Day 14 row:** expands (⌄) to its blurred teaser, "You'll get …", and "Unlocks in N days".
     - **"Your year ahead · 4 more unlocks" (⌄):** Days 30, 90, 180 and 365, each with "In N days", a blurred teaser and what she'll get.
5. **Last debrief:** a one-line summary.

### Record
- "What's on your mind?" + a large orb. One tap starts recording.
- **Prompt cards** for the blank-page moment, with a **Shuffle** button that cycles sets:
  - **Card 1 is personal:** "PICKED FOR YOU · FROM TUESDAY", e.g. "Did you get Mom's follow-up booked?". It's generated from open tasks and habits in her recent debriefs. Orange border, sheen, gradient icon.
  - **Cards 2–3** are typed: FROM YOUR WEEK / JUST FOR YOU / CLEAR YOUR HEAD, each with its own icon.
  - **Motion:** icons bob gently, offset from each other.
  - **Tapping a card** starts recording and pins **"Talking about: …"** above the timer, and the prompt is saved with the debrief.
- "Type it instead."
- While recording: live bars, a timer, a live transcript snippet, and **Done talking**.

### "Added to your plan" (after every debrief; replaces "I caught N things")
- **Auto-add by default.** Every extracted task is **already added** to her plan, and habits she mentioned are **already checked off**. She removes the rare wrong one; she never has to approve each item. (Keenan, 10-31.)
- **Badge:** "Ready · from the debrief you just recorded". **Title:** "Added to your plan". **Summary line, live:** "3 tasks added · 1 habit checked off. Tap ✕ to remove anything."
- **Each row:** a ✓ dot (orange for tasks, lavender for habits), the title, a meta line ("Task · added to your plan" / "Habit · checked off, you mentioned your walk with Jen"), a date chip, and an **✕** for one-tap removal. A removed row collapses to "Removed: … · **Undo**".
- **Below the rows:** "+ Add something I missed" opens a quick text box.
- **Then:** Today's read for this debrief; Mood + Pattern cards.
- **One button: Done.** The kept tasks fly into the Plan tab (+N badge, the Tasks count goes up).
- **Backend:** extraction writes the tasks and habit checks immediately. ✕ deletes the task, or un-checks the habit, and logs a "rejected extraction" signal. Use that signal to tune extraction.
- If she leaves during processing, the "Your debrief is ready" banner and push open this screen.

### Unlock reveal
- Day badge with the spark burst, "Unlocked", the title, the finding, the next unlock, and a CTA that loops back to Record ("Talk about what would make this lighter").

### What's new (new screen)
- **Reached from:** the Home "NEW" banner and two rows on You ("What's new", "One-tap debriefs").
- **Set up one-tap debriefs:** expandable step-by-step guides:
  - **Home Screen widget:** touch and hold → Edit → Add Widget → Ripple.
  - **Lock Screen widget:** touch and hold Lock Screen → Customize → widget area → Ripple.
  - **Action Button** (iPhone 15 Pro+): Settings → Action Button → Shortcut → "Ripple: Start a debrief".
  - **Control Center** (iOS 18+): + → Add a Control → Ripple.
  - **Needs:** an App Intent / App Shortcut "Start a debrief" (Action Button + Shortcuts) and a ControlWidget (iOS 18 Control Center).
- **Release notes:** list by version. Feed it from the existing `app-version-config.ts` release notes so there's one place to edit.

### Plan
- Segments **Today · Tasks · Habits · Goals** with a sliding indicator.
- Each task shows its source ("from your debrief, Tue") and date.
- Habits show 7-day bars, with the hint "Mention a habit in a debrief and Ripple checks it off for you."
- Goals show progress bars and "last mentioned".
- Swipe right to complete and left to push to tomorrow (to add).

### Insights (dashboard)
1. **KPI row:** days recorded · tasks caught (+week delta) · % done (+delta).
2. **What your debriefs are telling you.** This is the core of the dashboard:
   - **Your one change this week:** an accent card with one specific action, the evidence behind it, and **Add to my plan**.
   - **Pattern cards (2–4):** a tag (e.g. "Your hardest day"), the evidence ("Seen in 4 of 5 debriefs"), the observation, why it matters, a **TRY THIS** step, and actions **Add to my plan** / **Make it a habit** / **Not for me**.
3. **Mood:** a 14-day bar chart plus one sentence ("Your three best days all came after a walk").
4. **What keeps coming up:** theme chips with counts.
5. **People on your mind:** top 4 with mention counts.
6. **Follow-through:** a % ring plus time-to-finish by category ("Family: 2 days, yours: 9").
7. **Weekly reports:** progress until the first one, then the archive.
8. **Ask your past self:** opens on day 30.

### You
- Profile, stats, **Appearance** (Light / Dark / My phone), debriefs with search, then Reminders, Subscription, Privacy, Help.

## 5. Systems behind the screens

### Unlocks
- **Counted by days recorded:** distinct local dates with at least one completed debrief. It **never resets.**
- **Ladder:**

| Days recorded | Unlock |
|---|---|
| 1 | Daily catch |
| 3 | First pattern |
| 7 | First weekly report + Life Matrix |
| 14 | What lifts you vs drains you |
| 30 | First month + Ask your past self |
| 90 | State of You |
| 180 | How you've changed |
| 365 | Your year |

- **Day 3 must land inside the 7-day trial.** That's the point of it.
- **Existing users** get everything they've already earned immediately, with no relocking.
- Each unlock fires once: a push ("Your first pattern is ready"), the reveal screen, and an email.

### Teasers: the rule that matters most
- **Only tease what's real.** Blurred words and counts ("Already spotted 3 lifts and 2 drains", "71% written") must come from her actual debriefs and existing extractions. Never invent filler.
- If there isn't enough data for a teaser yet, show the benefit line only.
- **Suggested API:** `GET /api/insights/path` returns:
  - `{ daysRecorded, weekDots[7], bestWeek, todaysRead, ready: {...}, next: [{ day, title, benefit, teaser: { parts: [{text, blur:boolean}] } | null, found, percent }] }`
- Generate teasers when the data updates (after each debrief, in Inngest), not on page load.

### Today's read
- One sentence per debrief, generated alongside extraction.
- Practical, on her side, never preachy. No therapy or diagnosis language (see `docs/acuity-positioning.md`).

### Guidance engine ("What your debriefs are telling you")
- **Input:** extracted tasks (with categories and time-to-done), mood scores, themes, people, habit mentions, and day-of-week patterns.
- **Output per card:**
  - `{ id, tag, evidence, title, why, step, action: 'add_task' | 'add_habit' | 'reminder', actionPayload }`
  - plus one `oneChange` card per week.
- **Actions:**
  - "Add to my plan" creates a real Task.
  - "Make it a habit" creates or attaches a Habit.
  - "Not for me" stores a dismissal and suppresses that pattern type for that user. Log every action and dismissal; they're our best signal for which advice lands.
- **Refresh:** after each debrief, with the one change refreshed weekly.
- **Claims rule:** observe and suggest; never diagnose or claim to treat.

### Days-recorded chip
- Reads `daysRecorded`, `weekDots` and `bestWeek` from the same endpoint.

## 6. Build order (suggested)

| Phase | Ships | Why first |
|---|---|---|
| **1 (week 1)** | New tokens + glass card component, floating tab bar with Record in the center, 4-tab structure, Home header + days chip, Record prompt chips | Visible change fast; mostly UI |
| **2 (week 2)** | "I caught N things" screen + Today's read, Plan merge (Today/Tasks/Habits/Goals) | The day-1 payoff, our biggest retention lever |
| **3 (week 3)** | Unlock system + `/api/insights/path`, stepper, ready card, What's next with real teasers, reveal + burst, unlock pushes | The reason to come back |
| **4 (week 4)** | Insights dashboard: guidance engine + action buttons, mood chart, themes, people, follow-through | Turns insight into change |
| **5** | Dark mode pass, haptics, swipe gestures, "See an example" on locked items, shareable milestone cards | Polish + word of mouth |

Phases 1–2 are mostly JS and can go out by OTA (`npm run ota`), as long as no new native modules are added. Haptics use `expo-haptics`, which is already installed.

## 7. Open questions
1. Should Life Matrix stay at all, or live only inside the Day 7 report? (Keenan found the area bars low-impact.)
2. Exact unlock push copy and send times. These must not pin the product to a time of day.
3. Does the server-controlled onboarding (`/admin/app-onboarding`, built 10-31) need the new look in the same release?
