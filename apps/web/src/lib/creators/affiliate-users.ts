import "server-only";

/**
 * Which app accounts belong to affiliate creators (2026-10-27, per Keenan:
 * "make sure they're listed as an affiliate creator within the 'users'
 * dashboard any time this happens"). A creator who signs up with their
 * creator email gets free Pro (autoGrantCreatorPerk), so without a label
 * they read as an organic paying/trial user.
 *
 * Match: the account email equals a UgcCreator.email (case-insensitive),
 * plus EXTRA_AFFILIATE_EMAILS for creators we work with whose app account
 * isn't tied to a creator record.
 */
import { prisma } from "@/lib/prisma";

/** email → label shown in the dashboard (an @handle, or "" for no handle). */
const EXTRA_AFFILIATE_EMAILS: Record<string, string> = {
  // Jillian Oasachuk, free account; per Keenan 2026-10-27.
  "jillianoasachuk@simplyconnectedtherapy.ca": "",
};

export interface AffiliateTag {
  handle: string | null;
}

export async function affiliateTagsForEmails(emails: (string | null | undefined)[]): Promise<Map<string, AffiliateTag>> {
  const wanted = [...new Set(emails.filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
  const out = new Map<string, AffiliateTag>();
  if (!wanted.length) return out;
  for (const e of wanted) if (e in EXTRA_AFFILIATE_EMAILS) out.set(e, { handle: EXTRA_AFFILIATE_EMAILS[e] || null });
  const creators = await prisma.ugcCreator.findMany({
    where: { OR: wanted.map((e) => ({ email: { equals: e, mode: "insensitive" as const } })) },
    select: { email: true, handle: true },
  });
  for (const c of creators) if (c.email) out.set(c.email.toLowerCase(), { handle: c.handle ?? null });
  return out;
}
