/**
 * POST /api/creator-desk — the creator desk's only two actions:
 *   { action: "add", handle, firstName, email, code? }  → add + code + invite + free Pro
 *   { action: "resend", creatorId }                      → resend the dashboard invite
 * Signed-in session required; email must be on the desk list (or full admin).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id ?? null;
  const { canUseCreatorDesk } = await import("@/lib/creators/desk");
  if (!(await canUseCreatorDesk(userId))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { checkRateLimit, limiters, rateLimitedResponse } = await import("@/lib/rate-limit");
  const rl = await checkRateLimit(limiters.userWrite, `creator-desk:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const { logAdminAction } = await import("@/lib/admin-audit");
  try {
    if (b.action === "add") {
      const { addCreatorDirect } = await import("@/lib/creators/admin");
      if (!s(b.handle) || !s(b.firstName) || !s(b.email)) {
        return NextResponse.json({ error: "Handle, first name and email are required." }, { status: 400 });
      }
      const r = await addCreatorDirect({
        handle: s(b.handle),
        firstName: s(b.firstName),
        email: s(b.email),
        code: s(b.code) || undefined,
        sendInvite: true,
        by: `desk:${userId}`,
      });
      await logAdminAction({ adminUserId: userId!, action: "creators.desk-add", targetUserId: null, metadata: { handle: b.handle, email: b.email, code: r.code } }).catch(() => {});
      return NextResponse.json({
        ok: true,
        code: r.code,
        message: [`Added with code ${r.code}. Dashboard invite sent.`, r.codeNote, r.proNote].filter(Boolean).join(" "),
      });
    }
    if (b.action === "resend") {
      const { prisma } = await import("@/lib/prisma");
      const c = await prisma.ugcCreator.findUnique({ where: { id: s(b.creatorId) }, select: { id: true, referralCode: true, email: true } });
      if (!c?.referralCode || !c.email) return NextResponse.json({ error: "That creator isn't in the program yet." }, { status: 400 });
      const { onCreatorDeal } = await import("@/lib/creators/admin");
      await onCreatorDeal(c.id, { resend: true });
      await logAdminAction({ adminUserId: userId!, action: "creators.desk-resend", targetUserId: null, metadata: { creatorId: c.id } }).catch(() => {});
      return NextResponse.json({ ok: true, message: `Invite re-sent to ${c.email}.` });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 400 });
  }
}
