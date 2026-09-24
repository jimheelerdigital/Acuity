import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { PageContainer } from "@/components/page-container";

import { HabitList } from "./habit-list";

export const dynamic = "force-dynamic";

/**
 * Habits (web) — parity with the mobile Habits screen (apps/mobile/app/
 * habits.tsx). List, check off for today, streaks, add; each row links to
 * the per-habit detail page. Gated server-side by ENABLE_HABITS on the API
 * routes; if the flag is off the client fetch 404s and we show the empty
 * state rather than an error.
 */
export default async function HabitsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <PageContainer mobileWidth="3xl" className="acuity-fade-up">
        <HabitList />
      </PageContainer>
    </div>
  );
}
