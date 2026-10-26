import "server-only";

/**
 * Referral SUGGESTION (2026-10-25, Jimmy: "way more seamless"). Someone taps
 * goripple.io/c/<CODE> on their iPhone and installs from the App Store. The
 * install carries nothing, so the app asks: "did this network tap a referral
 * link recently?" If yes, sign-up shows "Referred by Tess?" for the person
 * to CONFIRM. A suggestion never credits anyone on its own; only the
 * person's tap does (then it goes through Road 2, POST /api/creators/code),
 * because shared IPs (offices, carrier NAT) make an IP match a guess.
 */
import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

/** How far back a link tap still counts as "just now". */
export const SUGGEST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Same hash the /c/<code> route stores, so the two can be compared. */
export function hashIp(ip: string | null | undefined): string | null {
  const v = (ip ?? "").trim();
  if (!v) return null;
  return createHash("sha256").update(`${process.env.NEXTAUTH_SECRET ?? ""}:${v}`).digest("hex").slice(0, 32);
}

export function ipFromHeaders(headers: Headers): string | null {
  return (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
}

export interface Suggestion {
  code: string;
  firstName: string;
}

/** Most recent link tap from this IP within the window, or null. */
export async function suggestForIpHash(
  ipHash: string | null,
  now: Date = new Date()
): Promise<{ creatorId: string } | null> {
  if (!ipHash) return null;
  const click = await prisma.creatorReferralClick.findFirst({
    where: { ipHash, createdAt: { gte: new Date(now.getTime() - SUGGEST_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { creatorId: true },
  });
  return click ? { creatorId: click.creatorId } : null;
}
