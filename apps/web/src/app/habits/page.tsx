import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { PageContainer } from "@/components/page-container";

import { HabitsClient } from "./habits-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Habits — Ripple",
  robots: { index: false, follow: false },
};

/**
 * /habits — web parity for the mobile habit tracker.
 *
 * Mirrors `apps/mobile/app/habits.tsx`: the same list, the same today
 * check-off, the same streak, computed by the same shared helpers in
 * `@acuity/shared/habits` so the two surfaces cannot disagree about what
 * a streak is. Web adds a calendar heatmap, which a phone has no room for.
 *
 * ── Gating ───────────────────────────────────────────────────────────
 * `ENABLE_HABITS` is a SERVER env var, so the gate lives here rather than
 * in the client component. `notFound()` rather than a "coming soon" page:
 * the API routes already answer 404 when the flag is off, and a surface
 * that 404s consistently at every layer is one nobody can half-discover.
 *
 * ── Why the data is fetched client-side ──────────────────────────────
 * Streaks are calendar-day questions and the SERVER does not reliably
 * know the user's local date — the same reasoning the API route documents
 * for returning raw checks instead of computed streaks. Fetching in the
 * client means `todayLocalDate()` is the browser's date, which is the one
 * the user is actually looking at.
 */
export default async function HabitsPage() {
  if (process.env.ENABLE_HABITS !== "1") notFound();

  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/habits");

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <PageContainer mobileWidth="4xl">
        <header className="acuity-fade-up mb-10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Habits
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight text-acuity-text lg:text-5xl">
            Habits
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-acuity-text-sec">
            The few things you want to keep doing. Check them off as you go —
            the streak counts the days you were meant to.
          </p>
        </header>

        <HabitsClient />
      </PageContainer>
    </div>
  );
}
