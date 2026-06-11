import type { Mood } from "./types";

// ─── App ──────────────────────────────────────────────────────────────────────

export const APP_NAME = "Acuity";
export const APP_TAGLINE = "The daily debrief that turns chaos into clarity.";

// ─── Recording ────────────────────────────────────────────────────────────────

export const MAX_RECORDING_SECONDS = 600; // 10 minutes
export const MIN_RECORDING_SECONDS = 5;

// Pre-upload silence guard (P1, iOS/Android/web). Recording levels are
// normalized 0..1 from device metering (mobile: expo-av dBFS; web: Web Audio
// AnalyserNode RMS) — both mapped -60..0 dB → 0..1. If a recording's PEAK
// level never crossed this threshold, the mic captured nothing meaningful
// (Bluetooth not routing input, muted, wrong device). The client blocks the
// upload so silent audio can't reach Whisper + fail after the fact.
export const SILENCE_PEAK_THRESHOLD = 0.15;

export const NO_SOUND_CAPTURED_MESSAGE =
  "We didn't capture any sound. Please check your mic and try again.";

/** True if the recording's peak normalized level never crossed the speech
 *  threshold — i.e. the recording was effectively silent. */
export function isEffectivelySilentPeak(peak: number): boolean {
  return peak < SILENCE_PEAK_THRESHOLD;
}

// Entry processing (non-terminal) statuses + tappability (Issue A, v1.3.3).
// Single source of truth for the entry-row lock so Home + Entries + web
// can't drift. A processing entry isn't tappable — opening it mid-pipeline
// navigates into a half-baked detail. Terminal: COMPLETE / PARTIAL / FAILED.
export const PROCESSING_ENTRY_STATUSES: ReadonlySet<string> = new Set([
  "QUEUED",
  "PENDING",
  "PROCESSING",
  "TRANSCRIBING",
  "EXTRACTING",
  "PERSISTING",
]);

export function isEntryTappable(status: string | null | undefined): boolean {
  return !PROCESSING_ENTRY_STATUSES.has(status ?? "");
}
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB (Whisper limit)
export const SUPPORTED_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
] as const;

// ─── Life Areas (canonical 10 — Phase D, 2026-05-21) ────────────────────────
//
// Acuity moved from 6 axes to 10 axes in Phase D. The 6-axis vocabulary
// is preserved as `LIFE_AREAS_V1` for two reasons:
//
//   1. Mobile build-42 (live since 2026-05-15) sends 6-axis priorities on
//      onboarding. Server's /api/onboarding/update validates against V1
//      until PR2 expands validation to accept both vocabs.
//   2. Onboarding step-7 (mobile) / step-6 (web) keeps the V1 picker for
//      one release cycle. Phase C replaces those steps with a 12-axis
//      baseline adapted to 10 axes — out of scope for Phase D.
//
// 6→10 mapping decision (see `LIFE_AREA_LEGACY_MAP` below + progress.md
// 2026-05-21 entry): single-target with defaults, NOT split-weight, so
// the "top 3" concept in onboarding doesn't get inflated. AI extraction
// populates split-target axes (MENTAL_HEALTH, ROMANCE, FRIENDS, FUN,
// PURPOSE) from subsequent transcripts.
//
// Three derived forms of every area:
//   `LifeArea`               UPPER_SNAKE_CASE enum stored on
//                            `LifeMapArea.area` and `Goal.lifeArea`.
//   `LIFE_AREA_PROMPT_KEYS`  lowercase form sent to/received from Claude
//                            (extraction JSON keys, Compression prompt
//                            output keys) and used as the suffix on
//                            UserMemory column names (`${key}Summary`,
//                            `${key}Mentions`, `${key}Baseline`).
//   `LIFE_AREA_DISPLAY`      user-facing display string.

export const LIFE_AREAS = [
  "CAREER",
  "MONEY",
  "ROMANCE",
  "FAMILY",
  "FRIENDS",
  "PHYSICAL_HEALTH",
  "MENTAL_HEALTH",
  "GROWTH",
  "FUN",
  "PURPOSE",
] as const;

export type LifeArea = (typeof LIFE_AREAS)[number];

export const LIFE_AREA_DISPLAY: Record<LifeArea, string> = {
  CAREER: "Career",
  MONEY: "Money",
  ROMANCE: "Romance",
  FAMILY: "Family",
  FRIENDS: "Friends & Community",
  PHYSICAL_HEALTH: "Physical Health",
  MENTAL_HEALTH: "Mental Health",
  GROWTH: "Growth & Learning",
  FUN: "Fun",
  PURPOSE: "Purpose & Meaning",
};

// ─── Legacy 6-axis vocabulary (transition compatibility, Phase D) ────────────
//
// Kept until: (a) mobile build-42 attrition drops below ~10% MAU, (b) the
// onboarding-step-7 replacement ships in Phase C. After both, this and
// related V1 exports get removed in a follow-up cleanup PR.

export const LIFE_AREAS_V1 = [
  "CAREER",
  "HEALTH",
  "RELATIONSHIPS",
  "FINANCES",
  "PERSONAL",
  "OTHER",
] as const;

export type LifeAreaV1 = (typeof LIFE_AREAS_V1)[number];

export const LIFE_AREA_V1_DISPLAY: Record<LifeAreaV1, string> = {
  CAREER: "Career",
  HEALTH: "Health",
  RELATIONSHIPS: "Relationships",
  FINANCES: "Finances",
  PERSONAL: "Personal Growth",
  OTHER: "Other",
};

/**
 * 6→10 axis mapping decision — MAPPING_DECISION_2026-05-21.
 *
 * Single-target, not split. Reasoning: a split (e.g., RELATIONSHIPS rank-1
 * → ROMANCE+FAMILY+FRIENDS all rank-1) would inflate the onboarding "top 3"
 * concept into 5+ tied-1 axes. Cleaner to single-target the most common
 * interpretation; AI extraction populates the un-mapped axes over time
 * from transcripts.
 *
 * Defaults chosen:
 *   HEALTH → PHYSICAL_HEALTH (colloquial "health" defaults to physical
 *                             /fitness; mental users would pick it
 *                             deliberately if it were on the picker)
 *   RELATIONSHIPS → FAMILY    (most-frequent intent per recurring-people
 *                             data; ROMANCE/FRIENDS are more specific
 *                             terms users would have chosen deliberately)
 *   PERSONAL → GROWTH         ("personal growth" is the canonical
 *                             interpretation; FUN and PURPOSE come from
 *                             transcript signals)
 *   OTHER → null              (no semantic equivalent; ignored on
 *                             migration. Goals with lifeArea="OTHER"
 *                             stay as OTHER sentinel until user
 *                             reassigns.)
 */
export const LIFE_AREA_LEGACY_MAP: Record<LifeAreaV1, LifeArea | null> = {
  CAREER: "CAREER",
  HEALTH: "PHYSICAL_HEALTH",
  RELATIONSHIPS: "FAMILY",
  FINANCES: "MONEY",
  PERSONAL: "GROWTH",
  OTHER: null,
};

/**
 * Resolve a display label for a life-area value, tolerating both 10-axis
 * canonical vocab and 6-axis legacy vocab (returned by server for
 * pre-migration data). Falls through to the raw string so unknown
 * inputs don't render as "undefined".
 */
export function lifeAreaDisplayLabel(
  area: string | null | undefined
): string {
  if (!area) return "Other";
  const canon = (LIFE_AREA_DISPLAY as Record<string, string>)[area];
  if (canon) return canon;
  const legacy = (LIFE_AREA_V1_DISPLAY as Record<string, string>)[area];
  if (legacy) return legacy;
  return area;
}

/**
 * Goal group metadata — drives the grouped sections on the Goals
 * screen. The 10 values + order match the Life Matrix canonical order.
 *
 * Icon field is loosened to `string` (was a literal union) because
 * Phase D expanded the icon set from 6 to 10 and any future axis
 * additions or icon swaps would otherwise cascade type updates across
 * web + mobile GoalGroupIcon switches. Both renderers fall through to
 * a Palette default for unknown icon names, so loosening the type
 * doesn't degrade safety in practice — the literal union was checking
 * spelling, not correctness.
 */
export type GoalGroupId = LifeArea;

export interface GoalGroupMeta {
  id: GoalGroupId;
  label: string;
  icon: string;
  color: string;
  order: number;
}

export const GOAL_GROUPS: GoalGroupMeta[] = [
  { id: "CAREER", label: "Career", icon: "Briefcase", color: "#3B82F6", order: 0 },
  { id: "MONEY", label: "Money", icon: "Wallet", color: "#F59E0B", order: 1 },
  { id: "ROMANCE", label: "Romance", icon: "Heart", color: "#EC4899", order: 2 },
  { id: "FAMILY", label: "Family", icon: "Users", color: "#F43F5E", order: 3 },
  { id: "FRIENDS", label: "Friends", icon: "UsersRound", color: "#14B8A6", order: 4 },
  { id: "PHYSICAL_HEALTH", label: "Physical Health", icon: "Activity", color: "#84CC16", order: 5 },
  { id: "MENTAL_HEALTH", label: "Mental Health", icon: "Brain", color: "#8B5CF6", order: 6 },
  { id: "GROWTH", label: "Growth", icon: "Sprout", color: "#A855F7", order: 7 },
  { id: "FUN", label: "Fun", icon: "Sparkles", color: "#F97316", order: 8 },
  { id: "PURPOSE", label: "Purpose", icon: "Compass", color: "#6366F1", order: 9 },
];

/** Find group metadata for a life-area value. Falls back to the last
 *  group (PURPOSE) for anything unrecognized — preserves the prior
 *  behavior of "always return something" so render code stays simple. */
export function goalGroupForArea(area: string | null | undefined): GoalGroupMeta {
  const match = GOAL_GROUPS.find((g) => g.id === area);
  return match ?? GOAL_GROUPS[GOAL_GROUPS.length - 1];
}

export const LIFE_AREA_PROMPT_KEYS: Record<LifeArea, string> = {
  CAREER: "career",
  MONEY: "money",
  ROMANCE: "romance",
  FAMILY: "family",
  FRIENDS: "friends",
  PHYSICAL_HEALTH: "physical_health",
  MENTAL_HEALTH: "mental_health",
  GROWTH: "growth",
  FUN: "fun",
  PURPOSE: "purpose",
};

export const LIFE_AREA_BY_PROMPT_KEY: Record<string, LifeArea> = Object.fromEntries(
  Object.entries(LIFE_AREA_PROMPT_KEYS).map(([area, key]) => [
    key,
    area as LifeArea,
  ])
);

/**
 * Per-axis radar/chart metadata. `shortName` (Phase D) is the radar-
 * label form — kept ≤7 chars so 10-axis labels fit at fontSize 10 on
 * iPhone 16e (375pt screen, radar at size=320pt). Card surfaces +
 * detail screens use `name`. See life-map-radar.tsx docblock for the
 * geometry math that justifies the shortName cap.
 */
export const DEFAULT_LIFE_AREAS = [
  { enum: "CAREER" as LifeArea, key: "career", name: "Career", shortName: "Career", color: "#3B82F6", icon: "briefcase" },
  { enum: "MONEY" as LifeArea, key: "money", name: "Money", shortName: "Money", color: "#F59E0B", icon: "wallet" },
  { enum: "ROMANCE" as LifeArea, key: "romance", name: "Romance", shortName: "Romance", color: "#EC4899", icon: "heart" },
  { enum: "FAMILY" as LifeArea, key: "family", name: "Family", shortName: "Family", color: "#F43F5E", icon: "people" },
  { enum: "FRIENDS" as LifeArea, key: "friends", name: "Friends & Community", shortName: "Friends", color: "#14B8A6", icon: "people-circle" },
  { enum: "PHYSICAL_HEALTH" as LifeArea, key: "physical_health", name: "Physical Health", shortName: "Health", color: "#84CC16", icon: "fitness" },
  { enum: "MENTAL_HEALTH" as LifeArea, key: "mental_health", name: "Mental Health", shortName: "Mental", color: "#8B5CF6", icon: "happy" },
  { enum: "GROWTH" as LifeArea, key: "growth", name: "Growth & Learning", shortName: "Growth", color: "#A855F7", icon: "leaf" },
  { enum: "FUN" as LifeArea, key: "fun", name: "Fun", shortName: "Fun", color: "#F97316", icon: "color-palette" },
  { enum: "PURPOSE" as LifeArea, key: "purpose", name: "Purpose & Meaning", shortName: "Purpose", color: "#6366F1", icon: "compass" },
] as const;

export type LifeAreaKey = (typeof DEFAULT_LIFE_AREAS)[number]["key"];

/**
 * Legacy 6-axis radar/chart metadata — used by onboarding step-7
 * (mobile) and step-6 (web) until Phase C ships the 12-axis baseline
 * replacement. Also used by server-side `apps/web/src/lib/memory.ts`
 * which still writes the legacy `${key}Summary` UserMemory columns
 * until PR2 adds the 10-axis column set. Decoupled from
 * DEFAULT_LIFE_AREAS so the new 10-axis vocab doesn't leak.
 */
export const DEFAULT_LIFE_AREAS_V1 = [
  { enum: "CAREER" as LifeAreaV1, key: "career", name: "Career", color: "#3B82F6", icon: "briefcase" },
  { enum: "HEALTH" as LifeAreaV1, key: "health", name: "Health", color: "#14B8A6", icon: "heart-pulse" },
  { enum: "RELATIONSHIPS" as LifeAreaV1, key: "relationships", name: "Relationships", color: "#F43F5E", icon: "users" },
  { enum: "FINANCES" as LifeAreaV1, key: "finances", name: "Finances", color: "#F59E0B", icon: "trending-up" },
  { enum: "PERSONAL" as LifeAreaV1, key: "personal", name: "Personal Growth", color: "#A855F7", icon: "sparkles" },
  { enum: "OTHER" as LifeAreaV1, key: "other", name: "Other", color: "#71717A", icon: "more-horizontal" },
] as const;

export type LifeAreaKeyV1 = (typeof DEFAULT_LIFE_AREAS_V1)[number]["key"];

/**
 * When reading per-axis data out of a historical Entry.rawAnalysis blob
 * that predates the Phase D cutover, fall back to the V1 prompt key
 * that the legacy extraction emitted. Split axes (ROMANCE, FAMILY,
 * FRIENDS all read from legacy "relationships"; PHYSICAL_HEALTH +
 * MENTAL_HEALTH read from "health"; GROWTH + FUN + PURPOSE read from
 * "personal") share a single source — semantically defensible since
 * V1 was a coarser categorization.
 */
export const LIFE_AREA_LEGACY_FALLBACK_KEY: Record<LifeAreaKey, LifeAreaKeyV1 | null> = {
  career: "career",
  money: "finances",
  romance: "relationships",
  family: "relationships",
  friends: "relationships",
  physical_health: "health",
  mental_health: "health",
  growth: "personal",
  fun: "personal",
  purpose: "personal",
};

// ─── Mood labels ──────────────────────────────────────────────────────────────

export const MOOD_LABELS: Record<string, string> = {
  GREAT: "Great",
  GOOD: "Good",
  NEUTRAL: "Neutral",
  LOW: "Low",
  ROUGH: "Rough",
};

export const MOOD_EMOJI: Record<string, string> = {
  GREAT: "🚀",
  GOOD: "😊",
  NEUTRAL: "😐",
  LOW: "😔",
  ROUGH: "😣",
};

/**
 * Map a 1-10 mood score to the 5-bucket enum. Kept symmetric so a
 * legacy consumer reading the string label still behaves well when
 * the new slider is used:
 *   1–2 ROUGH · 3–4 LOW · 5–6 NEUTRAL · 7–8 GOOD · 9–10 GREAT
 */
export function moodBucketFromScore(score: number): Mood {
  const n = Math.max(1, Math.min(10, Math.round(score)));
  if (n <= 2) return "ROUGH";
  if (n <= 4) return "LOW";
  if (n <= 6) return "NEUTRAL";
  if (n <= 8) return "GOOD";
  return "GREAT";
}

/** Short word describing a 1-10 score — used beneath the slider thumb. */
export function moodLabelForScore(score: number): string {
  const bucket = moodBucketFromScore(score);
  return MOOD_LABELS[bucket];
}

// ─── Priority ─────────────────────────────────────────────────────────────────

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_COLOR: Record<string, string> = {
  LOW: "#94A3B8",
  MEDIUM: "#60A5FA",
  HIGH: "#F59E0B",
  URGENT: "#EF4444",
};

// ─── Stripe ───────────────────────────────────────────────────────────────────

export const PLAN_FREE_ENTRY_LIMIT = 7; // entries per week on free plan
export const PLAN_PRO_NAME = "Acuity Pro";

// ─── Whisper ──────────────────────────────────────────────────────────────────

export const WHISPER_MODEL = "whisper-1";
export const WHISPER_LANGUAGE = "en"; // set to undefined for auto-detect

// ─── Claude ───────────────────────────────────────────────────────────────────

// Sonnet-4-6 is the current default for extraction, weekly synthesis, memory
// compression, and life-map insights — the "everything else" model per the
// 2026-04-19 decision. Flagship work (Day 14 Life Audit, Quarterly audits —
// not yet built) uses claude-opus-4-7 and should reference a separate
// CLAUDE_FLAGSHIP_MODEL constant when those land.
export const CLAUDE_MODEL = "claude-sonnet-4-6";
export const CLAUDE_MAX_TOKENS = 2048;

// Opus-4-7 is reserved for flagship long-form outputs where quality
// matters more than cost: Day 14 Life Audit, Quarterly audits, Annual
// memoir. Sonnet handles the per-entry extraction + weekly synthesis
// + memory compression + lifemap insights.
export const CLAUDE_FLAGSHIP_MODEL = "claude-opus-4-7";
// Long-form Claude output budget. Day 14 Life Audit target is ~1000
// words of narrative + a few hundred tokens of metadata; 4096 tokens
// leaves headroom. Don't raise without measuring — longer tokens =
// longer wall-clock = tighter per-step Hobby ceiling.
export const CLAUDE_FLAGSHIP_MAX_TOKENS = 4096;

// Haiku-4-5 powers the FREE-tier one-sentence summary. v1.1 free-tier
// redesign: FREE recordings transcribe + get a tiny Haiku summary,
// then short-circuit the extraction pipeline. ~$0.0007 per call at
// our prompt sizes (vs ~$0.011 for Sonnet extraction). Output budget
// is small — one sentence — so 128 tokens covers it.
export const CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const CLAUDE_HAIKU_MAX_TOKENS = 128;
