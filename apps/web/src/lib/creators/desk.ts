import "server-only";

/**
 * Creator desk (2026-10-26, per Keenan): a narrow page for an automated
 * assistant (ChatGPT agent) to put creators who said yes into the program.
 * It can ONLY add creators and resend their invite. No payouts, ledger,
 * customer data, flags or ads; those stay behind full admin.
 *
 * Access: signed-in accounts whose email is listed here, plus full admins.
 */
import { prisma } from "@/lib/prisma";

export const CREATOR_DESK_EMAILS = ["chatgpt123@gmail.com"];

export async function canUseCreatorDesk(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, isAdmin: true } });
  if (!u) return false;
  return u.isAdmin || CREATOR_DESK_EMAILS.includes(u.email.toLowerCase());
}
