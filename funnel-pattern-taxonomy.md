# Funnel Pattern Taxonomy v2 — Deterministic Label System

> **Status:** DRAFT v2 — awaiting Keenan's final approval before any code is written.  
> **Date:** 2026-06-23  
> **Purpose:** Map funnel answers → fixed pattern labels → personalized result screen (pre-paywall emotional payoff).

---

## How the Real Funnel Works (vs. the Stale Spec)

The stale `acuity-onboarding-spec-v2.md` describes 5 universal diagnostic questions. **The real code is different.** Here's what actually exists in `funnel-config.ts` + `onboarding-funnel.tsx`:

| Step | ID | Question | Notes |
|---|---|---|---|
| 1 | `entry` | "What's been on your mind lately?" | 6 options → 6 branches (blur, patterns, rumination, graveyard, mask, drift) |
| 2–4 | `branch_q2`–`branch_q4` | **Different per branch** (e.g. blur asks "What does a typical day feel like?", patterns asks "What keeps repeating?") | Not universal — each branch has its own 3 questions |
| 5 | `shared_q5` | "How long have you felt this way?" | Universal. 4 options: A few weeks / A few months / Over a year / Can't remember |
| 6 | `shared_q6` | "What's it costing you most?" | Universal. **Single-select** (⚠️ changed from multi-select — see §3). Energy / Relationships / Health / Career / Sense of self / Time |
| 7 | `shared_q7` | "When you imagine things actually changing, you feel…" | Universal. Hopeful / Skeptical / Scared / Desperate |
| 8 | `shared_q8` | "How does your brain feel at the end of most days?" | Universal. Scattered / Foggy / Racing / Empty / Fine (mornings worse) |
| 9 | `shared_q9` | "What's one pattern you'd like to stop?" | Universal. Snapping / Putting others first / Starting & fizzling / Replaying worries |

**Step order after questions:** tally → mirror → gap1 → gap2 → gap3 → mechanism → commit → processing → pattern-result → timeline → **create-account** → **savings (paywall)** → download

**There is no separate "promise screen."** The stale spec's Screen 8 doesn't exist. The mirror screen and (former) snapshot screen are the two main personalized reflection points. Both already use the branch system for personalization. See §6 for snapshot replacement recommendation.

---

## 1. PRIMARY PATTERN — mapped from the Entry Question (branch)

The entry question IS "the loop" — it's the moment the user identifies what's eating at them. Each branch maps to one primary pattern label.

| Entry answer | Branch | Primary Pattern | Loop line (shown on result screen) |
|---|---|---|---|
| "My days blur together and nothing sticks" | `blur` | **Mental Overload** | "Your days run together without registering — not because nothing happens, but because nothing lands." |
| "I keep having the same fights and patterns" | `patterns` | **Relational Looping** | "The same conversations keep cycling without resolving — different words, same feeling." |
| "My brain won't stop at night" | `rumination` | **Racing Mind** | "Your brain keeps processing a backlog it never gets to clear — so it replays instead." |
| "I've tried journaling, apps, therapy — nothing worked" | `graveyard` | **System Fatigue** | "You've tried the right things — they just weren't built for how your mind actually works." |
| "I'm holding it together but barely" | `mask` | **Invisible Load** | "You're carrying everything for everyone — and nobody sees the cost because you've made sure they don't." |
| "I had goals once. I don't know where they went" | `drift` | **Drifted Off-Course** | "You know what you want — it just never converts into motion, and another month slips by." |

**No fallback needed** — every user selects exactly one entry option, so every user gets a primary pattern.

---

## 2. SECONDARY PATTERN — mapped from shared_q9 (pattern to stop) + shared_q5 (duration)

Since the real funnel has no universal "failed attempts" question (that's graveyard-branch-specific), the secondary pattern maps from **shared_q9** ("What's one pattern you'd like to stop?") — this is the user's self-identified behavior they want to change.

| shared_q9 answer | Secondary Pattern |
|---|---|
| "Snapping at people I love, then feeling guilty" | **Overflow** |
| "Putting everyone else first until I have nothing left" | **Last on the List** |
| "Starting things and watching them fizzle" | **Follow-Through Decay** |
| "Replaying the same worries on a loop" | **Rumination Spiral** |

### Duration Override

If `shared_q5` = "Over a year" OR "I can't remember when it started" → secondary becomes **Stuck Deep** regardless of shared_q9 answer.

**Rationale:** When someone has been stuck this long, the entrenchment IS the secondary pattern — whatever behavior they named in Q9 has calcified into identity, not just habit. This override also guarantees the result screen reads differently for long-timers vs. recent-onset users.

### Primary/Secondary Collision Rule

If the assigned secondary pattern is functionally redundant with the primary pattern, do NOT show the secondary on the result screen. Instead:
1. If duration qualifies (shared_q5 = "Over a year" or "Can't remember") → fall through to **Stuck Deep** as secondary.
2. If duration does NOT qualify → suppress the secondary line entirely. Show primary + area + body copy only (no "Secondary signal" row on the result screen).

**Explicit collision pairs (testable):**

| Primary | Secondary | Collision? | Reason |
|---|---|---|---|
| Racing Mind | Rumination Spiral | ✅ YES | Both describe the same mental replay loop — "racing mind" and "rumination spiral" are synonyms in the user's experience. Showing both would feel like the system is padding. |

All other primary/secondary combinations are non-colliding. This table should be extended if new patterns are added.

**Implementation:** The pure function checks `if (primary === "Racing Mind" && secondary === "Rumination Spiral")` → apply fallthrough/suppress logic. This is a simple lookup, not fuzzy matching.

### Multi-select note

shared_q9 is single-select in the current code (`multiSelect` is not set), so no precedence order is needed.

---

## 3. MOST-AFFECTED AREA — mapped from shared_q6 (the cost)

### Change from current funnel: single-select

The current code has shared_q6 as **multi-select** with the prompt "What's it costing you?" — this created ambiguity in the v1 draft (first-selected heuristic, "(and N more)" display logic).

**v2 change:** shared_q6 becomes **single-select** with the question reworded to **"What's it costing you most?"** This forces the user to name their primary cost, producing a clean 1:1 mapping with no disambiguation needed.

⚠️ **Phase 2 implementation step:** Change `multiSelect: true` to `multiSelect: false` (or remove the property) on shared_q6 in `funnel-config.ts`, and update the question text from "What's it costing you?" to "What's it costing you most?" This also affects `buildGap1Content()`, `getGap2Header()`, and `formatCostShort()` which currently expect an array — they'll need to handle a single string. Flag this as a code change during Phase 2.

| shared_q6 answer | Most-Affected Area label |
|---|---|
| "My energy" | **Energy** |
| "My relationships" | **Relationships** |
| "My health" | **Health** |
| "My career" | **Career** |
| "My sense of self" | **Identity** |
| "Time I can't get back" | **Time** |

No fallback needed — the step is required and single-select guarantees exactly one answer.

---

## 4. PATTERN-SPECIFIC BODY COPY — Anti-Barnum Requirement

Each primary pattern gets a distinct "you're not lacking X, you're carrying Y" body sentence. Two users with different entry answers MUST see visibly different explanations.

| Primary Pattern | Body copy |
|---|---|
| **Mental Overload** | "You're not lacking memory — you're lacking a surface for your days to land on. When nothing captures what happened, everything flattens into noise." |
| **Relational Looping** | "You're not lacking communication skills — you're missing the 48-hour view. The trigger isn't the fight. It's what built up in the days before it." |
| **Racing Mind** | "You're not lacking calm — you're carrying a processing backlog. Your brain replays at night because your day never gave it space to finish." |
| **System Fatigue** | "You're not lacking discipline — you've been using tools that ask too much. Blank pages, daily prompts, meditation timers — none of them met you where you actually are." |
| **Invisible Load** | "You're not lacking strength — you're spending all of it on everyone else. The mask works so well that nobody thinks to ask what's underneath." |
| **Drifted Off-Course** | "You're not lacking ambition — you're lacking a mirror. The gap between who you are and who you meant to be grows invisibly, one week at a time." |

---

## 5. RESULT SCREEN TEMPLATE

This screen renders BEFORE the paywall. It replaces the existing snapshot screen (see §6 for reasoning). It is the emotional payoff that justifies the price.

### Layout (single screen, no scroll needed on mobile)

```
┌─────────────────────────────────────┐
│                                     │
│  Your pattern:                      │
│  ─────────────                      │
│  {PRIMARY PATTERN}                  │  ← large, bold (e.g. "Mental Overload")
│                                     │
│  Secondary signal:                  │  ← OMITTED if collision rule triggered
│  {SECONDARY PATTERN}                │     and no Stuck Deep fallthrough
│                                     │
│  Most affected area:                │
│  {AREA}                             │  ← pill/tag style (e.g. "Energy")
│                                     │
│  ───────────────────────────────     │
│                                     │
│  "{LOOP LINE}"                      │  ← italic, the branch-specific loop sentence
│                                     │
│  {BODY COPY}                        │  ← the anti-Barnum paragraph from §4
│                                     │
│  ───────────────────────────────     │
│                                     │
│  What Acuity tracks for you:        │
│  • Recurring thoughts               │
│  • Avoided tasks                     │
│  • Life-area trends                  │
│  • Weekly patterns                   │
│                                     │
│  [ See what Acuity finds → ]        │  ← CTA button, advances to timeline
│                                     │
└─────────────────────────────────────┘
```

### Example render: Mental Overload + Rumination Spiral + Energy (short duration — no override, no collision)

> **Your pattern: Mental Overload**  
> Secondary signal: Rumination Spiral  
> Most affected area: Energy  
>
> *"Your days run together without registering — not because nothing happens, but because nothing lands."*  
>
> You're not lacking memory — you're lacking a surface for your days to land on. When nothing captures what happened, everything flattens into noise.  
>
> **What Acuity tracks for you:** recurring thoughts, avoided tasks, life-area trends, and weekly patterns.

### Example render: Invisible Load + long duration → Stuck Deep override + Relationships

> **Your pattern: Invisible Load**  
> Secondary signal: Stuck Deep  
> Most affected area: Relationships  
>
> *"You're carrying everything for everyone — and nobody sees the cost because you've made sure they don't."*  
>
> You're not lacking strength — you're spending all of it on everyone else. The mask works so well that nobody thinks to ask what's underneath.  
>
> **What Acuity tracks for you:** recurring thoughts, avoided tasks, life-area trends, and weekly patterns.

### Example render: Racing Mind + Rumination Spiral → COLLISION, short duration → secondary suppressed

> **Your pattern: Racing Mind**  
> Most affected area: Health  
>
> *"Your brain keeps processing a backlog it never gets to clear — so it replays instead."*  
>
> You're not lacking calm — you're carrying a processing backlog. Your brain replays at night because your day never gave it space to finish.  
>
> **What Acuity tracks for you:** recurring thoughts, avoided tasks, life-area trends, and weekly patterns.

*(No "Secondary signal" row — collision rule suppressed it and duration didn't qualify for Stuck Deep.)*

### Example render: Racing Mind + Rumination Spiral → COLLISION, long duration → falls through to Stuck Deep

> **Your pattern: Racing Mind**  
> Secondary signal: Stuck Deep  
> Most affected area: Identity  
>
> *"Your brain keeps processing a backlog it never gets to clear — so it replays instead."*  
>
> You're not lacking calm — you're carrying a processing backlog. Your brain replays at night because your day never gave it space to finish.  
>
> **What Acuity tracks for you:** recurring thoughts, avoided tasks, life-area trends, and weekly patterns.

---

## 6. FUNNEL PLACEMENT — Pattern-Result REPLACES Snapshot (Recommendation)

### Recommendation: (a) pattern-result REPLACES snapshot — one consolidated reflection screen.

### Current snapshot screen content (3 sections)

The live `SnapshotScreen` component renders three sections:

1. **"The pattern you can't see"** — a single paragraph interpolated from branch + branch_q2/q3/q4 answers (via `getSnapshotInsight()`). Example for blur: *"You described your days as autopilot. The pattern you'd most want to stop — replaying the same worries on a loop — is connected. That gap between how you're living and what you're trying to change is visible within a few debriefs."*

2. **"What one week reveals"** — three simulated weekly-report excerpts (branch-specific, not answer-personalized). Example for blur: *"Monday–Wednesday: high task volume, zero reflection…"*

3. **Bottom line** — a one-sentence branch-specific CTA. Example for blur: *"Your days have a pattern. You just can't see it from inside them. One week of Acuity and you will."*

### Why replace, not keep both

**Content overlap is high.** The snapshot's Section 1 ("The pattern you can't see") does the same job as the pattern-result screen — it names the user's pattern and reflects their answers back. Having both means the user sees two consecutive screens doing fundamentally the same thing: "here's your pattern." The first one (pattern-result) does it with clear labels and anti-Barnum copy; the second (snapshot) does it with looser interpolation. Keeping both dilutes impact and adds a screen before the paywall.

**Screen count matters.** The current funnel already has 7 screens between the last question and the paywall: tally → mirror → gap1 → gap2 → gap3 → mechanism → commit → processing → snapshot → timeline → create-account → savings. That's a long runway. Adding pattern-result WITHOUT removing snapshot makes it 8. Replacing snapshot with pattern-result keeps it at 7 and makes the result screen the definitive "here's what we found" moment.

**The snapshot's weekly-report previews are salvageable.** The simulated report excerpts (Section 2) are strong social proof. Rather than losing them entirely, they can be absorbed into the **timeline screen** (which already shows Week 1–4 copy) as a "preview" callout within Week 2, or moved to the paywall as a proof element. This is a follow-up decision — the pattern-result screen works without them.

### Proposed step order (snapshot removed)
```
... → processing → pattern-result → timeline → create-account → savings (paywall) → download
```

---

## 7. PROMISE SCREEN UNIFICATION — Proposal (do not build yet)

### Current state
There is **no separate promise screen** in the live funnel. The stale spec's Screen 8 ("promise") was never built, or was absorbed into other screens.

The closest equivalent is the **mechanism screen** (step after gap3), which explains HOW Acuity works — "Talk for 60 seconds → AI extracts patterns → Weekly report connects the dots." It includes some personalized copy via branch but doesn't reference the user's specific answers.

### Proposal
After the pattern-result screen is built and approved, unify the mechanism screen to reference the same taxonomy:

1. **Replace the generic mechanism headline** with a pattern-aware one:
   - Current: generic product explainer
   - Proposed: "Here's how Acuity tracks your **{primary pattern}**" — then show the 3-step mechanism (talk → extract → report) with the loop line as the example input

2. **Feed the taxonomy into the timeline screen** (which now directly follows pattern-result):
   - Open with "Your **{primary pattern}** has a trigger hiding in plain sight…" then show the Week 1–4 journey with optional weekly-report preview excerpts (migrated from the removed snapshot)

This keeps mechanism → … → pattern-result → timeline as one coherent story: "Here's your pattern → Here's how we track it → Here's what changes week by week."

**Do not build this yet.** Approve the pattern-result screen first; then we unify in a follow-up pass.

---

## 8. ANALYTICS EVENT

On result screen render, fire:

```
funnel_pattern_assigned: {
  primary: "Mental Overload",
  secondary: "Rumination Spiral",       // or null if collision-suppressed
  area: "Energy",
  branch: "blur",
  duration: "Over a year",
  stuck_deep_override: true,            // true if duration override applied
  collision_suppressed: false            // true if secondary was hidden due to collision
}
```

This lets us verify the label distribution is actually branching (not collapsing everyone into one pattern) and correlate pattern assignments with downstream conversion. The collision/override flags let us audit the rule logic from analytics alone.

---

## 9. IMPLEMENTATION NOTES (for Phase 2, after approval)

- **Pure function:** `getPatternLabels(branch, answers) → { primary, secondary, area, bodyCopy, loopLine, secondaryVisible, stuckDeepOverride, collisionSuppressed }` in `funnel-config.ts`. No API call. Fully unit-testable.
- **shared_q6 change:** Remove `multiSelect: true`, update question text to "What's it costing you most?" Update `buildGap1Content()`, `getGap2Header()`, and `formatCostShort()` to handle single string instead of array.
- **Snapshot removal:** Remove `"snapshot"` from `Step` type and `STEP_ORDER`. Remove `SnapshotScreen` component. Migrate `SNAPSHOT_PREVIEWS` content to timeline or paywall if desired (follow-up decision).
- **New step:** Add `"pattern-result"` to `Step` type and `STEP_ORDER` array after `"processing"`, before `"timeline"`.
- **New component:** `PatternResultScreen` in `onboarding-funnel.tsx`, following existing screen component patterns.
- **Collision logic:** Explicit `if` check — only the `Racing Mind` + `Rumination Spiral` pair collides. Extend the list if new patterns are added.
- **Analytics:** Use existing `track()` function with `funnel_pattern_assigned` event.
- **No new dependencies.** Pure deterministic mapping + existing React component patterns.
