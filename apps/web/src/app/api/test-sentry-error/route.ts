/**
 * Admin-only Sentry smoke-test endpoint.
 *
 * Throws a tagged Error that the Sentry server SDK catches via its
 * Next.js route instrumentation. Jim hits this once after a deploy to
 * confirm the DSN + release + source-map upload are all wired up end-
 * to-end; the thrown error should appear in the Sentry dashboard
 * within ~30s with a readable stack trace.
 *
 * Gated on NextAuth session + User.isAdmin — never hit in normal
 * product flows. Non-admin callers get 401/403; Sentry is not touched.
 *
 * Pass ?kind=async to verify uncaught-promise-rejection capture, or
 * no param for a straight synchronous throw.
 */

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const kind = new URL(req.url).searchParams.get("kind");
  const marker = `acuity-sentry-smoke-${Date.now()}`;

  if (kind === "async") {
    await Promise.reject(
      new Error(`Acuity Sentry smoke test (async reject) — ${marker}`)
    );
  }

  throw new Error(`Acuity Sentry smoke test (sync throw) — ${marker}`);
}
