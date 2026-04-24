import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { getUserProgression } from "@/lib/userProgression";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { PageContainer } from "@/components/page-container";

import { LifeMap } from "../insights/life-map";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Life Matrix — Acuity",
  robots: { index: false, follow: false },
};

export default async function LifeMatrixPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/life-matrix");

  const progression = await getUserProgression(session.user.id);

  return (
    <div className="min-h-screen">
      <PageContainer mobileWidth="5xl">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
            Reflect
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 lg:text-4xl">
            Life Matrix
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400 lg:text-base">
            Your life, decoded — across every area. Scores move as your
            debriefs reveal what&rsquo;s actually going on.
          </p>
        </header>

        {progression.unlocked.lifeMatrix ? (
          <LifeMap />
        ) : (
          <LockedFeatureCard unlockKey="lifeMatrix" progression={progression} />
        )}
      </PageContainer>
    </div>
  );
}
