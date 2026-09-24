import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { PageContainer } from "@/components/page-container";

import { ArchivedHabits } from "./archived-list";

export const dynamic = "force-dynamic";

/**
 * Archived habits (web) — parity with apps/mobile/app/habits-archived.tsx.
 * Lists soft-deleted habits and restores them. Restore can fail at the
 * active-habit cap; the server's message is surfaced verbatim.
 */
export default async function ArchivedHabitsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <PageContainer mobileWidth="3xl" className="acuity-fade-up">
        <ArchivedHabits />
      </PageContainer>
    </div>
  );
}
