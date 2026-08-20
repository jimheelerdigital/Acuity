# Ripple — Onboarding v10 Layout Spec

**Status:** For Jimmy's review · supersedes v8 and the external v9
**Date:** Aug 15, 2026 · iOS + Android (Expo)
**North-star action:** first debrief completed + reveal viewed, per fresh install
**Day-0 revenue action:** trial start or purchase on the reveal-adjacent paywall

---

## 0. What changed from v8, and why

**Taken from v9 (it was right):**
- **Paywall moves directly after the reveal, before account and reminders.** v8 spent the emotional peak on credentials. Purchases via StoreKit/Play don't need an account; entitlement lives on the anonymous RevenueCat ID and is claimed at signup.
- **Tap two starts recording.** "Start my debrief" opens disclosure + mic permission, then Screen 3 opens already recording. Chips become optional prompts *during* recording, never a gate.
- **"About a minute," and a soft floor.** At ~20s: "That's enough for Ripple to begin finding the threads." No countdown, no minimum.
- **"Just let me talk" as a sixth branch.** Nobody is forced into a category.
- **Grounded reveal language.** No mind-reading claims; every observation is qualified and tied to the transcript.
- **Restrained celebration.** Coral pulse + haptic, no confetti. A vulnerable moment isn't a party.
- **Guest recovery.** Backgrounding before a plan decision returns her to the reveal with her result still there.
- **Compliance the v8 draft missed:** Restore Purchases / Terms / Privacy on the paywall; idempotent entitlement claim; trial-status card with exact renewal date; day-5 reminder only via channels she enabled.
- **Clean baseline first, one test at a time.** No 20% holdout at launch — volume is too low for it to read.
- **Latency rule** (>10s → honest disclosure + retry) and richer event contract.

**Rejected from v9 (it was wrong, or unsupported):**
- **Monthly default.** 2026 data says monthly is the weakest plan type at every price tier; journaling sits in Health & Fitness where annual dominates and grows; AI apps win on annual-with-trial. Annual stays pre-selected; default plan is A/B test #2.
- **Removing the compounding preview from the reveal and making it its own screen.** Fold it into the bottom of the reveal.
- **Reminder options "Tomorrow / In a few days / Weekly."** Weaker habit anchor than a self-chosen daily slot. Keep the slot question; adopt v9's no-guilt primer line.
- **3-debriefs/month free cap.** A cap on the core action generates Rosebud's angry reviews; free-forever voice is the stated promise. Gate insight, not input. Allowance is A/B test #5 with an AI-cost read.
- **Blanket removal of the $156 / $12.99 anchors.** They're only false if $12.99 isn't a real price. Both framings specified below; Keenan decides which is true.

**Kept from v8 over v9:**
- Annual pre-selected, 7-day trial on annual only, monthly starts today.
- Slot-based check-in question after account.
- Locked previews with real thresholds *if the product actually gates at those thresholds* (Jimmy confirms N).
- Want-engine observation card — renamed, hedged, but not neutered.

---

## 1. Hard rules
- The word is **debrief**. Never "brain dump", "journal entry", "check-in".
- No bedtime / nightly / morning-routine / ritual framing of the mechanism.
- No medical, diagnostic, therapeutic, or guaranteed-outcome claims.
- No account or paywall before the first recording and reveal.
- No invented metrics, fake progress, synthetic testimonials, or insight not supported by the transcript.
- No logo or brand name until the reveal.
- No free-trial toggle. No fake strike-through prices.
- All prices/renewal language from central store config + localized product metadata.
- Screens 1–2 dark; 3+ light.

---

## 2. Pricing

| Plan | Price | Trial | Default | Savings display |
|---|---|---|---|---|
| Yearly | $79.99/yr | 7 days | **Pre-selected** | see below |
| Monthly | $8.99/mo | none — bills today | — | — |

**Anchor decision (Keenan):**
- **Option A — $12.99 is a real regular monthly price** (dated launch window at $8.99, or web/list at $12.99): monthly card shows ~~$12.99~~ $8.99 "Launch price until {date}"; annual card shows ~~$156/yr~~ $79.99 "vs paying monthly". Compliant.
- **Option B — $8.99 is just the price:** no strike-throughs. Annual shows "$6.67/mo · Save 26%" (vs $107.88). Compliant. Ship one. Do not ship a strike-through without a real price behind it.

New StoreKit/Play products + new Stripe Price IDs, all through the central pricing config. Grep and replace every "$4.99" and "$39.99".

---

## 3. Flow map

```
[1 Recognition] → [2 Mirror + Start] → [3 Recording] → [4 Processing]
  → [5 Reveal + what compounds] → [6 Paywall] → [7 Save/account]
  → [8 Check-in time] → [9 Home]

Guest recovery: background before Screen 6 decision → reopen lands on Screen 5 with
  banner "Your first debrief is still here" → same paywall/free decision.
webOnboardingCompleted → start at Screen 2 (mirror is universal for them).
```

Two product taps to active recording: branch (1) → Start my debrief (2). Native disclosure/permission taps excluded from the count but measured.

---

## 4. Screens

### Screen 1 — Recognition (dark)
Headline: **What's taking up the most space in your head right now?**

| Card | Support line | key |
|---|---|---|
| The load | Everyone's list lives in my head. | overload |
| The cycle | Same problems. Same week. Again. | patterns |
| The loop | I keep replaying it. | rumination |
| The treadmill | Busy all day. Nothing moves. | stuck |
| The mask | Holding it together for everyone else. | mask |
| Just let me talk | I don't need a category. | open |

Tap = store branch + auto-advance. No Continue, no logo. Events: `v10_recognition_viewed`, `v10_branch_selected {branch}`

### Screen 2 — Mirror + Start (dark; button is the first light element)
Branch line (large):
- overload — "You carry the list for everyone. It never really leaves your head."
- patterns — "You already know how this week goes. You've lived it before."
- rumination — "You replay it. Then you replay the replay."
- stuck — "Every day is full. None of it feels like progress."
- mask — "Everyone thinks you've got it. Nobody asks if you do."
- open — "Whatever's there. No category needed."

Universal line: **"You don't have to become someone who journals. Just say what's there once — about a minute — and see what comes back."**

CTA (coral): **Start my debrief**
- Tap → AI-disclosure sheet (names OpenAI Whisper + Anthropic Claude, "Got it") → native mic permission → Screen 3 opens already recording, with a 1-second "Listening…" fade-in so it isn't a jump-scare.
- Mic denied → stay here, reveal typed debrief field inline. Never Settings-only.
Events: `v10_mirror_viewed {branch}`, `v10_start_tapped {branch}`, `v10_mic_result {granted|denied}`

### Screen 3 — Recording (light)
- Top prompt: "What's been taking up the most space in your head?" (branch prompt underneath)
- Guidance: "Speak naturally. Pause, ramble, change subjects, stop whenever."
- Waveform + elapsed (or streamed transcript if pipeline supports)
- At ~20s, stays: "That's enough for Ripple to begin finding the threads."
- OPTIONAL chips, tapping swaps the top prompt; recording never pauses: [what's on my list] [what's bugging me] [how today went]
- Large coral STOP.
- No countdown, no minimum. Recording to existing max.
- Live transcript only if the pipeline can genuinely stream partial text; otherwise waveform + elapsed. Never simulate. Note which shipped.
- Preserve draft audio on interruption where possible; processing failure → retry without re-recording.
- Anonymous upload path; result persisted device-scoped.
Events: `v10_recording_started {input}`, `v10_chip_tapped {chip}`, `v10_recording_completed {duration_s, input, retry_count}`

### Screen 4 — Processing (light)
Headline: **Turning your debrief into something useful…**
Stages (real, determinate): 1 Organizing what you shared · 2 Finding what needs your attention · 3 Pulling out your clearest next steps
- Existing slide deck stays. One real, attributed testimonial slide. **Remove** "most people find their first pattern by debrief #3" until cohort data supports it.
- 10s → honest wait message + safe retry/background option.
Events: `v10_processing_viewed`, `v10_processing_latency {ms}`

### Screen 5 — Reveal + what compounds (light; Ripple wordmark appears, small)
Layout:
- "ripple / Here's what Ripple heard."
- TASKS (up to 3): checkboxes. Add / Edit / Dismiss. **Never auto-add uncertain tasks.**
- WHAT SEEMS TO MATTER: 2–3 lines, echoes concrete details from the transcript.
- SOMETHING WORTH NOTICING (boxed): the want-engine, hedged. Body must use "sounds like / seems / may". Low confidence → branch fallback line.
- ● First debrief complete — coral pulse + haptic. No confetti.
- WHAT RIPPLE CAN SEE FROM MORE: compounding strip, blurred cards [Patterns] [Life Matrix] [Weekly report]. Sublines: real thresholds ONLY if the product gates at them (Jimmy confirms N); else "as you return". "Each time you return, Ripple connects what changes — and what keeps repeating."
- CTA: **Keep building my Ripple** → Screen 6 immediately.

Branch fallback for the observation card: overload "{n} things off your head. Nothing lost." · patterns "First entry down. Patterns need a few more." · rumination "It's out of your head and on the screen." · stuck "Here's what actually happened today, in writing." · mask "This one's just for you." · open "Said once. Kept." The observation sentence is stored and reused on the paywall.
Events: `v10_reveal_viewed {task_count, observation_type, latency_ms}`, `v10_compounding_viewed`, `v10_keep_building_tapped`

### Screen 6 — Paywall (light, single screen, no scroll on iPhone SE)
**Position:** immediately after the reveal, before any account or reminder step. **Model:** soft — "Continue with Free" visible but low emphasis. Hard-vs-visible-free is A/B test #3.
- Z1 personalized header (only real counts). Observation sentence italic beneath.
- Z2 honest timeline (annual selected): Today Everything unlocked · Day 5 We remind you · Day 7 First patterns start showing. You decide. (Monthly selected → one line: "Starts today. Cancel anytime.")
- Z3 plans — ANNUAL PRE-SELECTED. YEARLY Best value·7 days $79.99/yr $6.67/mo Save 26% · MONTHLY Start smaller $8.99/mo Starts today. (Option A adds ~~$156/yr~~ "vs paying monthly" / ~~$12.99~~ "Launch price until {date}"; Option B shows "Save 26%" only.)
- Z4 mini table — Free vs Ripple: Debriefs + tasks ✓/✓ · Patterns —/✓ · Life Matrix —/✓ · Weekly report —/✓
- Z5 trust line — ★ 4.9 · one ≤20-word branch-matched testimonial
- Z6 CTA — annual: "$0 today. $79.99/yr after 7 days unless you cancel." Monthly selected → CTA "Start Ripple — $8.99 today", fine print "Billed today. Renews monthly until canceled."
- Z7 low-emphasis text link (Continue with Free). Z8 required footer (Restore Purchases · Terms · Privacy).
- CTA is never "Subscribe" / "Continue".
- Trial: 7 days, annual only. No 14/30-day trial logic anywhere.
- Purchase happens on the anonymous RevenueCat/StoreKit identity; entitlement must survive account-creation failure and be restorable.
- Day-5 push (if push enabled) + email (only if a verified email exists) on annual trial start. Trial-status card on Home shows exact renewal date + price.
- No post-close discount in this build (later test).
Events: `v10_paywall_viewed {branch, selected_plan, variant}`, `v10_plan_toggled {plan}`, `v10_plan_decision {monthly|annual|free|background}`, `v10_purchase_completed {product_id, price, currency}`

### Screen 7 — Save / account (light)
- Paid/trial copy: **"Your Ripple has started. Save your first debrief so patterns can begin connecting."**
- Free copy: **"Keep your first insight. Save this debrief and come back whenever your head is full."**
- Continue with Apple · Continue with Google · Sign up with email. Small "Later" link (guest mode; see §5).
- Claim of anonymous entry + entitlement is idempotent; failure never discards either.
Events: `v10_save_viewed {paid_state}`, `v10_save_later`, `v10_account_completed {method, paid_state}`

### Screen 8 — Check-in time (light, signed-in only)
Headline: **"{Name}, when do you usually want to think out loud?"** Options: Morning · Midday · After work · Late · No reminders
- Slot chosen → primer line: "Want Ripple to nudge you then? No guilt, no streaks — just a tap when it helps." → then the OS prompt.
- "No reminders" → never fire the OS prompt.
- Store `reminder_slot` + tz. Cron: one daily push at slot local time (8:00 / 12:30 / 17:30 / 21:00). Audit push copy pool for bedtime/evening wording. Cron change may ship as follow-up if out of scope.
Events: `v10_reminder_viewed`, `v10_reminder_selected {slot}`, `v10_os_push_prompt {result}`

### Screen 9 — Home
- Never an empty dashboard. First result visible + editable. Primary action: Start a debrief.
- Pinned card after #1: **"One debrief gave you a snapshot. The next one lets Ripple compare."** After #2: honest progress toward patterns (real state, no fake progress). Card gone at #3.
- Free: locked previews (blurred, tappable → paywall); banner "Free keeps your debriefs and tasks. Patterns and reports unlock with Ripple."
- Trial: compact trial-status card, exact renewal date + price.
- Guest: one debrief + tasks read-only; mic tap → save wall (hard on 2nd tap).
- Suppress old post-signup v1.3 flow for anyone who came through v10.
- Day-2 push (respects slot / default 17:30): "Anything still taking up space? Say it once. Ripple will keep track." One only.

---

## 5. Free tier & upgrade moments

| Capability | Free forever | Ripple (PRO) |
|---|---|---|
| Voice debriefs | Unlimited (launch) | Unlimited |
| Transcript + tasks | ✓ | ✓ + full history |
| Patterns | preview | full |
| Life Matrix | preview | full |
| Weekly report | title + blurred body | full |

Upgrade moments (each capped, never spam): after debrief #3 (once) · tap on locked Patterns/Life Matrix · first weekly-report preview ("See what Ripple connected"). Free allowance/history limits are **A/B test #5**, not a launch change.

---

## 6. Lifecycle (first 7 days)

| Moment | State | Message |
|---|---|---|
| Immediately | all | Home points to debrief #2; no tutorial |
| 24–72h | reminders on | "Anything still taking up space? Say it once. Ripple will keep track." |
| After #2 | all | honest progress toward patterns |
| After #3 | free | "You've given Ripple enough to start connecting the dots." → paywall |
| Day 5 | annual trial | exact end date + $79.99 renewal, enabled channels only |
| Report ready | paid/trial | "Your first weekly view is ready." |
| Report preview | free | title + blurred body → paywall |

Tone: no guilt, streaks, scarcity, ritual framing. Every push deep-links. Suppress if action already done.

---

## 7. Analytics
Primary metric: activation = first debrief completed + reveal viewed / fresh install. Every event carries `flow_version:'v10'`, platform, source, experiment assignment. Dashboard ratios: start_tapped/branch_selected · recording_started/mic_granted · recording_completed/recording_started · reveal_viewed/recording_completed · paywall_viewed/reveal_viewed · annual trial/paywall_viewed · monthly purchase/paywall_viewed · any paid decision/install · debrief #2 within 72h/activated · trial-to-paid, D7, D30 revenue per install by variant + source. Every event proven with a DB row.

---

## 8. Experiments (after a clean baseline; one at a time; assignment persisted at install)

| # | Test | Control | Variant | Read |
|---|---|---|---|---|
| 1 | Paywall position | after reveal | after account (v8 order) | paid decision / activated user |
| 2 | Default plan | annual | monthly | D30 revenue/install + refunds |
| 3 | Free visibility | Continue with Free visible | hard, free on return | paid/install + activation + D7 |
| 4 | Headline | personalized | outcome-led ("Stop carrying everything in your head") | paid / paywall view |
| 5 | Free allowance | unlimited | 3/mo or history-limited | upgrade rate + D30 + AI cost |

Decision rule: D30 revenue per install, guardrails on activation, D7, refunds, complaints. More trial starts with fewer renewals is not a win. Rollout: internal test accounts per branch/permission/purchase/interrupt state → 10% → 50% → 100%; hold one full renewal window before the next structural change.

---

## 9. Acceptance checklist (fresh install, iOS + Android)
- [ ] Two product taps to active recording; no logo before reveal; dark→light intact
- [ ] Disclosure sheet + mic permission on Start; denied → typed field inline on Screen 2
- [ ] Recording opens already listening with fade-in; ~20s "enough" line; chips optional
- [ ] Anonymous result persists through background, restart, purchase, later claim; guest recovery lands on reveal
- [ ] Processing: real stages, no fake transcript/percentage/statistic; >10s honest wait
- [ ] Reveal: tasks (≤3, controls), synthesis, hedged observation or fallback, pulse+haptic, compounding strip with true thresholds
- [ ] Paywall appears immediately after reveal; annual pre-selected; correct anchor option (A or B) rendered; annual CTA "Start my 7-day free trial", monthly CTA "Start Ripple — $8.99 today"; Continue with Free, Restore, Terms, Privacy visible
- [ ] Purchase without account works; entitlement survives signup failure; restore works
- [ ] Save screen copy varies by paid_state; Later → guest; claim idempotent
- [ ] OS push prompt fires only after slot + primer; "No reminders" never fires it
- [ ] Home never empty; pinned card logic; trial card exact date/price; free locks tappable
- [ ] Day-5 push/email and Day-2 push scheduled via enabled channels only
- [ ] Grep: zero "brain dump", "tonight", "bedtime", "evening ritual", "$4.99", "$39.99"
- [ ] All v10 events with flow_version + assignment; admin funnel v10 view with ratios
- [ ] Remote flag OFF restores previous flow without data loss

---

## 10. Open decisions (Keenan)
1. Anchor Option A (real $12.99 with dated launch window → keep strike-throughs) or Option B (no strike-throughs, "Save 26%").
2. Reminder cron change in this run or follow-up.
3. Live transcript on Screen 3 now, or waveform for v10.0.

## 11. Questions for Jimmy
1. Does the disclosure sheet on "Start my debrief" satisfy the App Review note we passed with?
2. Can purchase → later account claim be made idempotent on RevenueCat anonymous IDs across iOS + Play + Stripe web restore?
3. What N does the product actually need before Patterns / Life Matrix show something useful? (Drives the compounding-strip sublines.)
4. Can the pipeline stream partial transcript without major work?

---

## Appendix — answers to CC's Phase-1 blockers (from Cowork, verified against prod data)

- **Compounding-strip thresholds (spec Q3 / "Jimmy confirms N"):** verified against the live DB. Patterns (UserInsight) appear ~2 entries (median). **Life Matrix EXISTS at 0 entries** (seeded from the dimension preset) — it is NOT a threshold unlock; do not present it as "locked until N". Weekly report needs ~9+ entries (median 37). Enforce these in the compounding strip and §5 previews.
- **Purchase → account claim idempotency (spec Q2):** yes — this is the RevenueCat anonymous-id → `Purchases.logIn(User.id)` aliasing already wired in auth-context.tsx. Build on it.
- **Live transcript (open decision #3):** ship waveform + elapsed for v10.0 unless the pipeline can genuinely stream partial text; never simulate.
