"use server";

import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/lib/auth";

/**
 * Mark the signed-in user's onboarding as complete. Called from the
 * final step's Finish button. Idempotent — safe to call multiple
 * times; existing completedAt is preserved on re-run.
 */
export async function completeOnboarding(): Promise<{ ok: boolean }> {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) return { ok: false };

  const { prisma } = await import("@/lib/prisma");
  await prisma.userOnboarding.upsert({
    where: { userId: session.user.id },
    update: { completedAt: new Date(), currentStep: 8 },
    create: {
      userId: session.user.id,
      completedAt: new Date(),
      currentStep: 8,
    },
  });
  return { ok: true };
}
