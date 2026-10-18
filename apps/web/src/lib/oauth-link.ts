import type { PrismaClient } from "@prisma/client";

import { revokeAllSessions } from "@/lib/session-revocation";

/**
 * Account-linking safety for Google / Apple sign-ins (2026-10-18).
 *
 * Shared by lib/auth.ts (web NextAuth signIn callback) and the native
 * callbacks (/api/auth/mobile-callback, /mobile-callback-apple). Call it
 * BEFORE attaching the provider to an existing row found by email.
 *
 * Rule: a password account whose email was never proven does not get to
 * keep its password once the mailbox owner shows up through OAuth. We
 * clear the password and end every session + MCP grant it has, then let
 * the OAuth sign-in proceed. A verified password account is left alone —
 * the owner linked a second method.
 *
 * Also stamps emailVerified: the provider attested the address.
 */
export async function secureOAuthLink(
  prisma: PrismaClient,
  existing: { id: string; passwordHash: string | null; emailVerified: Date | null },
  provider: "google" | "apple"
): Promise<{ supersededPassword: boolean }> {
  let supersededPassword = false;
  if (existing.passwordHash && !existing.emailVerified) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: null },
    });
    await revokeAllSessions(
      prisma,
      existing.id,
      `oauth-link-superseded-unverified-password:${provider}`
    );
    supersededPassword = true;
    try {
      await prisma.onboardingEvent.create({
        data: {
          userId: existing.id,
          event: "password_superseded_by_oauth",
          value: provider,
        },
      });
    } catch {
      // analytics only
    }
  }
  if (!existing.emailVerified) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { emailVerified: new Date() },
    });
  }
  return { supersededPassword };
}
