/**
 * Claude prompts for Life Matrix memory compression, insight generation,
 * and life area extraction. All prompts use the canonical 10-area
 * vocabulary defined in `@acuity/shared` (`LIFE_AREAS`,
 * `LIFE_AREA_PROMPT_KEYS`, `LIFE_AREA_DISPLAY`).
 *
 * Phase D, 2026-05-21: expanded from 6 axes to 10. Per-axis keyword
 * lists below tuned against the Reddit-language reference corpus
 * (docs/Acuity_SalesCopy.md §3) — every axis description leads with
 * words people actually use in nightly journals, not abstract category
 * names. Split-target axes (PHYSICAL_HEALTH / MENTAL_HEALTH from old
 * HEALTH; ROMANCE / FAMILY / FRIENDS from old RELATIONSHIPS; GROWTH /
 * FUN / PURPOSE from old PERSONAL) have disjoint keyword sets so
 * Claude doesn't over-attribute one mention to multiple axes.
 */

// ─── Memory Compression ─────────────────────────────────────────────────────

export function buildCompressionPrompt(
  existingSummaries: Record<string, string | null>,
  recentEntries: { summary: string; themes: string[]; mood: string; entryDate: Date }[]
): { system: string; user: string } {
  const existing = Object.entries(existingSummaries)
    .map(([area, summary]) => `${area}: ${summary ?? "(no data yet)"}`)
    .join("\n");

  const entries = recentEntries
    .map(
      (e, i) =>
        `Entry ${i + 1} (${e.entryDate.toLocaleDateString()}): ${e.summary ?? "No summary"}\n` +
        `  Mood: ${e.mood} | Themes: ${e.themes.join(", ")}`
    )
    .join("\n");

  return {
    system: `You are maintaining a running memory of a user's life patterns based on their voice journal entries. You have their existing memory summaries and their most recent entries.

Your job: update each area summary to incorporate new information while preserving important historical patterns. Each summary must:
- Be 2-4 sentences maximum
- Reference specific patterns with approximate counts or timeframes
- Note what has changed recently vs what has been consistent
- Be written in second person (you/your)
- Sound like a knowledgeable advisor who has been listening for months
- If an area has no new data, preserve the existing summary unchanged

Return ONLY valid JSON — no markdown, no prose:
{
  "career": "updated summary",
  "money": "updated summary",
  "romance": "updated summary",
  "family": "updated summary",
  "friends": "updated summary",
  "physical_health": "updated summary",
  "mental_health": "updated summary",
  "growth": "updated summary",
  "fun": "updated summary",
  "purpose": "updated summary"
}`,
    user: `Existing area summaries:\n${existing}\n\nRecent entries:\n${entries}`,
  };
}

// ─── Insight Generation ──────────────────────────────────────────────────────

export function buildInsightPrompt(
  memoryContext: string,
  areas: { area: string; score: number; trend: string | null; mentionCount: number }[],
  totalDays: number
): { system: string; user: string } {
  const areaData = areas
    .map(
      (a) =>
        `${a.area}: score=${a.score}/100, trend=${a.trend ?? "unknown"}, mentioned ${a.mentionCount} times`
    )
    .join("\n");

  return {
    system: `You have been listening to this user's nightly debriefs for ${totalDays} days. Generate one insight per life area. Each insight must:
- Reference a SPECIFIC pattern (name a number, a timeframe, or a person)
- Note whether this is improving, stable, or declining vs their baseline
- Be under 25 words
- Be written in second person
- Sound like an observation from someone who knows them well

Bad: "You seem to struggle with work-life balance."
Good: "Work appears in 91% of your dumps — the only area that spikes on weekends, suggesting boundary erosion."

Return ONLY valid JSON:
{
  "career": "insight",
  "money": "insight",
  "romance": "insight",
  "family": "insight",
  "friends": "insight",
  "physical_health": "insight",
  "mental_health": "insight",
  "growth": "insight",
  "fun": "insight",
  "purpose": "insight"
}`,
    user: `Full user context:\n${memoryContext}\n\nCurrent area scores:\n${areaData}`,
  };
}

// ─── Life Area Extraction Addition (injected into main extraction prompt) ────

export const LIFE_AREA_EXTRACTION_SCHEMA = `
Also extract "lifeAreaMentions" — for each of these 10 areas assess whether it was mentioned:

- career: work, job, projects, ambition, deadlines, performance, boss, colleagues, promotion, layoff, side hustle, freelance, calling, vocation, workload, meetings, output
- money: salary, income, savings, debt, rent, bills, budget, financial stress, raise, investments, expenses, paycheck, taxes, paying off, broke, comfortable, can't afford
- romance: partner, wife, husband, boyfriend, girlfriend, spouse, dating, marriage, breakup, sex, intimacy, attraction, fights with my [partner], anniversary, falling out of love, falling in love, matched, swiping, ghosted, situationship, talking stage, hinge, bumble
- family: mom, dad, parents, sister, brother, kids, son, daughter, in-laws, holiday, family dinner, ungrateful, helicopter, estranged, family obligations, parenting, raising
- friends: friend, friends, social, hangout, group chat, drifted apart, didn't text back, plans cancelled, community, neighborhood, club, social circle, lonely (in a social-belonging sense), made a new friend
- physical_health: body, sleep, exercise, gym, run, lift, sick, pain, injury, headache, tired, energy, weight, diet, eating, drinking, hangover, soreness, recovery, doctor's appointment, blood work
- mental_health: anxiety, depression, panic, overwhelmed, burnout, therapy, meds, mood, emotional regulation, racing thoughts, can't focus, dissociation, processing trauma, mental fatigue
- growth: learning, reading, course, skill, book I'm reading, podcast, studying, identity, who I want to be, becoming, growth area, leveling up, self-improvement, new habit, mastering
- fun: hobby, gaming, music, painting, hiking, weekend trip, vacation, party, concert, novel reading (for pleasure), garden, just relaxing, did nothing on purpose, watched a movie, binged, played, scrolled, had drinks with, went out, weekend plans
- purpose: meaning, why am I doing this, values, faith, spirituality, prayer, meditation, legacy, what matters, mission, calling (in a deeper sense than career), bigger picture, contribution, what's it all for

Disambiguation rules:
- "career" vs "money": career = the work itself, money = the financial outcome. A bad day at the office → career. Worry about making rent → money.
- "romance" vs "family": exclusively about the partner / dating / spousal dynamic → romance. Anything about parents / siblings / kids / extended family → family.
- "physical_health" vs "mental_health": body / fitness / sleep / energy / illness → physical_health. Anxiety / mood / overwhelm / therapy / processing → mental_health. Sleep that's tied to stress (can't sleep because anxious) → mental_health primary, physical_health secondary.
- "growth" vs "purpose": growth = skill / knowledge / identity development ("I'm learning Spanish", "I want to be more patient"). purpose = meaning / values / why ("what am I doing this for", "does any of this matter"). Growth is HOW you change; purpose is WHY.
- "fun" vs "growth": A hobby done for pleasure → fun. A hobby done to develop a skill or push yourself → growth. Reading a thriller → fun. Reading a textbook → growth.

For each area, return:
{
  "mentioned": true/false,
  "score": <1-10 how positive this area sounded, 5 if neutral>,
  "themes": ["specific theme"],
  "people": ["names mentioned related to this area"],
  "goals": ["goals mentioned related to this area"],
  "sentiment": "positive" | "negative" | "neutral"
}

Add this as "lifeAreaMentions" with keys: career, money, romance, family, friends, physical_health, mental_health, growth, fun, purpose.
If an area is not mentioned at all, set mentioned=false, score=5, and empty arrays. Do not pad — most entries will only mention 2-4 areas explicitly.`;
