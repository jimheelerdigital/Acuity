import "server-only";

/**
 * Creator dashboard auth: no passwords. A magic link carries a signed,
 * 7-day token; opening it sets a signed 30-day session cookie. Both embed
 * UgcCreator.dashboardTokenVersion, so bumping it revokes every link and
 * session at once.
 *
 * Format (both): base64url(JSON payload).base64url(HMAC-SHA256), keyed on
 * NEXTAUTH_SECRET with a creator-specific prefix so these can never be
 * confused with unsubscribe tokens.
 */

import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "rp_creator_session";
/** Set (to the creator id) when an admin opens a dashboard via "View as creator". */
export const ADMIN_VIEW_COOKIE = "rp_creator_admin_view";
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface Payload {
  c: string; // creatorId
  v: number; // dashboardTokenVersion
  k: "link" | "session";
  e: number; // expires (unix ms)
}

function key(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET missing — cannot sign creator tokens");
  return `creator-dashboard:${s}`;
}

function sign(p: Payload): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token: string, kind: Payload["k"]): { creatorId: string; version: number } | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", key()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (p.k !== kind || typeof p.c !== "string" || p.e < Date.now()) return null;
    return { creatorId: p.c, version: p.v };
  } catch {
    return null;
  }
}

export function signMagicLinkToken(creatorId: string, version: number): string {
  return sign({ c: creatorId, v: version, k: "link", e: Date.now() + LINK_TTL_MS });
}

export function signSessionToken(creatorId: string, version: number): string {
  return sign({ c: creatorId, v: version, k: "session", e: Date.now() + SESSION_TTL_MS });
}

export const verifyMagicLinkToken = (t: string) => verify(t, "link");
export const verifySessionToken = (t: string) => verify(t, "session");

/** The signed-in creator for this request, or null. */
export async function currentCreatorId(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const s = verifySessionToken(raw);
  if (!s) return null;
  const { prisma } = await import("@/lib/prisma");
  const c = await prisma.ugcCreator.findUnique({
    where: { id: s.creatorId },
    select: { id: true, dashboardTokenVersion: true, referralCode: true },
  });
  if (!c?.referralCode || c.dashboardTokenVersion !== s.version) return null;
  return c.id;
}
