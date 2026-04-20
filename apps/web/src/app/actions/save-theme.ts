"use server";

import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/lib/auth";

const VALID = new Set(["light", "dark", "system"] as const);
type ThemeChoice = "light" | "dark" | "system";

/**
 * Persist the user's theme choice to the DB. Called from the client
 * theme-toggle component after every switch. Stores "light" or "dark"
 * for explicit picks; "system" is stored as NULL so we don't keep a
 * stale preference the next time the user's OS preference changes.
 *
 * No-op on unauth (e.g. theme toggle on /auth/signin) — next-themes
 * still persists to localStorage, which covers that surface.
 */
export async function saveThemePreference(
  choice: string
): Promise<{ ok: boolean }> {
  if (!VALID.has(choice as ThemeChoice)) {
    return { ok: false };
  }

  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return { ok: false };
  }

  const { prisma } = await import("@/lib/prisma");
  await prisma.user.update({
    where: { id: session.user.id },
    data: { theme: choice === "system" ? null : choice },
  });

  return { ok: true };
}
