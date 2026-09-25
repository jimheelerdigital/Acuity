/**
 * Normal-vs-test funnel split (2026-09-25, per Keenan): while the
 * `funnel_test_split` FeatureFlag is on, /start sends half its visitors to
 * /start-test and /start-bwk sends half to /start-test-bwk. Ads keep pointing
 * at /start and /start-bwk, so Meta's learning isn't reset.
 *
 * How a visitor is placed (server side, in app/start*\/page.tsx):
 *   - `?step=` present (Stripe/OAuth/email return) → never split, render as-is
 *   - flag off → normal funnel, cookie ignored
 *   - cookie acuity_fsplit=test|normal → same arm as before (30 days)
 *   - no cookie → coin flip. "test" 307s to the test funnel with ?fsplit=test
 *     (query string kept, so UTMs and fbclid survive); the test funnel sets
 *     the cookie and logs funnel_split_arm=test. "normal" renders the normal
 *     funnel with an inline script that sets the cookie and window.__fsplit,
 *     and OnboardingFunnel logs funnel_split_arm=normal.
 * The admin Funnel tab compares arms by flowVersion (v8 / v9-test,
 * v8-bwk / v9-test-bwk), optionally limited to sessions with funnel_split_arm.
 *
 * The flag is read straight from the DB with a 30-second memo instead of
 * lib/feature-flags' per-instance cache, which never refreshes: turning the
 * split off in admin must take effect everywhere within a minute.
 */
import { prisma } from "@/lib/prisma";
import { FUNNEL_SPLIT_FLAG, FSPLIT_PARAM, parseArm, SPLIT_TARGET, type SplitArm } from "@/lib/funnel-split-shared";

export * from "@/lib/funnel-split-shared";

const TTL_MS = 30_000;
let memo: { at: number; on: boolean } | null = null;

export async function isFunnelSplitOn(): Promise<boolean> {
  // Local testing only: FUNNEL_SPLIT_FORCE=on|off overrides the DB flag, so the
  // routing can be exercised without switching the live split on.
  if (process.env.NODE_ENV !== "production" && process.env.FUNNEL_SPLIT_FORCE) {
    return process.env.FUNNEL_SPLIT_FORCE === "on";
  }
  if (memo && Date.now() - memo.at < TTL_MS) return memo.on;
  let on = false;
  try {
    const row = await prisma.featureFlag.findUnique({
      where: { key: FUNNEL_SPLIT_FLAG },
      select: { enabled: true, rolloutPercentage: true },
    });
    on = !!row?.enabled && row.rolloutPercentage > 0;
  } catch {
    // DB hiccup → everyone gets the normal funnel. Never break the landing page.
    on = false;
  }
  memo = { at: Date.now(), on };
  return on;
}

/** Arm for this request: the saved cookie if valid, else a fair coin flip. */
export function pickArm(cookieValue: string | undefined): { arm: SplitArm; fresh: boolean } {
  const saved = parseArm(cookieValue);
  if (saved) return { arm: saved, fresh: false };
  return { arm: Math.random() < 0.5 ? "test" : "normal", fresh: true };
}

/** Test-funnel URL carrying every incoming query param plus ?fsplit=test. */
export function testFunnelUrl(
  from: keyof typeof SPLIT_TARGET,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === FSPLIT_PARAM || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) qs.append(k, one);
  }
  qs.set(FSPLIT_PARAM, "test");
  return `${SPLIT_TARGET[from]}?${qs.toString()}`;
}

