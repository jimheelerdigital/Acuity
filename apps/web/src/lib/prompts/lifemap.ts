/**
 * Claude prompts for Life Matrix memory compression, insight generation,
 * and life area extraction. All prompts use the canonical 6-area
 * vocabulary defined in `@acuity/shared` (`LIFE_AREAS`,
 * `LIFE_AREA_PROMPT_KEYS`, `LIFE_AREA_DISPLAY`).
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
  "health": "updated summary",
  "relationships": "updated summary",
  "finances": "updated summary",
  "personal": "updated summary",
  "other": "updated summary"
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
  "health": "insight",
  "relationships": "insight",
  "finances": "insight",
  "personal": "insight",
  "other": "insight"
}`,
    user: `Full user context:\n${memoryContext}\n\nCurrent area scores:\n${areaData}`,
  };
}

// ─── Life Area Extraction Addition (injected into main extraction prompt) ────

export const LIFE_AREA_EXTRACTION_SCHEMA = `
Also extract "lifeAreaMentions" — for each of these 6 areas assess whether it was mentioned:
- career: work, job, projects, ambition, professional stress, wins, deadlines, boss, colleagues
- health: body, energy, sleep, exercise, pain, illness, food, physical wellbeing
- relationships: partner, family, friends, social, conflict, connection
- finances: money, income, savings, financial stress, business, spending, investments
- personal: purpose, meaning, values, gratitude, faith, presence, peace, learning, habits, reading, skills, personal growth
- other: anything important that doesn't fit the above five

For each area, return:
{
  "mentioned": true/false,
  "score": <1-10 how positive this area sounded, 5 if neutral>,
  "themes": ["specific theme"],
  "people": ["names mentioned related to this area"],
  "goals": ["goals mentioned related to this area"],
  "sentiment": "positive" | "negative" | "neutral"
}

Add this as "lifeAreaMentions" with keys: career, health, relationships, finances, personal, other.
If an area is not mentioned at all, set mentioned=false, score=5, and empty arrays.`;
