import nextDynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { getUserEntitlement } from "@/lib/entitlements-fetch";
import { getUserProgression } from "@/lib/userProgression";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { ProLockedCard } from "@/components/pro-locked-card";
import { PageContainer } from "@/components/page-container";

const LifeMap = nextDynamic(
  () => import("../insights/life-map").then((m) => m.LifeMap),
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
  title: "Life Matrix — Ripple",
  robots: { index: false, follow: false },
};

/**
 * /life-matrix — direct entry point for the 10-axis Life Matrix
 * radar. Embeds the shared `<LifeMap>` component (lives under
 * /insights/life-map.tsx). The radar itself owns its empty-axis
 * treatment + biggest-moves rows + axis-label positioning per
 * Phase D / Phase E polish.
 *
 * Slice 11 (2026-05-22): wrapped in `data-theme="dark"` so the
 * canonical surface tokens activate. Header chrome refreshed —
 * display font for the title, mono uppercase eyebrow, generous
 * subtitle in textSec. The radar component itself stays untouched
 * — full SVG refresh is its own dedicated slice if needed.
 */
export default async function LifeMatrixPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/life-matrix");

  const progression = await getUserProgression(session.user.id);
  // §B.2.2 — direct deep-link entry point for Life Matrix. FREE
  // post-trial users see the billing gate.
  const entitlement = await getUserEntitlement(session.user.id);
  const isProLocked = entitlement?.canExtractEntries === false;

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <PageContainer mobileWidth="5xl">
        <header className="acuity-fade-up mb-10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Reflect
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight text-acuity-text lg:text-5xl">
            Life Matrix
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-acuity-text-sec">
            Your life, axis by axis. Scores move as your debriefs reveal
            what&rsquo;s actually going on.
          </p>
        </header>

        {isProLocked ? (
          <ProLockedCard surfaceId="life_matrix_locked" />
        ) : progression.unlocked.lifeMatrix ? (
          <LifeMap />
        ) : (
          <LockedFeatureCard unlockKey="lifeMatrix" progression={progression} />
        )}
      </PageContainer>
    </div>
  );
}
