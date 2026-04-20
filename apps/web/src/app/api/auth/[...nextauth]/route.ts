import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import {
  checkRateLimit,
  identifierFromRequest,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Lazily create the handler so getAuthOptions() (and prisma) are never
// instantiated at module load time during the Next.js build phase.
let _handler: ReturnType<typeof NextAuth> | undefined;
function getHandler() {
  return (_handler ??= NextAuth(getAuthOptions()));
}

/**
 * Apply rate limiting only to POSTs hitting the credentials/email/callback
 * surface — these are the abuse-prone actions (magic-link send, OAuth
 * callback token exchange). GETs (session reads, provider list) are
 * frequent and cheap; limiting them would cause real-user friction
 * without security benefit.
 *
 * Budget: 5 requests / 15 min / IP (SECURITY_AUDIT §S5).
 */
async function maybeRateLimit(req: Request): Promise<Response | null> {
  if (req.method !== "POST") return null;
  const identifier = identifierFromRequest(req, "auth");
  const rl = await checkRateLimit(limiters.auth, identifier);
  if (!rl.success) return rateLimitedResponse(rl);
  return null;
}

export async function GET(req: NextRequest, ctx: unknown) {
  // Method-agnostic wrapper; maybeRateLimit no-ops on GET.
  const rlResponse = await maybeRateLimit(req);
  if (rlResponse) return rlResponse;
  return getHandler()(req, ctx);
}

export async function POST(req: NextRequest, ctx: unknown) {
  const rlResponse = await maybeRateLimit(req);
  if (rlResponse) return rlResponse;
  return getHandler()(req, ctx);
}
