import nextDynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { getUserEntitlement } from "@/lib/entitlements-fetch";
import { getUserProgression } from "@/lib/userProgression";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { ProLockedCard } from "@/components/pro-locked-card";
import { PageContainer } from "@/components/page-container";

const WhatRippleKnows = nextDynamic(
  () => import("../what-ripple-knows").then((m) => m.WhatRippleKnows),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-acuity-text/20 border-t-acuity-text" />
      </div>
    ),
  },
);

export const dynamic = "force-dynamic";

export const metadata = {
  title: "What Ripple knows about you — Ripple",
  robots: { index: false, follow: false },
};

/**
 * /insights/knows — the memory file, read back to the user.
 *
 * Read-only view over `UserMemory` (the same row the Life Matrix radar
 * reads), rendered by `../what-ripple-knows.tsx`.
 *
 * ── Gate ─────────────────────────────────────────────────────────────
 * Deliberately IDENTICAL to `/life-matrix`, not a new one:
 *   1. no session          → /auth/signin
 *   2. canExtractEntries false (FREE post-trial) → <ProLockedCard>
 *   3. lifeMatrix not yet unlocked               → <LockedFeatureCard>
 *
 * It reuses the `life_matrix_locked` surface id and the `lifeMatrix`
 * unlock key on purpose. Both are closed unions in @acuity/shared, and
 * this surface reads the exact same UserMemory data behind the exact
 * same PRO boundary — a new key would be a second gate to keep in sync
 * for no behavioural difference.
 */
export default async function WhatRippleKnowsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/insights/knows");

  const progression = await getUserProgression(session.user.id);
  const entitlement = await getUserEntitlement(session.user.id);
  const isProLocked = entitlement?.canExtractEntries === false;

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <PageContainer mobileWidth="4xl">
        <header className="acuity-fade-up mb-10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Memory
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight text-acuity-text lg:text-5xl">
            What Ripple knows about you
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-acuity-text-sec">
            Everything you&rsquo;ve said out loud, kept in one place. The file
            gets thicker every time you record.
          </p>
        </header>

        {isProLocked ? (
          <ProLockedCard surfaceId="life_matrix_locked" />
        ) : progression.unlocked.lifeMatrix ? (
          <WhatRippleKnows />
        ) : (
          <LockedFeatureCard unlockKey="lifeMatrix" progression={progression} />
        )}
      </PageContainer>
    </div>
  );
}
