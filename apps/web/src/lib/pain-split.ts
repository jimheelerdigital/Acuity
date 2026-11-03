/**
 * Pain-funnel split (2026-11-02, per Keenan). Ads point at /start-pain, which
 * sends each new visitor to one of five pain-first funnels, an equal share each:
 * /start-relief (mental load), /start-catch (things slip), /start-clarity
 * (hidden pattern), /start-progress (no progress), /start-focus (scattered
 * brain / ADHD, added later the same day).
 *
 *   - flag `funnel_pain_split` OFF → /start-pain sends everyone to
 *     /start-relief, unmarked (so the funnels can be previewed directly).
 *   - flag ON → the saved arm from the acuity_psplit cookie, else a random
 *     one. 307 to that funnel with every query param kept plus ?psplit=<arm>;
 *     FunnelV9 there sets the cookie and logs funnel_split_arm=pain-<arm>.
 *
 * Compare by flowVersion (v9-pain / v9-slip / v9-loop / v9-progress), limited
 * to sessions that logged a pain-* funnel_split_arm. The flag is read with a
 * 30-second memo, so switching it off takes effect within a minute.
 */
import { prisma } from "@/lib/prisma";
import { PAIN_ARMS, PAIN_SPLIT_FLAG, PSPLIT_PARAM, parsePainArm, type PainArm } from "@/lib/pain-split-shared";

export * from "@/lib/pain-split-shared";

const TTL_MS = 30_000;
let memo: { at: number; on: boolean } | null = null;

export async function isPainSplitOn(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && process.env.PAIN_SPLIT_FORCE) {
    return process.env.PAIN_SPLIT_FORCE === "on";
  }
  if (memo && Date.now() - memo.at < TTL_MS) return memo.on;
  let on = false;
  try {
    const row = await prisma.featureFlag.findUnique({
      where: { key: PAIN_SPLIT_FLAG },
      select: { enabled: true, rolloutPercentage: true },
    });
    on = !!row?.enabled && row.rolloutPercentage > 0;
  } catch {
    on = false;
  }
  memo = { at: Date.now(), on };
  return on;
}

export function pickPainArm(cookieValue: string | undefined): PainArm {
  const saved = parsePainArm(cookieValue);
  if (saved) return saved;
  const arms = Object.keys(PAIN_ARMS) as PainArm[];
  return arms[Math.floor(Math.random() * arms.length)];
}

/** The arm's funnel URL carrying every incoming query param (plus ?psplit when marked). */
export function painArmUrl(arm: PainArm, searchParams: Record<string, string | string[] | undefined>, mark: boolean): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === PSPLIT_PARAM) continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (typeof v === "string") qs.set(k, v);
  }
  if (mark) qs.set(PSPLIT_PARAM, arm);
  const q = qs.toString();
  return `${PAIN_ARMS[arm]}${q ? `?${q}` : ""}`;
}
