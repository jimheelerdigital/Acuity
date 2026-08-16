import "server-only";

/**
 * THE entitlement resolver — one interface every reader goes through.
 *
 * Before this module, "what can this user do" was answered by two I/O
 * wrappers (entitlements-fetch.getUserEntitlement, paywall.requireEntitlement)
 * that each did their own Prisma select and called entitlementsFor. That was
 * fine while the DB was the only source. It stops being fine the moment
 * RevenueCat becomes the source of truth, because the swap would have to be
 * made in every wrapper, consistently, at once.
 *
 * So: the DECISION stays exactly where it was (`entitlementsFor` in
 * lib/entitlements.ts — unchanged, still pure, still the rule), and this
 * module owns only the question of WHERE THE STATE COMES FROM. Cutover is
 * then a one-line change in `activeSourceName()`.
 *
 * ── Behavior today ──────────────────────────────────────────────────
 * IDENTICAL to before. `RC_SOURCE_OF_TRUTH` is off, so `activeSourceName()`
 * returns "db", the DB source selects the same three columns the old
 * wrappers selected, and `entitlementsFor` produces the same Entitlement.
 * No caller sees a difference. Verified by resolve.test.ts, which asserts
 * the resolver and a direct `entitlementsFor` call agree across every
 * status/trial permutation.
 *
 * ── Dual-read fallback (the safety net that makes cutover reversible) ─
 * When RC_SOURCE_OF_TRUTH IS on, the RC source is tried first; if it
 * returns null (user unknown to RC) or throws (RC down, keys missing), we
 * fall back to the DB source and record `fellBack: true`. A RevenueCat
 * outage therefore degrades to today's behavior instead of mass-revoking
 * access — which is the single most important property of this migration,
 * given the live paid base. See docs/REVENUECAT_MIGRATION.md.
 */

import { entitlementsFor, type Entitlement } from "@/lib/entitlements";
import { rcFlags } from "@/lib/revenuecat/flags";
import { safeLog } from "@/lib/safe-log";

// ─── The state an entitlement decision needs ─────────────────────────

/**
 * The minimal subscription state `entitlementsFor` consumes, plus the
 * attribution fields readers use for UI routing. Any source (DB, RC, a
 * future provider) must be able to produce this shape.
 */
export interface EntitlementState {
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  stripeFirstFailureAt: Date | null;
  /** "stripe" | "apple" | "google_play" | "comp" | null. Never gates access. */
  subscriptionSource: string | null;
}

export type EntitlementSourceName = "db" | "revenuecat";

export interface ResolvedEntitlement {
  /** The computed permissions. This is what callers gate on. */
  entitlement: Entitlement;
  /** The raw state the decision was made from. */
  state: EntitlementState;
  /** Which source actually answered. */
  source: EntitlementSourceName;
  /**
   * True when the configured source was RevenueCat but we served the DB
   * instead (RC returned null / errored). Logged + surfaced so the drift
   * monitor and the cutover dashboard can count fallbacks — a rising
   * fallback rate is the signal to roll the flag back.
   */
  fellBack: boolean;
}

interface EntitlementSource {
  name: EntitlementSourceName;
  load(userId: string): Promise<EntitlementState | null>;
}

// ─── Source: the database (today's behavior) ──────────────────────────

const dbSource: EntitlementSource = {
  name: "db",
  async load(userId) {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionStatus: true,
        trialEndsAt: true,
        stripeFirstFailureAt: true,
        subscriptionSource: true,
      },
    });
    if (!user) return null;
    return {
      subscriptionStatus: user.subscriptionStatus,
      trialEndsAt: user.trialEndsAt ?? null,
      stripeFirstFailureAt: user.stripeFirstFailureAt ?? null,
      subscriptionSource: user.subscriptionSource ?? null,
    };
  },
};

// ─── Source: RevenueCat (inert until keys + flag exist) ───────────────

/**
 * Reads entitlement state from RevenueCat's REST API.
 *
 * Deliberately NOT implemented against a live client yet: RC_SECRET_KEY
 * does not exist in any environment, and the whole strategy is
 * observer-mode-first — RC must be *verified* against the DB (drift
 * monitor, RC-parity mode) before it is allowed to answer this question.
 *
 * Returning null here is not a failure mode, it is the designed one: null
 * means "RC can't answer", the resolver falls back to the DB, and the app
 * behaves exactly as it does today. When the keys land, implement `load`
 * and the flag becomes meaningful with no other code change.
 */
const revenueCatSource: EntitlementSource = {
  name: "revenuecat",
  async load(userId) {
    const { fetchRcEntitlementState } = await import("@/lib/revenuecat/client");
    return fetchRcEntitlementState(userId);
  },
};

// ─── Source selection — THE CUTOVER SWITCH ───────────────────────────

/**
 * Which source is authoritative right now.
 *
 * ⬇️ THIS IS THE ONE-LINE SWAP. Flipping RC_SOURCE_OF_TRUTH on makes
 * RevenueCat authoritative for every entitlement read in the app.
 */
export function activeSourceName(): EntitlementSourceName {
  return rcFlags().RC_SOURCE_OF_TRUTH ? "revenuecat" : "db";
}

const SOURCES: Record<EntitlementSourceName, EntitlementSource> = {
  db: dbSource,
  revenuecat: revenueCatSource,
};

// ─── The resolver ────────────────────────────────────────────────────

/**
 * Resolve one user's entitlement from the currently-authoritative source.
 *
 * Returns null when the user cannot be resolved at all (deleted row, stale
 * session). Callers treat null as "no entitlement", matching the previous
 * `getUserEntitlement` contract.
 *
 * @param now Optional fixed clock, forwarded to `entitlementsFor` so tests
 *            stay deterministic.
 */
export async function resolveEntitlement(
  userId: string | null | undefined,
  now?: Date
): Promise<ResolvedEntitlement | null> {
  if (!userId) return null;

  const configured = activeSourceName();
  let state: EntitlementState | null = null;
  let fellBack = false;

  if (configured === "revenuecat") {
    try {
      state = await SOURCES.revenuecat.load(userId);
    } catch (err) {
      // An RC read failure must NEVER revoke access. Log loudly, fall back.
      safeLog.error("entitlements.rc-source-failed", err, { userId });
      state = null;
    }
    if (state === null) {
      fellBack = true;
      safeLog.warn("entitlements.rc-source-fellback", { userId });
      state = await SOURCES.db.load(userId);
    }
  } else {
    state = await SOURCES.db.load(userId);
  }

  if (state === null) return null;

  return {
    entitlement: entitlementsFor(state, now),
    state,
    source: fellBack ? "db" : configured,
    fellBack,
  };
}

/**
 * Compute an entitlement from a state the caller ALREADY has.
 *
 * For hot paths (SSR pages that selected the User row anyway) so the
 * resolver doesn't force a second query. Bypasses source selection by
 * design — the caller's row IS the DB source. Do not use this on a path
 * that must honor RC_SOURCE_OF_TRUTH; use `resolveEntitlement` there.
 */
export function resolveEntitlementFromState(
  state: EntitlementState,
  now?: Date
): ResolvedEntitlement {
  return {
    entitlement: entitlementsFor(state, now),
    state,
    source: "db",
    fellBack: false,
  };
}

/** The exact Prisma `select` the DB source uses — reuse it in callers. */
export const ENTITLEMENT_SELECT = {
  subscriptionStatus: true,
  trialEndsAt: true,
  stripeFirstFailureAt: true,
  subscriptionSource: true,
} as const;
