import "server-only";

import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Shared helper for admin API routes. Returns { ok: true, userId } on
 * success, or a Response to send back (401 / 403) on failure.
 *
 * Why not the existing admin/layout.tsx gate? That's for the page
 * tree; API routes need their own gate because they're called from
 * the admin-dashboard client code after the layout's already rendered.
 */
export type AdminGuardResult =
  | { ok: true; adminUserId: string }
  | { ok: false; response: Response };

export async function requireAdmin(): Promise<AdminGuardResult> {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "content-type": "application/json" } }
      ),
    };
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { "content-type": "application/json" } }
      ),
    };
  }

  return { ok: true, adminUserId: session.user.id };
}
