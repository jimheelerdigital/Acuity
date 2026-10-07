/**
 * UGC creator outreach settings (2026-10-06, per Keenan). Every number the
 * pipeline uses lives here; no other file hardcodes one.
 *
 * What we buy: VIDEOS TO RUN AS ADS from Ripple's own accounts, not posts
 * to the creator's audience. Follower count never scores; on-camera quality
 * and persona fit do. Many cheap test videos first, more money only on the
 * winners.
 */
import type { Persona } from "@/lib/content-factory/brand";
import { displayAnnual, displayMonthly } from "@/lib/pricing";

export type { Persona };
export type CreatorType = "credentialed" | "lookalike" | "productivity";
export type Platform = "instagram" | "tiktok";

export const PERSONAS: Record<Persona, { label: string; description: string }> = {
  midlife: {
    label: "Midlife",
    description:
      "Women 40–50: mental load, mom life, midlife, journaling, wellness.",
  },
  ambitious: {
    label: "Ambitious",
    description:
      "Young ambitious adults 22–32: productivity, self-improvement, career, founders.",
  },
};

/** Share of each week's review queue per persona. Must sum to 1. */
export const PERSONA_SPLIT: Record<Persona, number> = { midlife: 0.6, ambitious: 0.4 };

export const CREATOR_TYPES: Record<CreatorType, { label: string; description: string; personas: Persona[] }> = {
  credentialed: {
    label: "Credentialed",
    description: "Therapists, coaches, social workers.",
    personas: ["midlife", "ambitious"],
  },
  lookalike: {
    label: "Lookalike",
    description: "Looks and sounds like the target customer.",
    personas: ["midlife", "ambitious"],
  },
  productivity: {
    label: "Productivity",
    description: "Productivity and self-improvement creators.",
    personas: ["ambitious"],
  },
};

export const MAX_FOLLOWERS = 20_000;
export const MAX_FEE_PER_VIDEO = 100;
/** Paid only when Keenan marks a video a winner. */
export const WINNER_BONUS_PER_VIDEO = 50;
export const BUNDLE_SIZE = 3;
export const HOOKS_PER_VIDEO = 2;
export const USAGE_RIGHTS_MONTHS = 3;
/** Per video per extra USAGE_RIGHTS_MONTHS, winners only. */
export const RIGHTS_EXTENSION_FEE = 25;
export const PAYMENT_TERMS = "paid on delivery, half upfront at most";

export const WEEKLY_CREATOR_CAP = 10;
export const MAX_SENDS_PER_DAY = 5;
/** Days without a reply before the one follow-up. */
export const FOLLOWUP_AFTER_DAYS = 5;

export const APIFY_SPEND_CAP_PER_RUN = 10;
export const MAX_PROFILES_PER_RUN = 500;
/** Profiles that get the expensive enrichment + final score. */
export const FINAL_SCORE_LIMIT = 50;
export const MIN_SCORE = 70;
export const DRY_RUN_PROFILES = 25;

export const TARGET_COST_PER_TRIAL = 15;
/** KILL list: a video that has spent this much with zero trials. */
export const KILL_SPEND = 2 * TARGET_COST_PER_TRIAL;
/** RIGHTS list window. */
export const RIGHTS_WARNING_DAYS = 14;
/** Warning: this many offers out with fewer than LOW_DEAL_COUNT deals. */
export const LOW_DEAL_OFFERS = 40;
export const LOW_DEAL_COUNT = 2;
export const RAISED_FEE_SUGGESTION = 150;

export const OUTREACH_FROM_EMAIL = "keenan@heelerdigital.com";
/**
 * Sending stays off. While false, approved creators wait in the
 * "ready to send" list and nothing leaves the mailbox.
 */
export const OUTREACH_SEND_ENABLED = false;

export const RIPPLE_PRICING = `${displayMonthly()} a month or ${displayAnnual()} a year`;

export const SIGNATURE_NAME = "Keenan, co-founder of Ripple — goripple.io";
export const MAILING_ADDRESS = "8733 Southwestern Blvd #1737, Dallas, TX 75206";
export const OPT_OUT_LINE = "Not a fit? Just say so and I won't follow up.";
export const EMAIL_MAX_WORDS = 120;
export const DM_MAX_WORDS = 60;

/** Where a creator's tracking link lands (goripple.io/u/<code>). */
export const TRACKING_LANDING_PATH = "/start";
export const TRACKING_BASE_URL = "https://goripple.io";

// ─── Discovery ─────────────────────────────────────────────────────────────

export const DISCOVERY_PLATFORMS: Platform[] = ["instagram", "tiktok"];

/** Searched on every run. */
export const UGC_HASHTAGS = ["ugccreator", "ugccommunity", "ugccontentcreator"];
export const PERSONA_HASHTAGS: Record<Persona, string[]> = {
  midlife: ["momugc", "ugcmom", "mentalload", "midlifewomen", "momsover40", "journaling"],
  ambitious: ["productivitytips", "selfimprovement", "careertok", "founderlife"],
};
export const CREATOR_TYPE_HASHTAGS: Record<CreatorType, string[]> = {
  credentialed: ["therapistsofinstagram", "therapisttok", "lifecoach", "socialworker"],
  lookalike: ["ugcapp", "appugc", "dayinmylife"],
  productivity: ["productivity", "notion", "studytok"],
};

/** Posts sampled per hashtag per platform (bounded again by MAX_PROFILES_PER_RUN). */
export const RESULTS_PER_HASHTAG = 25;

// ─── Models + pricing for the cost report (USD per token) ──────────────────

/** Rough filter: the cheapest model configured in the repo. */
export const ROUGH_MODEL = "claude-haiku-4-5-20251001";
/** Final score: Opus 5.5 (Jev is a yes/no judge and can't score a rubric). */
export const FINAL_MODEL = "claude-opus-5-5";
export const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5-20251001": { in: 1 / 1e6, out: 5 / 1e6 },
  // Sonnet 5.5 is "half of Opus 5.5" (claude-client.ts): $4 / $20.
  "claude-opus-5-5": { in: 4 / 1e6, out: 20 / 1e6 },
  "claude-opus-5": { in: 4 / 1e6, out: 20 / 1e6 },
  "claude-sonnet-5-5": { in: 2 / 1e6, out: 10 / 1e6 },
  "claude-sonnet-5": { in: 2 / 1e6, out: 10 / 1e6 },
};
export const WHISPER_PRICE_PER_MINUTE = 0.006;
/** Instagram videos above this aren't downloaded for a transcript. */
export const MAX_TRANSCRIBE_BYTES = 20 * 1024 * 1024;

// ─── Derived helpers (math stays in code) ──────────────────────────────────

/** Persona slots for this week's queue, e.g. 10 → { midlife: 6, ambitious: 4 }. */
export function personaSlots(total = WEEKLY_CREATOR_CAP): Record<Persona, number> {
  const midlife = Math.round(total * PERSONA_SPLIT.midlife);
  return { midlife, ambitious: total - midlife };
}

export function allHashtags(): string[] {
  const tags = [
    ...UGC_HASHTAGS,
    ...Object.values(PERSONA_HASHTAGS).flat(),
    ...Object.values(CREATOR_TYPE_HASHTAGS).flat(),
  ];
  return Array.from(new Set(tags.map((t) => t.replace(/^#/, "").toLowerCase())));
}

export function trackingUrl(code: string): string {
  return `${TRACKING_BASE_URL}/u/${code}`;
}

export const SIGNATURE_BLOCK = `${SIGNATURE_NAME}\n${MAILING_ADDRESS}`;
