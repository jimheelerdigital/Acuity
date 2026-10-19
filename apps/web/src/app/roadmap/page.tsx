import Link from "next/link";
import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/lib/auth";
import { isRoadmapStatus, listRoadmap } from "@/lib/roadmap";

import { RoadmapBoard } from "./roadmap-board";

export const metadata = {
  title: "Roadmap · Ripple",
  description:
    "What Ripple is building next, what's being considered, and what just shipped. Vote on what matters to you.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/roadmap" },
};

export const dynamic = "force-dynamic";

/**
 * Public roadmap (2026-10-18; tabs + detail pages 2026-10-19). Tabs —
 * Building, Planned, Vote, Shipped — curated in /admin/roadmap; every card
 * opens /roadmap/[id]. Anyone can read; voting needs an
 * account (web session here, bearer in the app's Profile → Roadmap screen,
 * same API). "Suggest an idea" posts into the existing feedback funnel
 * (/api/feedback/submit → Slack), so ideas arrive where bugs already do.
 *
 * Same marketing register as /support: public + indexable, dark palette.
 */
export default async function RoadmapPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const initialTab = isRoadmapStatus(searchParams?.tab) ? searchParams?.tab : undefined;
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id ?? null;
  const { prisma } = await import("@/lib/prisma");
  const items = await listRoadmap(prisma, userId);

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <main className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-acuity-text-sec transition hover:text-acuity-text"
        >
          ← Back to Ripple
        </Link>

        <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl">
          Roadmap
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-acuity-text-sec">
          What we&rsquo;re building, what we&rsquo;re weighing up, and what
          just shipped. Upvote what would make Ripple better for you — it
          genuinely changes the order we build in.
        </p>

        <RoadmapBoard initialItems={items} signedIn={!!userId} initialTab={initialTab} />
      </main>
    </div>
  );
}
