/**
 * Jev #2 — PUBLISH GATE (2026-09-30, per Keenan: "post roughly the best
 * 12 of 18 instead of cutting lanes").
 *
 * Every lane still generates every day. Before the auto-publisher queues a
 * brand's day for Instagram/Facebook/Threads/YouTube, Jev scores the whole
 * day batch in ONE call and the bottom third is HELD: never auto-posted,
 * still emailed to Keenan (labelled "HELD by Jev") so he can post it by
 * hand if he disagrees.
 *
 * Per post, Jev answers (see jev.ts for the question types):
 *   scroll_i  Score SCROLL_STOP_LEVELS on the cover line + first slides
 *   save_i    Score SAVE_SEND_LEVELS on the full slide text + caption
 *   sense_i   Noul: does the cover make complete sense on its own?
 *   coach_i   Ripple only, Noul: does it lecture / give advice instead of
 *             reflecting what she feels? (penalized; not for reset-guide
 *             lanes, whose format IS practical steps)
 * The composite, the ranking, the keep count and the lane-diversity
 * tie-break are all computed here in code (Jev is weak at counting).
 *
 * 2026-10-02 (fix #1 of the 30-day hands-off list): the composite now
 * leads with each lane's REAL track record (gate-calibration.ts) and the
 * coach penalty — the only things with evidence. Scroll / save are a
 * tie-break until the weekly calibration shows they predict results, and
 * cover sense is a pass/fail floor instead of a ranking input.
 *
 * Rules:
 * - keep ceil(2/3 · n) per brand-day; a brand-day with ≤ 2 posts is never
 *   gated. Legendary Mythicals is never gated at all (all 3 fixed-slot
 *   posts ship), so its schedule is untouched.
 * - A brand-day is ranked ONCE, when every active lane of that brand has
 *   produced its post(s) for the day, or at RANK_CUTOFF_UTC_HOUR (13:00
 *   UTC), whichever comes first. The daily post-email send also ranks
 *   (forced) right before it emails, so held labels are always in place.
 *   Until then the scan does not enqueue that brand-day's posts. Feed
 *   windows open at noon ET (16:00 UTC EDT / 17:00 UTC EST), so ranking
 *   by 13:00 UTC never moves a publishing slot.
 * - Posts that arrive after their day was ranked (a lane retry at 14:00
 *   UTC, a manual admin generate) are not in the ranking and pass through
 *   exactly as before.
 * - A brand-day that already had posts queued before the gate existed
 *   (deploy mid-day) is left alone ("open").
 * - FAIL OPEN: Jev off, key missing, error or a missing answer → keep
 *   every post, exactly like before the gate.
 *
 * Switch: JEV_PUBLISH_GATE — on whenever JEV_API_KEY is set; "0" turns it
 * off (then nothing is ranked and every post publishes as before).
 *
 * STORAGE (no schema change): the decision for each brand-day is a JSON
 * marker in the content-factory bucket, publish-gate/<date>-<brand>.json,
 * holding the full ranking table (every score, the composite, rank, held
 * or kept, trigger, Jev model). It is written once with upsert:false, so
 * the social cron and the email send can't both decide the same day; the
 * second writer adopts the first decision. Chosen over a SocialPublish
 * SKIPPED row because social-health-check alerts on every SKIPPED row, and
 * over a CarouselPost column because none fits and the schema is frozen.
 */

import {
  askJev,
  jevEnabled,
  noulOf,
  scoreOf,
  SAVE_SEND_LEVELS,
  SCROLL_STOP_LEVELS,
  type JevQuestion,
} from "./jev";
import type { SocialAccountKey } from "./social-publish";

const BUCKET = "content-factory";

/** UTC hour after which a brand-day is ranked with whatever has arrived. */
export const RANK_CUTOFF_UTC_HOUR = 13;
/** Fraction of a brand-day that ships. */
const KEEP_FRACTION = 2 / 3;
/** Brand-days this small are never gated. */
const MIN_GATED_POSTS = 3;

// Composite weights (0..1 inputs). Scroll-stop leads because reach on
// IG/FB is decided on the cover; save/send is the account's biggest gap
// (copy-objectives.ts); a cover that doesn't make sense alone is a hard
// negative; coach tone costs Ripple comments (positioning: on her side,
// never preachy).
// BACKTEST 2026-09-30 (67 Ripple posts >7 days old with IG metrics,
// Spearman vs (comments+saves)/views): coach -0.35 was the ONLY component
// with signal (scroll -0.01, save 0.06, sense -0.08). Composite with coach
// 0.25 → 0.21 (within-day 0.26); 0.5 → 0.32 (within-day 0.33); 1.0 → 0.37
// (0.47). 0.5 is a deliberate half-step: 10 days of data, tuned in-sample.
// Re-run the backtest as data grows before moving it further.
// 2026-10-02: those hand-set weights (scroll 0.45 / save 0.35 / sense 0.2)
// are retired. Defaults below; gate-calibration.ts re-fits them weekly.
export type GateWeights = { track: number; scroll: number; save: number; coach: number };
export const DEFAULT_GATE_WEIGHTS: Record<GatedBrand, GateWeights> = {
  ripple: { track: 1, scroll: 0.05, save: 0.05, coach: 0.5 },
  bwk: { track: 1, scroll: 0.05, save: 0.05, coach: 0 },
};
/** Jev's "cover makes sense alone" below this → the post ranks last. */
const SENSE_FLOOR = 0.3;
const SENSE_FAIL_PENALTY = 10;
/** Composites this close count as a tie → lane diversity decides. */
const TIE_EPSILON = 0.02;

const SLIDES_CHARS = 1400;
const CAPTION_CHARS = 500;

export type GatedBrand = Exclude<SocialAccountKey, "mythicals">;

const AUDIENCE: Record<GatedBrand, string> = {
  ripple:
    "Women roughly 40-50 carrying the mental load for everyone around them (work, kids, partner, aging parents), scrolling Instagram or Facebook on a phone. They want to feel seen and lighter; they skip anything preachy, clinical or written like a brand.",
  bwk:
    "Men roughly 18-30 building discipline and self-respect in private (training, money, focus), scrolling Instagram or Facebook on a phone. They skip hype and guru talk and save posts that read like a concrete standard or a direct command.",
};

/** One post as the gate sees it. */
export interface GatePost {
  id: string;
  lane: string;
  headline: string;
  /** Cover slide text (falls back to the headline). */
  cover: string;
  /** Non-cover slide texts in order. */
  slides: string[];
  caption: string;
}

export interface GateRow {
  id: string;
  lane: string;
  headline: string;
  scrollStop: number | null;
  saveSend: number | null;
  coverSense: number | null;
  /** Ripple only: probability the post lectures / coaches. */
  coach: number | null;
  /** Lane's real track record used (1.0 = typical post); absent on pre-10-02 markers. */
  track?: number | null;
  composite: number | null;
  /** 1 = best. */
  rank: number;
  held: boolean;
}

export interface GateRanking {
  rows: GateRow[];
  keep: number;
  /** True when Jev gave no usable answer — everything kept. */
  failOpen: boolean;
  model: string | null;
}

export interface GateMarker {
  version: 1;
  brand: GatedBrand;
  date: string;
  decidedAt: string;
  /** complete = every lane arrived; cutoff = 13:00 UTC; forced = email send / manual. */
  trigger: "complete" | "cutoff" | "forced";
  /** Why nothing was held, when nothing was. */
  note?: string;
  n: number;
  keep: number;
  failOpen: boolean;
  model: string | null;
  missingLanes: string[];
  rows: GateRow[];
}

/**
 * Lanes that always post and are never ranked or held: voiced videos
 * (Keenan approves each one) and the "which one is you?" pick lanes
 * (2026-09-30, per Keenan: "it should automatically post"). They also
 * don't count toward a brand-day being complete.
 */
export function gateExemptLane(lane: string | null | undefined): boolean {
  return !!lane && (lane.startsWith("voiced-") || lane.startsWith("pick-"));
}

/** JEV_PUBLISH_GATE: on with a Jev key, "0" disables. */
export function publishGateEnabled(): boolean {
  return process.env.JEV_PUBLISH_GATE?.trim() !== "0" && jevEnabled();
}

export function keepCount(n: number): number {
  return n < MIN_GATED_POSTS ? n : Math.ceil(KEEP_FRACTION * n);
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Lanes whose format is practical steps on purpose — never penalized for
 * "giving advice" (copy-objectives: "When a format calls for practical
 * steps (a reset guide), they read as a friend who has been there").
 */
function coachExempt(lane: string): boolean {
  return lane.startsWith("reset-guide");
}

type Prisma = typeof import("@/lib/prisma").prisma;

/**
 * Lane → brand, same answer as social-publish laneBrand() (legacy BWK_LANES
 * list, then the ContentLane row, else ripple) but read through the given
 * client in one query, so scripts can pass their own PrismaClient.
 */
async function laneBrandMap(prisma: Prisma): Promise<(lane: string | null) => SocialAccountKey> {
  const { BWK_LANES } = await import("./social-publish");
  const rows = await prisma.contentLane.findMany({ select: { key: true, brand: true } });
  const map = new Map(rows.map((r) => [r.key, r.brand]));
  return (lane) => {
    if (!lane) return "ripple";
    if ((BWK_LANES as readonly string[]).includes(lane)) return "bwk";
    const b = map.get(lane);
    return b === "bwk" || b === "mythicals" ? b : "ripple";
  };
}

export interface PastContext {
  winners: string[];
  losers: string[];
}

/**
 * NOT used in production (backtest 2026-09-30: no gain) — kept for
 * backtests/experiments via rankDayBatch's `past` option.
 * Brand's top/bottom 5 cover lines by measured engagement (last 30 days,
 * IG numbers on CarouselPost; score as in performance.ts). Null until
 * there are at least 10 measured posts. `before` bounds the window (for
 * backtests: only posts measured before the batch day).
 */
export async function pastEngagementContext(
  brand: GatedBrand,
  before: Date = new Date(),
  prismaClient?: unknown
): Promise<PastContext | null> {
  try {
    const prisma = (prismaClient ?? (await import("@/lib/prisma")).prisma) as Prisma;
    const brandOf = await laneBrandMap(prisma);
    const since = new Date(before.getTime() - 30 * 86_400_000);
    const rows = await prisma.carouselPost.findMany({
      where: {
        generatedFor: { gte: since, lt: before },
        lane: { not: null },
        OR: [{ views: { not: null } }, { likes: { not: null } }],
      },
      select: { lane: true, headline: true, views: true, likes: true, comments: true, saves: true, shares: true },
    });
    const mine: { headline: string; score: number }[] = [];
    for (const r of rows) {
      if (brandOf(r.lane) !== brand) continue;
      mine.push({
        headline: r.headline,
        score:
          (r.views ?? 0) * 0.01 +
          (r.likes ?? 0) +
          (r.comments ?? 0) * 3 +
          (r.saves ?? 0) * 8 +
          (r.shares ?? 0) * 8,
      });
    }
    if (mine.length < 10) return null;
    mine.sort((a, b) => b.score - a.score);
    return {
      winners: mine.slice(0, 5).map((m) => clip(m.headline, 120)),
      losers: mine.slice(-5).map((m) => clip(m.headline, 120)),
    };
  } catch {
    return null;
  }
}

/**
 * Score one brand-day batch with ONE Jev call and pick what ships.
 * Pure apart from the Jev call — no DB or storage writes, so dry runs
 * and backtests can call it directly.
 */
export async function rankDayBatch(
  brand: GatedBrand,
  posts: GatePost[],
  opts: {
    label?: string;
    past?: PastContext | null;
    protectedLanes?: Set<string>;
    /** Calibrated weights (gate-calibration.ts); defaults per brand. */
    weights?: GateWeights;
    /** Lane → real track record (1.0 = typical post); missing lanes count as 1.0. */
    laneTrack?: Record<string, number>;
  } = {}
): Promise<GateRanking> {
  const w = opts.weights ?? DEFAULT_GATE_WEIGHTS[brand];
  const n = posts.length;
  const keep = keepCount(n);
  const keepAll = (failOpen: boolean, model: string | null): GateRanking => ({
    rows: posts.map((p, i) => ({
      id: p.id,
      lane: p.lane,
      headline: p.headline,
      scrollStop: null,
      saveSend: null,
      coverSense: null,
      coach: null,
      composite: null,
      rank: i + 1,
      held: false,
    })),
    keep: n,
    failOpen,
    model,
  });
  if (n < MIN_GATED_POSTS) return keepAll(false, null);

  const questions: Record<string, JevQuestion> = {};
  posts.forEach((p, i) => {
    questions[`scroll_${i}`] = {
      type: "score",
      instructions: `Judge only \`posts[${i}]\`, from its cover line \`posts[${i}].cover\` and first slides \`posts[${i}].first_slides\`. How strongly would the reader described in \`audience\` stop scrolling for it?`,
      criteria: SCROLL_STOP_LEVELS,
    };
    questions[`save_${i}`] = {
      type: "score",
      instructions: `Judge only \`posts[${i}]\`: its cover, all its slides and its caption. How likely is the reader described in \`audience\` to save it, send it to someone, or comment on it?`,
      criteria: SAVE_SEND_LEVELS,
    };
    questions[`sense_${i}`] = {
      type: "noul",
      instructions: `Does \`posts[${i}].cover\` make complete sense on its own, read in one second on a phone, without the rest of the post?`,
    };
    if (brand === "ripple" && !coachExempt(p.lane)) {
      questions[`coach_${i}`] = {
        type: "noul",
        instructions: `Does \`posts[${i}]\` lecture the reader or give her advice in a coach's tone (telling her what she should do), instead of reflecting back what she already feels?`,
        criteria: {
          true: "It lectures, instructs or coaches her",
          false: "It reflects her feelings and experience back to her",
        },
      };
    }
  });

  const state: Record<string, unknown> = {
    audience: AUDIENCE[brand],
    posts: posts.map((p) => ({
      cover: clip(p.cover || p.headline, 200),
      first_slides: p.slides.slice(0, 2).map((s) => clip(s, 300)),
      all_slides: clip(p.slides.join(" / "), SLIDES_CHARS),
      caption: clip(p.caption, CAPTION_CHARS),
    })),
  };
  if (opts.past) {
    state.past_winners = opts.past.winners;
    state.past_losers = opts.past.losers;
    for (const k of Object.keys(questions)) {
      if (!k.startsWith("scroll_") && !k.startsWith("save_")) continue;
      const q = questions[k];
      q.instructions = `${q.instructions} For calibration only, \`past_winners\` and \`past_losers\` are this account's recent cover lines with the most and least real engagement.`;
    }
  }

  const r = await askJev(`publish-gate:${opts.label ?? brand}`, state, questions);
  if (!r) return keepAll(true, null);

  const scored = posts.map((p, i) => {
    const scrollStop = scoreOf(r, `scroll_${i}`);
    const saveSend = scoreOf(r, `save_${i}`);
    const coverSense = noulOf(r, `sense_${i}`);
    const coach = questions[`coach_${i}`] ? noulOf(r, `coach_${i}`) : null;
    const complete =
      scrollStop != null && saveSend != null && coverSense != null && (!questions[`coach_${i}`] || coach != null);
    const track = opts.laneTrack?.[p.lane] ?? 1;
    const composite = complete
      ? w.track * track +
        w.scroll * scrollStop! +
        w.save * saveSend! -
        w.coach * (coach ?? 0) -
        (coverSense! < SENSE_FLOOR ? SENSE_FAIL_PENALTY : 0)
      : null;
    return { post: p, i, scrollStop, saveSend, coverSense, coach, track, composite };
  });
  // Any missing answer → no opinion on the batch (fail open).
  if (scored.some((s) => s.composite == null)) return keepAll(true, r.model ?? null);

  const kept = selectKeep(
    scored.map((s) => ({ id: s.post.id, lane: s.post.lane, composite: s.composite! })),
    keep,
    opts.protectedLanes
  );
  const byComposite = [...scored].sort((a, b) => b.composite! - a.composite! || a.i - b.i);
  const rankOf = new Map(byComposite.map((s, idx) => [s.post.id, idx + 1]));
  const round = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 1000);
  return {
    rows: byComposite.map((s) => ({
      id: s.post.id,
      lane: s.post.lane,
      headline: s.post.headline,
      scrollStop: round(s.scrollStop),
      saveSend: round(s.saveSend),
      coverSense: round(s.coverSense),
      coach: round(s.coach),
      track: round(s.track),
      composite: round(s.composite),
      rank: rankOf.get(s.post.id)!,
      held: !kept.has(s.post.id),
    })),
    keep,
    failOpen: false,
    model: r.model ?? null,
  };
}

/**
 * Which posts ship. Highest composite first, with lane diversity:
 * 0. ROTATION (2026-09-30): a lane that had a post held yesterday gets its
 *    best post kept today. The dry run held the same four lanes two days
 *    running, which amounts to cutting lanes, the opposite of the ask
 *    ("post roughly the best 12 of 18 instead of cutting lanes");
 * 1. every lane's best post, best lanes first (so no lane is fully held
 *    when there are enough keep slots for one post per lane);
 * 2. remaining slots by composite, where a near-tie (within TIE_EPSILON)
 *    goes to the lane with fewer posts kept so far.
 */
export function selectKeep(
  items: { id: string; lane: string; composite: number }[],
  keep: number,
  protectedLanes?: Set<string>
): Set<string> {
  const sorted = [...items].sort((a, b) => b.composite - a.composite);
  const kept = new Set<string>();
  const perLane = new Map<string, number>();
  const take = (it: { id: string; lane: string }) => {
    kept.add(it.id);
    perLane.set(it.lane, (perLane.get(it.lane) ?? 0) + 1);
  };
  const seenLane = new Set<string>();
  if (protectedLanes?.size) {
    for (const it of sorted) {
      if (kept.size >= keep) break;
      if (!protectedLanes.has(it.lane) || seenLane.has(it.lane)) continue;
      seenLane.add(it.lane);
      take(it);
    }
  }
  for (const it of sorted) {
    if (kept.size >= keep) break;
    if (seenLane.has(it.lane)) continue;
    seenLane.add(it.lane);
    take(it);
  }
  while (kept.size < keep) {
    const rest = sorted.filter((it) => !kept.has(it.id));
    if (rest.length === 0) break;
    const top = rest[0].composite;
    const ties = rest.filter((it) => top - it.composite <= TIE_EPSILON);
    ties.sort((a, b) => (perLane.get(a.lane) ?? 0) - (perLane.get(b.lane) ?? 0) || b.composite - a.composite);
    take(ties[0]);
  }
  return kept;
}

/** Console table of a ranking (for logs and the dry run). */
export function formatGateTable(brand: string, date: string, ranking: Pick<GateRanking, "rows" | "keep" | "failOpen">): string {
  const f = (x: number | null) => (x == null ? "  -  " : x.toFixed(2));
  const lines = [
    `[publish-gate] ${brand} ${date}: keep ${ranking.keep}/${ranking.rows.length}${ranking.failOpen ? " (FAIL OPEN — Jev gave no answer, keeping all)" : ""}`,
    `  rank  comp  track scroll save  sense coach  ${"lane".padEnd(16)} headline`,
    ...ranking.rows.map(
      (r) =>
        `  ${String(r.rank).padStart(2)} ${r.held ? "HOLD" : "keep"} ${f(r.composite)} ${f(r.track ?? null)} ${f(r.scrollStop)} ${f(r.saveSend)} ${f(r.coverSense)} ${f(r.coach)}  ${r.lane.padEnd(16)} ${clip(r.headline, 70)}`
    ),
  ];
  return lines.join("\n");
}

// ─── Storage-backed decisions (production path) ─────────────────────

function markerPath(brand: GatedBrand, date: string): string {
  return `publish-gate/${date}-${brand}.json`;
}

export async function readGateMarker(brand: GatedBrand, date: string): Promise<GateMarker | null> {
  const { supabase } = await import("@/lib/supabase.server");
  const { data } = await supabase.storage.from(BUCKET).download(markerPath(brand, date));
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as GateMarker;
  } catch {
    return null;
  }
}

/** Write once; if another run already decided this day, adopt its decision. */
async function claimGateMarker(marker: GateMarker): Promise<GateMarker> {
  const { supabase } = await import("@/lib/supabase.server");
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(markerPath(marker.brand, marker.date), Buffer.from(JSON.stringify(marker, null, 2)), {
      contentType: "application/json",
      upsert: false,
    });
  if (!error) return marker;
  const existing = await readGateMarker(marker.brand, marker.date);
  if (existing) return existing;
  // Couldn't write and nothing there — use this decision for this run only.
  console.warn(`[publish-gate] marker write failed for ${marker.brand} ${marker.date}: ${error.message}`);
  return marker;
}

function gatePostFrom(p: {
  id: string;
  lane: string | null;
  headline: string;
  caption: string;
  slides: { kind: string; overlayText: string }[];
}): GatePost {
  const cover = p.slides.find((s) => s.kind === "COVER");
  return {
    id: p.id,
    lane: p.lane ?? "",
    headline: p.headline,
    cover: cover?.overlayText?.trim() || p.headline,
    slides: p.slides.filter((s) => s.kind !== "COVER").map((s) => s.overlayText).filter((t) => t?.trim()),
    caption: p.caption,
  };
}

export interface BrandDayBatch {
  /** Auto-publish candidates (what the scan would enqueue). */
  posts: GatePost[];
  /** Active lanes that haven't produced all their posts yet. */
  missingLanes: string[];
  /** Some post of this brand-day is already queued (pre-gate day). */
  alreadyQueued: boolean;
}

/**
 * Load a brand-day: its publishable posts and whether every active lane
 * has delivered. Read-only. `prismaClient` lets scripts pass their own.
 */
export async function loadBrandDay(
  brand: GatedBrand,
  date: string,
  opts: { includeQueued?: boolean; prismaClient?: unknown } = {}
): Promise<BrandDayBatch> {
  const prisma = (opts.prismaClient ?? (await import("@/lib/prisma")).prisma) as Prisma;
  const day = new Date(`${date}T00:00:00Z`);

  const brandOf = await laneBrandMap(prisma);
  const laneRows = await prisma.contentLane.findMany({
    where: { status: { not: "RETIRED" } },
    select: { key: true, hoursUtc: true },
  });
  const lanes = laneRows.filter((l) => brandOf(l.key) === brand && !gateExemptLane(l.key));

  const all = await prisma.carouselPost.findMany({
    where: { generatedFor: day, lane: { in: lanes.map((l) => l.key) } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      lane: true,
      headline: true,
      caption: true,
      status: true,
      format: true,
      slides: {
        where: { kind: { notIn: ["SCENE", "CTA"] } },
        orderBy: { order: "asc" },
        select: { kind: true, overlayText: true, imagePrompt: true },
      },
      socialPublishes: {
        where: { platform: { in: ["instagram", "facebook", "threads", "youtube"] } },
        select: { id: true },
      },
    },
  });

  // Completeness: each lane owes one post per scheduled hour before the cutoff.
  const count = new Map<string, number>();
  for (const p of all) count.set(p.lane!, (count.get(p.lane!) ?? 0) + 1);
  const missingLanes = lanes
    .filter((l) => {
      const owed = l.hoursUtc.filter((h) => h < RANK_CUTOFF_UTC_HOUR).length;
      return owed > 0 && (count.get(l.key) ?? 0) < owed;
    })
    .map((l) => l.key);

  // Same eligibility as the scan (DRAFT photo posts, no unverified text).
  const eligible = all.filter(
    (p) =>
      p.format === "PHOTO" &&
      (opts.includeQueued || (p.status === "DRAFT" && p.socialPublishes.length === 0)) &&
      !p.slides.some((s) => s.imagePrompt.includes("TEXT-UNVERIFIED"))
  );
  return {
    posts: eligible.map(gatePostFrom),
    missingLanes,
    alreadyQueued: all.some((p) => p.socialPublishes.length > 0),
  };
}

export type DayGate =
  /** Not ready — don't enqueue this brand-day yet. */
  | { state: "pending"; missingLanes: string[] }
  /** Not gated — enqueue everything (gate off, pre-gate day, mythicals). */
  | { state: "open"; reason: string }
  | { state: "ranked"; marker: GateMarker; held: Set<string> };

/**
 * The scan's (and the email send's) single entry point. Returns the
 * stored decision, or decides now if the brand-day is ready (every lane
 * in, or past the cutoff, or `force`).
 */
export async function resolveDayGate(
  brand: SocialAccountKey,
  date: string,
  opts: { force?: boolean; now?: Date } = {}
): Promise<DayGate> {
  if (brand === "mythicals") return { state: "open", reason: "mythicals never gated" };
  if (!publishGateEnabled()) return { state: "open", reason: "gate off" };

  const heldOf = (m: GateMarker) => new Set(m.rows.filter((r) => r.held).map((r) => r.id));
  const existing = await readGateMarker(brand, date);
  if (existing) return { state: "ranked", marker: existing, held: heldOf(existing) };

  const batch = await loadBrandDay(brand, date);
  if (batch.alreadyQueued) return { state: "open", reason: "day already queued before the gate" };

  const now = opts.now ?? new Date();
  const cutoff = new Date(`${date}T${String(RANK_CUTOFF_UTC_HOUR).padStart(2, "0")}:00:00Z`);
  const complete = batch.missingLanes.length === 0;
  if (!complete && now < cutoff && !opts.force) {
    return { state: "pending", missingLanes: batch.missingLanes };
  }
  const trigger: GateMarker["trigger"] = complete ? "complete" : opts.force && now < cutoff ? "forced" : "cutoff";

  // No past_winners/past_losers context: in the backtest it made the
  // ranking slightly WORSE (0.21 → 0.19 overall), so it isn't sent.
  const prevDate = new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const prev = await readGateMarker(brand, prevDate).catch(() => null);
  const protectedLanes = new Set((prev?.rows ?? []).filter((r) => r.held).map((r) => r.lane));
  const { readGateCalibration } = await import("./gate-calibration");
  const cal = await readGateCalibration(brand);
  const ranking = await rankDayBatch(brand, batch.posts, {
    label: `${brand}:${date}`,
    protectedLanes,
    weights: cal?.weights,
    laneTrack: cal ? Object.fromEntries(Object.entries(cal.lanes).map(([k, v]) => [k, v.track])) : undefined,
  });
  const marker = await claimGateMarker({
    version: 1,
    brand,
    date,
    decidedAt: now.toISOString(),
    trigger,
    note:
      batch.posts.length < MIN_GATED_POSTS
        ? `only ${batch.posts.length} post(s) — never gated`
        : ranking.failOpen
          ? "Jev gave no answer — fail open, all kept"
          : undefined,
    n: batch.posts.length,
    keep: ranking.keep,
    failOpen: ranking.failOpen,
    model: ranking.model,
    missingLanes: batch.missingLanes,
    rows: ranking.rows,
  });
  console.log(formatGateTable(brand, date, marker));
  return { state: "ranked", marker, held: heldOf(marker) };
}

/**
 * "HELD by Jev (score 0.41, rank 7/8)" for a held post, else null. Used
 * by the per-post email so Keenan can post a held one by hand.
 */
export async function gateHoldLabel(
  postId: string,
  lane: string | null,
  generatedFor: Date
): Promise<string | null> {
  try {
    const { laneBrand } = await import("./social-publish");
    const brand = await laneBrand(lane);
    if (brand === "mythicals") return null;
    const marker = await readGateMarker(brand, generatedFor.toISOString().slice(0, 10));
    const row = marker?.rows.find((r) => r.id === postId);
    if (!marker || !row?.held) return null;
    return `HELD by Jev (score ${row.composite?.toFixed(2) ?? "?"}, rank ${row.rank}/${marker.n})`;
  } catch {
    return null;
  }
}
