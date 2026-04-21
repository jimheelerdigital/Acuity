import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { ComparisonsCard } from "@/components/comparisons-card";
import { UserInsightsCard } from "@/components/user-insights-card";

import { InsightsView } from "./insights-view";
import { LifeMap } from "./life-map";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-4xl px-6 py-10 animate-fade-in">
        {/* Auto-flagged observations — top of the page so the user reads
            "here's what we noticed this week" before the full charts. */}
        <UserInsightsCard />

        <ComparisonsCard />

        {/* Life Matrix */}
        <section className="mb-12">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">Life Matrix</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Your life, decoded — across every area.
          </p>
          <LifeMap />
        </section>

        {/* Mood & Weekly Reports */}
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
            Mood & Weekly Reports
          </h2>
          <InsightsView />
        </section>
      </main>
    </div>
  );
}
