import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";

import { ROADMAP_STATUS_META, roadmapVotingOpen } from "@acuity/shared";

import { getAuthOptions } from "@/lib/auth";
import { getRoadmapItem, type RoadmapItemDetailDTO } from "@/lib/roadmap";

import { categoryLabel, contextLine } from "../roadmap-format";
import { CategoryBanner, StatusPill, VoteButton } from "../roadmap-ui";

export const dynamic = "force-dynamic";

/**
 * Roadmap detail page (2026-10-19). Jimmy: "I want things that are shipped
 * to have detail pages so I can click on it, see what was released, and
 * learn more. Same for upcoming things." Modelled on the LeanIX roadmap's
 * item pages: banner, status + timing, then why / what / highlights, and
 * for shipped items how to use it. Voting stays here for open items.
 */

async function load(id: string, userId: string | null) {
  const { prisma } = await import("@/lib/prisma");
  return getRoadmapItem(prisma, id, userId);
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const item = await load(params.id, null);
  if (!item) return { title: "Roadmap · Ripple" };
  return {
    title: `${item.title} · Ripple roadmap`,
    description: item.summary,
    robots: { index: true, follow: true },
    // The root layout's canonical is the homepage; each item is its own page.
    alternates: { canonical: `/roadmap/${item.id}` },
  };
}

/** Section headings change with the item's stage. */
function headings(item: RoadmapItemDetailDTO) {
  const shipped = item.status === "shipped";
  return {
    problem: "Why it matters",
    solution: shipped ? "What shipped" : item.status === "considering" ? "The idea" : "What we're building",
    highlights: shipped ? "What's included" : "What it will do",
    howTo: "How to use it",
  };
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="mt-3 whitespace-pre-line text-base leading-relaxed text-acuity-text-sec">
          {p}
        </p>
      ))}
    </>
  );
}

export default async function RoadmapItemPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id ?? null;
  const item = await load(params.id, userId);
  if (!item) notFound();

  const h = headings(item);
  const context = contextLine(item);
  const cat = categoryLabel(item.category);
  const backHref = `/roadmap?tab=${item.status}`;

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-acuity-text-sec transition hover:text-acuity-text"
        >
          ← {ROADMAP_STATUS_META[item.status].label}
        </Link>

        <div className="mt-6">
          <CategoryBanner category={item.category} size="hero" />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <StatusPill status={item.status} />
          {cat ? <span className="text-sm text-acuity-text-quiet">{cat}</span> : null}
          {context ? <span className="text-sm text-acuity-text-sec">· {context}</span> : null}
        </div>

        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{item.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-acuity-text-sec">{item.summary}</p>

        {roadmapVotingOpen(item.status) ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <VoteButton item={item} signedIn={!!userId} returnTo={`/roadmap/${item.id}`} size="large" />
            <span className="text-sm text-acuity-text-quiet">Votes change the order we build in.</span>
          </div>
        ) : null}

        <div className="mt-10 space-y-10">
          {item.problem ? (
            <section>
              <h2 className="text-lg font-semibold">{h.problem}</h2>
              <Paragraphs text={item.problem} />
            </section>
          ) : null}
          {item.solution ? (
            <section>
              <h2 className="text-lg font-semibold">{h.solution}</h2>
              <Paragraphs text={item.solution} />
            </section>
          ) : null}
          {item.highlights.length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold">{h.highlights}</h2>
              <ul className="mt-3 space-y-2">
                {item.highlights.map((line, i) => (
                  <li key={i} className="flex gap-3 text-base leading-relaxed text-acuity-text-sec">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-acuity-primary" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {item.howTo && item.status === "shipped" ? (
            <section className="rounded-2xl border border-acuity-card-border bg-acuity-card-bg p-5">
              <h2 className="text-lg font-semibold">{h.howTo}</h2>
              <Paragraphs text={item.howTo} />
            </section>
          ) : null}
          {!item.hasDetails ? (
            <p className="text-sm text-acuity-text-quiet">More detail coming soon.</p>
          ) : null}
        </div>

        <div className="mt-16 border-t border-acuity-card-border pt-8">
          <p className="text-sm text-acuity-text-sec">
            Got a related idea?{" "}
            <Link href="/roadmap#suggest" className="text-acuity-primary underline-offset-4 hover:underline">
              Tell us
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
