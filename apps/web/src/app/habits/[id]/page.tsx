import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { PageContainer } from "@/components/page-container";

import { HabitDetail } from "./habit-detail";

export const dynamic = "force-dynamic";

/**
 * Per-habit detail (web) — parity with apps/mobile/app/habit/[id].tsx:
 * rename, current/best streak + 30-day rate, the history calendar, notes
 * (feeds the debrief matcher), active days, and archive. Reminders are a
 * device-notification concern and stay on mobile for now.
 */
export default async function HabitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");
  const { id } = await params;

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <PageContainer mobileWidth="3xl" className="acuity-fade-up">
        <HabitDetail id={id} />
      </PageContainer>
    </div>
  );
}
