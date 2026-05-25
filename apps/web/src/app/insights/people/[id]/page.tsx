import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Avatar, Card, SectionHeader } from "@/components/acuity";
import { BackButton } from "@/components/back-button";
import { getAuthOptions } from "@/lib/auth";

import { PersonDisplayNameEditor } from "./_components/person-display-name-editor";

/**
 * /insights/people/[id] — single-person detail surface. Slice 5 v1.2.
 *
 * Composition (top to bottom):
 *   - Header: large Avatar + editable displayName + "Mentioned N
 *     times since [first mention date]"
 *   - Sentiment band: stacked bar of positive / neutral / challenging
 *     mood proportions across the entries that mention this person.
 *     Source: Entry.mood enum. Renders nothing when fewer than 2
 *     entries have a mood — small samples are too noisy.
 *   - Care pattern card: "You've mentioned [name] N times this
 *     month. Mostly in the context of [top theme]." Surfaces only
 *     when there's a clear monthly + theme signal.
 *   - Timeline: reverse-chronological list of entries that mention
 *     this person, with the context snippet bold-highlighting the
 *     mention. Click row → /entries/[id].
 *
 * Copy rule (Acuity_SalesCopy.md): we surface frequency and tonal
 * patterns. We do NOT characterize the user's relationship with the
 * person. No "you seem distant from…", no "your bond with…".
 */

const TIMELINE_LIMIT = 50;
const MONTHLY_THRESHOLD_DAYS = 30;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Person — Insights — Acuity",
  robots: { index: false, follow: false },
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimelineDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface MoodTally {
  positive: number;
  neutral: number;
  challenging: number;
}

// Map Entry.mood enum keys to one of three buckets for the sentiment
// band. Free-form values fall to neutral so the band stays honest
// when the upstream mood enum grows.
const MOOD_BUCKETS: Record<string, keyof MoodTally> = {
  GREAT: "positive",
  GOOD: "positive",
  OK: "neutral",
  MEH: "neutral",
  ROUGH: "challenging",
  HARD: "challenging",
  AWFUL: "challenging",
};

function bucketMood(mood: string | null): keyof MoodTally | null {
  if (!mood) return null;
  return MOOD_BUCKETS[mood] ?? null;
}

function pctFor(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Highlight the `mentionText` inside a context snippet by wrapping
 * the first case-sensitive occurrence in <strong>. Falls back to the
 * raw context when the mention isn't found (NER drift between
 * detection and display).
 */
function highlightContext(context: string, mentionText: string): string {
  const escapedContext = escapeHtml(context);
  const escapedMention = escapeHtml(mentionText);
  const idx = escapedContext.indexOf(escapedMention);
  if (idx === -1) return escapedContext;
  return (
    escapedContext.slice(0, idx) +
    `<strong>${escapedMention}</strong>` +
    escapedContext.slice(idx + escapedMention.length)
  );
}

export default async function PersonDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/insights/people/${params.id}`);
  }
  const userId = session.user.id;

  const { prisma } = await import("@/lib/prisma");

  const person = await prisma.person.findFirst({
    where: { id: params.id, userId },
    select: {
      id: true,
      displayName: true,
      mentionCount: true,
      firstMentionedAt: true,
      archived: true,
    },
  });
  if (!person || person.archived) notFound();

  // Timeline + sentiment in a single mention query; join the entry
  // fields we need for the row + the mood bucket aggregation.
  const mentions = await prisma.entityMention.findMany({
    where: { personId: person.id },
    orderBy: { createdAt: "desc" },
    take: TIMELINE_LIMIT,
    select: {
      id: true,
      entryId: true,
      mentionText: true,
      context: true,
      createdAt: true,
      entry: {
        select: {
          id: true,
          createdAt: true,
          summary: true,
          mood: true,
          themes: true,
        },
      },
    },
  });

  // Sentiment band — tally entry moods across all timeline entries.
  // Same-entry duplicates only count once so a chatty mention pattern
  // doesn't double-weight the bar.
  const seenEntries = new Set<string>();
  const tally: MoodTally = { positive: 0, neutral: 0, challenging: 0 };
  for (const m of mentions) {
    if (!m.entry || seenEntries.has(m.entry.id)) continue;
    seenEntries.add(m.entry.id);
    const bucket = bucketMood(m.entry.mood);
    if (bucket) tally[bucket] += 1;
  }
  const totalMood = tally.positive + tally.neutral + tally.challenging;
  const showSentimentBand = totalMood >= 2;

  // Care pattern — count of mentions in the last 30 days + most
  // common theme across the entries that contain them.
  const recentCutoff = new Date(
    Date.now() - MONTHLY_THRESHOLD_DAYS * 86400_000
  );
  let recentCount = 0;
  const themeTally = new Map<string, number>();
  for (const m of mentions) {
    if (!m.entry) continue;
    if (m.entry.createdAt >= recentCutoff) {
      recentCount += 1;
      for (const t of m.entry.themes) {
        themeTally.set(t, (themeTally.get(t) ?? 0) + 1);
      }
    }
  }
  let topTheme: string | null = null;
  let topThemeCount = 0;
  for (const [theme, count] of themeTally.entries()) {
    if (count > topThemeCount) {
      topTheme = theme;
      topThemeCount = count;
    }
  }
  const showCarePattern = recentCount >= 2 && topTheme && topThemeCount >= 2;

  const initials = initialsFor(person.displayName);

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <main className="acuity-fade-up mx-auto max-w-2xl px-6 py-10">
        <BackButton className="mb-6" ariaLabel="Back to People" />

        <header className="mb-8">
          <div className="flex items-center gap-4">
            <Avatar initials={initials} size={64} />
            <div className="min-w-0 flex-1">
              <PersonDisplayNameEditor
                personId={person.id}
                initialName={person.displayName}
              />
              <p className="mt-1 text-[13px] text-acuity-text-ter">
                Mentioned {person.mentionCount}{" "}
                {person.mentionCount === 1 ? "time" : "times"} since{" "}
                {formatDate(person.firstMentionedAt)}
              </p>
            </div>
          </div>
        </header>

        {showSentimentBand && (
          <section className="mb-8">
            <SectionHeader label="When you mention them" />
            <div className="mt-3">
              <div className="flex h-2 overflow-hidden rounded-full">
                <div
                  style={{
                    width: `${pctFor(tally.positive, totalMood)}%`,
                    backgroundColor: "var(--acuity-good)",
                  }}
                />
                <div
                  style={{
                    width: `${pctFor(tally.neutral, totalMood)}%`,
                    backgroundColor: "var(--acuity-text-ter)",
                  }}
                />
                <div
                  style={{
                    width: `${pctFor(tally.challenging, totalMood)}%`,
                    backgroundColor: "var(--acuity-warn)",
                  }}
                />
              </div>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[1.4px] text-acuity-text-ter">
                {pctFor(tally.positive, totalMood)}% positive ·{" "}
                {pctFor(tally.neutral, totalMood)}% neutral ·{" "}
                {pctFor(tally.challenging, totalMood)}% challenging
              </p>
            </div>
          </section>
        )}

        {showCarePattern && topTheme && (
          <section className="mb-8">
            <Card variant="default" radius="xl" padding={6}>
              <SectionHeader label="Pattern" />
              <p className="mt-3 text-[15px] leading-relaxed text-acuity-text">
                You&apos;ve mentioned{" "}
                <span className="font-semibold">{person.displayName}</span>{" "}
                {recentCount} times this month. Mostly in the context of{" "}
                <span className="font-semibold">{topTheme}</span>.
              </p>
            </Card>
          </section>
        )}

        <section>
          <SectionHeader label="Timeline" count={mentions.length} />
          {mentions.length === 0 ? (
            <p className="mt-3 text-[14px] text-acuity-text-sec">
              No mentions yet.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {mentions.map((m) => {
                if (!m.entry) return null;
                return (
                  <Link
                    key={m.id}
                    href={`/entries/${m.entry.id}`}
                    className="block transition hover:brightness-105"
                  >
                    <Card variant="tinted" radius="lg" padding={4}>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
                        {formatTimelineDate(m.entry.createdAt)}
                      </p>
                      <p
                        className="mt-1 text-[14px] leading-relaxed text-acuity-text-sec"
                        dangerouslySetInnerHTML={{
                          __html: `…${highlightContext(m.context, m.mentionText)}…`,
                        }}
                      />
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
