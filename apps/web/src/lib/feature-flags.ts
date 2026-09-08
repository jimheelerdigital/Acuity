import "server-only";

import type { Entitlement } from "@/lib/entitlements";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { prisma } from "@/lib/prisma";

/**
 * Narrowed FeatureFlag projection — exactly the columns the gate
 * evaluator reads (enabled / requiredTier / rolloutPercentage).
 *
 * Why narrowed instead of `FeatureFlag` from @prisma/client: the
 * schema has columns the prod DB doesn't have yet (experimentVariants
 * + experimentTrafficSplit, added schema-side but never `prisma db push`d
 * from Jim's home network). The default findUnique projection includes
 * those columns and Postgres throws P2022 — a 500 cascades to every
 * route that calls gateFeatureFlag (theme-map, ask-past-self, state-
 * of-me, goals tree, health correlations, referral rewards, public
 * share links).
 *
 * Same workaround pattern Jim already established for User.targetCadence
 * (see safeUpdateUser / deleteMany comments in user/delete + onboarding
 * routes). Once `npx prisma db push` runs from home, this file keeps
 * working unchanged — the narrow select is just defense in depth.
 */
type FlagGateRow = {
  enabled: boolean;
  requiredTier: string | null;
  rolloutPercentage: number;
};

/**
 * Feature flag evaluator.
 *
 * Resolution order (first hit wins):
 *   1. UserFeatureOverride       — force on/off per user
 *   2. FeatureFlag.enabled=false — global kill switch (disabled wins)
 *   3. requiredTier check        — caller's plan vs flag.requiredTier
 *   4. rolloutPercentage         — deterministic hash(userId+key) < N
 *   5. If flag.enabled=true and above checks pass, ENABLED.
 *
 * Disabled features should 404 on the API — don't leak existence.
 *
 * Anonymous callers (no userId) skip the override + rollout paths and
 * fall back to flag.enabled + requiredTier. With no userId to check,
 * a requiredTier=PRO flag evaluates to false for anon.
 *
 * Per-request cache (`flagCache`) dedups calls within a single handler
 * — an admin-dashboard render that checks 5 flags shouldn't mean 5
 * Postgres round-trips. Call `resetFeatureFlagCache()` in test setup
 * if you're mutating flags mid-test.
 */

export const FEATURE_FLAG_KEYS = [
  "apple_health_integration",
  "ask_your_past_self",
  "state_of_me_report",
  "configurable_life_matrix",
  "calendar_integrations",
  "theme_evolution_map",
  "goal_progression_tree",
  "referral_rewards",
  "claude_ai_observations",
  "weekly_email_digest",
  "monthly_email_digest",
  "data_export",
  "public_share_links",
  "v1_1_dispositional_themes",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

type FlagCache = {
  flags: Map<string, FlagGateRow | null>;
  overrides: Map<string, Map<string, boolean>>;
};

let flagCache: FlagCache | null = null;

export function resetFeatureFlagCache(): void {
  flagCache = null;
}

function getCache(): FlagCache {
  if (!flagCache) {
    flagCache = { flags: new Map(), overrides: new Map() };
  }
  return flagCache;
}

async function loadFlag(key: string): Promise<FlagGateRow | null> {
  const cache = getCache();
  if (cache.flags.has(key)) return cache.flags.get(key) ?? null;
  // Explicit select — never project experimentVariants /
  // experimentTrafficSplit. See FlagGateRow comment.
  const row = await prisma.featureFlag.findUnique({
    where: { key },
    select: {
      enabled: true,
      requiredTier: true,
      rolloutPercentage: true,
    },
  });
  cache.flags.set(key, row);
  return row;
}

async function loadUserOverride(
  userId: string,
  flagKey: string
): Promise<boolean | null> {
  const cache = getCache();
  let userMap = cache.overrides.get(userId);
  if (userMap && userMap.has(flagKey)) {
    return userMap.get(flagKey) ?? null;
  }
  if (!userMap) {
    const rows = await prisma.userFeatureOverride.findMany({
      where: { userId },
      select: { flagKey: true, enabled: true },
    });
    userMap = new Map(rows.map((r) => [r.flagKey, r.enabled]));
    cache.overrides.set(userId, userMap);
  }
  return userMap.has(flagKey) ? (userMap.get(flagKey) ?? null) : null;
}

/**
 * FNV-1a 32-bit hash → 0..99 bucket. Deterministic per
 * (userId, flagKey) pair so a given user consistently sees
 * the same rollout decision across sessions.
 */
function rolloutBucket(userId: string, flagKey: string): number {
  const input = `${userId}:${flagKey}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

/**
 * Does this user's tier satisfy the flag's `requiredTier`?
 *
 * ── Why this reads the entitlement, not the raw status ───────────────
 * This function used to compare `subscriptionStatus === "PRO"` directly,
 * which made it a SECOND, independent entitlement authority that disagreed
 * with the first. `entitlementsFor` grants an active TRIAL the full paid
 * feature set (canExtractEntries, canGenerateNewLifeAudit, canSyncCalendar,
 * …), but a `requiredTier: "PRO"` flag rejected those same trial users. So
 * a feature gated by the paywall was available on trial, and the identical
 * feature gated by a flag was not — with nothing in either file explaining
 * the split.
 *
 * Routing the PRO branch through `canExtractEntries` — which is true for
 * exactly PRO and active-TRIAL — makes flag gating and paywall gating give
 * the same answer, from the same resolver.
 *
 * ⚠️ THIS CHANGES LIVE BEHAVIOR. See docs/EVIDENCE_RECEIPTS_NOTES.md.
 *
 * The FREE branch is deliberately UNCHANGED and still reads the raw status.
 * "FREE tier" flags target users who aren't paying — typically upgrade
 * nudges — and trial users are a prime audience for those. Re-deriving it
 * from the entitlement would have silently flipped TRIAL out of that
 * audience (and PAST_DUE into it), which is an unrelated product decision
 * this change has no business making.
 */
export function tierMatches(
  resolved:
    | { entitlement: Entitlement; state: { subscriptionStatus: string } }
    | null
    | undefined,
  requiredTier: string | null
): boolean {
  if (!requiredTier) return true;
  if (!resolved) return false;

  if (requiredTier === "PRO") {
    // PRO + active TRIAL. Same predicate the paywall uses.
    return resolved.entitlement.canExtractEntries;
  }
  if (requiredTier === "FREE") {
    const status = (resolved.state.subscriptionStatus ?? "").toUpperCase();
    return status === "FREE" || status === "TRIAL" || status === "";
  }
  return false;
}

export async function isEnabled(
  userId: string | null,
  flagKey: FeatureFlagKey | string
): Promise<boolean> {
  const flag = await loadFlag(flagKey);
  if (!flag) return false;

  if (userId) {
    const override = await loadUserOverride(userId, flagKey);
    if (override !== null) return override;
  }

  if (!flag.enabled) return false;

  if (flag.requiredTier) {
    if (!userId) return false;
    // Single entitlement authority: same resolver the paywall reads, so a
    // flag-gated feature and a paywall-gated one can no longer disagree.
    const resolved = await resolveEntitlement(userId);
    if (!tierMatches(resolved, flag.requiredTier)) return false;
  }

  if (flag.rolloutPercentage >= 100) return true;
  if (flag.rolloutPercentage <= 0) return false;
  if (!userId) {
    // Anon callers can't bucket deterministically — fail closed on any
    // partial rollout. (Flags meant for public pages are expected to
    // be configured at 100% rollout.)
    return false;
  }
  return rolloutBucket(userId, flagKey) < flag.rolloutPercentage;
}

export async function isEnabledForAnon(
  flagKey: FeatureFlagKey | string
): Promise<boolean> {
  return isEnabled(null, flagKey);
}

/**
 * Helper for route handlers — returns a Response(404) if the flag is
 * off so the caller can early-return:
 *
 *   const gated = await gateFeatureFlag(userId, "ask_your_past_self");
 *   if (gated) return gated;
 */
export async function gateFeatureFlag(
  userId: string | null,
  flagKey: FeatureFlagKey | string
): Promise<Response | null> {
  const ok = await isEnabled(userId, flagKey);
  if (ok) return null;
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
