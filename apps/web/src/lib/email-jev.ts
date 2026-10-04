/**
 * Jev picks which version of a lifecycle email each person gets (2026-10-01,
 * per Keenan: "revamp all of our emails with better language writing
 * multiple scripts per app that we feed into jev that then decides which
 * one to use").
 *
 * Every email in emails/trial/* that has `variants` goes through here:
 *   1. RESULTS — for each version, how many matured sends (72h+ old) and how
 *      many reached the email's goal within 72h (recorded / got into the app /
 *      paid / clicked, see GOALS). Counted in code, never by Jev.
 *   2. JEV — one "choice" question: given who she is (lane, plan, recordings,
 *      days since signup, in the app or not) and the results so far, which
 *      version is most likely to reach the goal?
 *   3. PICK — sample from Jev's probabilities mixed with 20% uniform, so every
 *      version keeps getting some sends and the results stay honest.
 * Jev off or failing → pick by results (best smoothed goal rate, 30% random).
 *
 * The chosen version is logged as an OnboardingEvent "email_variant_sent"
 * with value "<emailKey>:<variantId>" (no schema change). That row is what
 * the next pick's results are counted from, so the loop learns on its own.
 */
import "server-only";

import type { EmailVariant, TrialVars } from "@/emails/trial/types";
import { askAdsJev, adsJevEnabled } from "@/lib/adlab/jev";

export const VARIANT_EVENT = "email_variant_sent";
const GOAL_WINDOW_MS = 72 * 3600_000;
const LOOKBACK_MS = 120 * 24 * 3600_000;
const EXPLORE = 0.2;

export type EmailGoal = "record" | "app" | "pay" | "click";

/** What each email is for. Anything not listed counts clicks. */
export function goalFor(emailKey: string): EmailGoal {
  if (["recovery_paid_no_app", "app_access_rescue", "apple_duplicate_rescue", "rescue_signup_only", "rescue_viewed_no_tap", "rescue_tapped_app_store", "rescue_webview_blocked"].includes(emailKey)) return "app";
  if (["recovery_signup_no_checkout", "recovery_checkout_abandoned", "trial_ending"].includes(emailKey)) return "pay";
  if (/^(app_first_record|first_debrief_followup|card_trial_|never_recorded|nr_winback|stall_|winback_|keep_momentum)/.test(emailKey)) return "record";
  return "click";
}

const GOAL_TEXT: Record<EmailGoal, string> = {
  record: "record a debrief in the app within 3 days",
  app: "get into the Ripple app (signed in) within 3 days",
  pay: "start a paid membership or trial within 3 days",
  click: "click the email's button",
};

export interface VariantStats {
  id: string;
  sent: number;
  goals: number;
}

const statsCache = new Map<string, { at: number; stats: VariantStats[] }>();

/** Matured sends and goal hits per version of one email. */
export async function variantStats(emailKey: string, variantIds: string[]): Promise<VariantStats[]> {
  const hit = statsCache.get(emailKey);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.stats;

  const { prisma } = await import("@/lib/prisma");
  const now = Date.now();
  const rows = await prisma.onboardingEvent.findMany({
    where: {
      event: VARIANT_EVENT,
      value: { startsWith: `${emailKey}:` },
      createdAt: { gte: new Date(now - LOOKBACK_MS), lte: new Date(now - GOAL_WINDOW_MS) },
      userId: { not: null },
    },
    select: { userId: true, value: true, createdAt: true },
  });
  const goal = goalFor(emailKey);
  const userIds = [...new Set(rows.map((r) => r.userId!))];
  const reached = new Set<string>(); // `${userId}` that reached the goal after their send

  if (userIds.length) {
    const earliest = new Date(Math.min(...rows.map((r) => r.createdAt.getTime())));
    const sentAt = new Map(rows.map((r) => [r.userId!, r.createdAt.getTime()]));
    const within = (uid: string | null, t: Date) => {
      const s = uid ? sentAt.get(uid) : undefined;
      return s !== undefined && t.getTime() >= s && t.getTime() <= s + GOAL_WINDOW_MS;
    };
    if (goal === "record") {
      const entries = await prisma.entry.findMany({
        where: { userId: { in: userIds }, createdAt: { gte: earliest } },
        select: { userId: true, createdAt: true },
      });
      for (const e of entries) if (within(e.userId, e.createdAt)) reached.add(e.userId);
    } else if (goal === "app") {
      const ev = await prisma.onboardingEvent.findMany({
        where: { userId: { in: userIds }, event: "app_signed_in", createdAt: { gte: earliest } },
        select: { userId: true, createdAt: true },
      });
      for (const e of ev) if (within(e.userId, e.createdAt)) reached.add(e.userId!);
    } else if (goal === "pay") {
      // No paid-at timestamp on User; count anyone who is paying now. Good
      // enough to compare versions of the same email against each other.
      const paying = await prisma.user.findMany({
        where: { id: { in: userIds }, subscriptionStatus: "PRO" },
        select: { id: true },
      });
      for (const u of paying) reached.add(u.id);
    } else {
      const logs = await prisma.trialEmailLog.findMany({
        where: { userId: { in: userIds }, emailKey, clicked: true },
        select: { userId: true },
      });
      for (const l of logs) if (l.userId) reached.add(l.userId);
    }
  }

  const stats = variantIds.map((id) => {
    const mine = rows.filter((r) => r.value === `${emailKey}:${id}`);
    return { id, sent: mine.length, goals: mine.filter((r) => reached.has(r.userId!)).length };
  });
  statsCache.set(emailKey, { at: Date.now(), stats });
  return stats;
}

export interface PersonContext {
  lane: "women" | "men";
  plan: string;
  totalRecordings: number;
  daysSinceSignup: number;
  inApp: boolean;
  source: string | null;
}

export async function personContext(userId: string, vars: TrialVars): Promise<PersonContext> {
  const { prisma } = await import("@/lib/prisma");
  const [user, signedIn] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionStatus: true, createdAt: true, signupUtmSource: true },
    }),
    prisma.onboardingEvent.findFirst({ where: { userId, event: "app_signed_in" }, select: { id: true } }),
  ]);
  return {
    lane: vars.lane ?? "women",
    plan: user?.subscriptionStatus ?? "unknown",
    totalRecordings: vars.totalRecordings,
    daysSinceSignup: user ? Math.floor((Date.now() - user.createdAt.getTime()) / 86400_000) : 0,
    inApp: !!signedIn,
    source: user?.signupUtmSource ?? null,
  };
}

function weightedPick(ids: string[], weights: number[], rand: () => number): string {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < ids.length; i++) {
    r -= weights[i];
    if (r <= 0) return ids[i];
  }
  return ids[ids.length - 1];
}

/**
 * Without Jev: best smoothed goal rate ((goals+1)/(sent+2)), with 30% of
 * sends spread at random so no version starves. Pure, for tests.
 */
export function pickByResults(stats: VariantStats[], rand: () => number = Math.random): string {
  if (rand() < 0.3) return stats[Math.floor(rand() * stats.length) % stats.length].id;
  let best = stats[0];
  for (const s of stats) if ((s.goals + 1) / (s.sent + 2) > (best.goals + 1) / (best.sent + 2)) best = s;
  return best.id;
}

/** Jev's distribution mixed with EXPLORE uniform. Pure, for tests. */
export function pickFromJev(ids: string[], probs: Record<string, number>, rand: () => number = Math.random): string {
  const weights = ids.map((id) => (1 - EXPLORE) * (probs[id] ?? 0) + EXPLORE / ids.length);
  return weightedPick(ids, weights, rand);
}

export interface VariantChoice {
  variant: EmailVariant;
  by: "jev" | "results" | "only";
}

export async function chooseEmailVariant(
  userId: string,
  emailKey: string,
  variants: EmailVariant[],
  vars: TrialVars
): Promise<VariantChoice> {
  if (variants.length === 1) return { variant: variants[0], by: "only" };
  const ids = variants.map((x) => x.id);
  const byId = (id: string) => variants.find((x) => x.id === id) ?? variants[0];

  let stats: VariantStats[];
  try {
    stats = await variantStats(emailKey, ids);
  } catch {
    stats = ids.map((id) => ({ id, sent: 0, goals: 0 }));
  }

  if (adsJevEnabled()) {
    try {
      const person = await personContext(userId, vars);
      const goal = goalFor(emailKey);
      const state = {
        product: "Ripple: you talk, it turns what you said into your to-do list, tracks your habits and mood, and shows the patterns. Audience: busy women ~40-50 (lane women) or self-improvement men 18-34 (lane men).",
        email: emailKey,
        goal: GOAL_TEXT[goal],
        person,
        versions: variants.map((x) => {
          const s = stats.find((st) => st.id === x.id)!;
          return {
            id: x.id,
            angle: x.angle,
            subject: x.subject(vars),
            results: { sent: s.sent, reached_goal: s.goals, rate: s.sent ? Math.round((s.goals / s.sent) * 100) / 100 : null },
          };
        }),
      };
      const r = await askAdsJev(`email:${emailKey}`, state, {
        pick: {
          type: "choice",
          instructions:
            "Which version of this email is most likely to get this person to reach the goal? Weigh the versions' results (a higher rate over more sends is real evidence; under 20 sends is weak evidence) and how well each angle fits this person (their lane, whether they are in the app, how many debriefs they have recorded, how long since they signed up).",
          criteria: Object.fromEntries(variants.map((x) => [x.id, x.angle])),
        },
      });
      const a = r?.answers?.pick;
      if (a && a.type === "choice" && a.probabilities) {
        return { variant: byId(pickFromJev(ids, a.probabilities)), by: "jev" };
      }
    } catch {
      // fall through to results
    }
  }
  return { variant: byId(pickByResults(stats)), by: "results" };
}

/** Log which version went out. Never throws. */
export async function logVariantSent(userId: string, emailKey: string, variantId: string): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.onboardingEvent.create({ data: { userId, event: VARIANT_EVENT, value: `${emailKey}:${variantId}` } });
  } catch {}
}
