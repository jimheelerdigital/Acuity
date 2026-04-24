import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { BackButton } from "@/components/back-button";
import { getAuthOptions } from "@/lib/auth";
import { getUserProgression } from "@/lib/userProgression";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { PageContainer } from "@/components/page-container";

import { ThemeMapClient } from "./theme-map-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Theme Map — Acuity",
  robots: { index: false, follow: false },
};

/**
 * Theme Evolution Map — force-directed graph of the user's extracted
 * themes across a selectable time window. Server component owns the
 * session check; the client component owns all interactivity
 * (dynamic() loaded force-graph-2d touches canvas, can't SSR).
 */
export default async function ThemeMapPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/insights/theme-map");

  const progression = await getUserProgression(session.user.id);

  return (
    <div className="min-h-screen">
      <PageContainer mobileWidth="2xl">
        {progression.unlocked.themeMap ? (
          <ThemeMapClient />
        ) : (
          <>
            <BackButton className="mb-6" ariaLabel="Back to Insights" />
            <h1 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              Theme Map
            </h1>
            <LockedFeatureCard unlockKey="themeMap" progression={progression} />
          </>
        )}
      </PageContainer>
    </div>
  );
}
