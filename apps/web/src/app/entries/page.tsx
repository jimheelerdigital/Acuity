import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { BackButton } from "@/components/back-button";
import { PageContainer } from "@/components/page-container";

import { EntriesListSection } from "./_sections/list";
import { EntriesListSkeleton } from "./_sections/skeletons";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "All entries — Acuity",
  robots: { index: false, follow: false },
};

/**
 * /entries — full chronological list of the user's entries with
 * client-side search and mood filter.
 *
 * Refactor pattern (matches /home):
 *   - Page is a thin shell. Auth gate is the only synchronous work.
 *   - The list lives inside a <Suspense> boundary so the page chrome
 *     (BackButton + heading) renders instantly while the 100-row
 *     fetch streams. Slow Prisma read no longer blocks the title
 *     paint.
 *
 * `take: 100` is the pragmatic ceiling for v1 — filtering happens
 * client-side against the pre-fetched list, matching mobile's
 * journal tab.
 */
export default async function EntriesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/entries");

  return (
    <div className="min-h-screen">
      {/* PageContainer fluid lets the list expand to the shell's
          width on lg+, up to 2240 at 2xl. The 2-column grid kicks in
          at 2xl: inside entries-list.tsx — pre-2026-04-29 the page
          was hard-capped at max-w-3xl regardless of viewport. */}
      <PageContainer mobileWidth="3xl" className="animate-fade-in">
        <div className="mb-6">
          <BackButton className="mb-4" ariaLabel="Back to Home" />
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            All entries
          </h1>
        </div>

        <Suspense fallback={<EntriesListSkeleton />}>
          <EntriesListSection userId={session.user.id} />
        </Suspense>
      </PageContainer>
    </div>
  );
}
