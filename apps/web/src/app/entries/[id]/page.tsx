import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { MOOD_LABELS, PRIORITY_LABELS } from "@acuity/shared";
import type { Mood } from "@acuity/shared";

import { getAuthOptions } from "@/lib/auth";
import { BackButton } from "@/components/back-button";
import { EntryDeleteButtonWithRedirect } from "./entry-delete-button-wrapper";
import { MoodIcon } from "@/components/mood-icon";
import { ProLockedFooter } from "@/components/pro-locked-card";
import {
  Card,
  HeroCard,
  SectionHeader,
  ThemePill,
  type ThemeKey,
} from "@/components/acuity";

import { EntryStatusGate } from "./entry-status-gate";
import { ExtractionReview } from "./extraction-review";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Entry — Acuity",
  robots: { index: false, follow: false },
};

const CANONICAL_THEME_KEYS: ReadonlyArray<ThemeKey> = [
  "career",
  "family",
  "health",
  "avoidance",
  "money",
  "relationships",
  "sleep",
  "growth",
  "solitude",
];

/**
 * Map a free-text theme string to one of the canonical 9 hues for
 * `<ThemePill>`. Lowercase + lookup; falls through to `other` for
 * any user-generated theme that isn't in the canonical table. Matches
 * mobile's `hueForTheme()` fallback chain conceptually — full
 * FNV-1a hash-to-hue is deferred to slice 6b orbital work.
 */
function themeKeyFor(name: string): ThemeKey {
  const k = name.toLowerCase().trim();
  return (CANONICAL_THEME_KEYS as readonly string[]).includes(k)
    ? (k as ThemeKey)
    : "other";
}

/**
 * Extract a pull-quote from the entry summary — first sentence,
 * trimmed, never longer than ~180 chars. If the summary is short
 * enough (~120 chars or less), use the whole thing. Mirrors mobile's
 * entry-detail pull-quote treatment.
 */
function pullQuoteFor(summary: string): string {
  const trimmed = summary.trim();
  if (trimmed.length <= 120) return trimmed;
  // Find the first sentence break.
  const match = trimmed.match(/^[^.!?]+[.!?]/);
  if (match && match[0].length <= 180) return match[0].trim();
  // No clean sentence break in the first 180 chars; hard-truncate
  // on a word boundary.
  const head = trimmed.slice(0, 170);
  const lastSpace = head.lastIndexOf(" ");
  return `${head.slice(0, lastSpace > 0 ? lastSpace : 170).trim()}…`;
}

export default async function EntryDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/entries/${params.id}`);
  }

  const { prisma } = await import("@/lib/prisma");
  const entry = await prisma.entry.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      tasks: {
        select: {
          id: true,
          title: true,
          text: true,
          description: true,
          priority: true,
          status: true,
          groupId: true,
          dueDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!entry) notFound();

  const date = new Date(entry.createdAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const moodKey = entry.mood as Mood | null;
  const isComplete = entry.status === "COMPLETE";
  const pullQuote =
    isComplete && entry.summary ? pullQuoteFor(entry.summary) : null;

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <main className="acuity-fade-up mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <BackButton ariaLabel="Back to entries" />
          <EntryDeleteButtonWithRedirect entryId={entry.id} />
        </div>

        <header className="mb-8">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            {date}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {moodKey && (
              <span className="inline-flex items-center gap-2 text-base text-acuity-text">
                <MoodIcon mood={moodKey} size={22} />
                {MOOD_LABELS[moodKey]}
              </span>
            )}
            {entry.energy !== null && entry.energy !== undefined && (
              <span className="text-sm text-acuity-text-sec">
                Energy {entry.energy}/10
              </span>
            )}
            {entry.duration !== null && entry.duration !== undefined && (
              <span className="text-sm text-acuity-text-sec">
                {Math.round((entry.duration ?? 0) / 60)} min
              </span>
            )}
          </div>
        </header>

        {pullQuote && (
          <div className="mb-8">
            <HeroCard variant="primary" padding={7}>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
                Pull quote
              </p>
              <p className="mt-3 font-display text-2xl font-medium leading-snug text-acuity-text sm:text-3xl">
                “{pullQuote}”
              </p>
            </HeroCard>
          </div>
        )}

        {!isComplete && (
          <EntryStatusGate
            entryId={entry.id}
            initialStatus={entry.status as never}
            initialErrorMessage={entry.errorMessage}
            initialPartialReason={entry.partialReason}
          />
        )}

        {isComplete && <ExtractionReview entryId={entry.id} />}

        <div className="space-y-8">
          {isComplete && entry.summary && (
            <section>
              <SectionHeader label="Summary" />
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-acuity-text-sec">
                {entry.summary}
              </p>
            </section>
          )}

          {/* §B.2.6 Free-tier locked footer. Heuristic: entry is
              COMPLETE with a summary but no extraction artifacts →
              the FREE/Haiku branch produced this entry, so themes/
              tasks/goal flags are gated behind PRO. */}
          {isComplete &&
            entry.summary &&
            entry.themes.length === 0 &&
            entry.wins.length === 0 &&
            entry.blockers.length === 0 &&
            entry.tasks.length === 0 && <ProLockedFooter className="-mt-4" />}

          {isComplete && entry.themes.length > 0 && (
            <section>
              <SectionHeader label="Themes" count={entry.themes.length} />
              <div className="mt-3 flex flex-wrap gap-2">
                {entry.themes.map((t) => (
                  <ThemePill key={t} theme={themeKeyFor(t)} label={t} size="m" />
                ))}
              </div>
            </section>
          )}

          {isComplete && entry.wins.length > 0 && (
            <section>
              <SectionHeader label="Wins" count={entry.wins.length} />
              <ul className="mt-3 space-y-1.5">
                {entry.wins.map((w, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm text-acuity-text"
                  >
                    <span className="shrink-0 text-acuity-good">✓</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {isComplete && entry.blockers.length > 0 && (
            <section>
              <SectionHeader label="Blockers" count={entry.blockers.length} />
              <ul className="mt-3 space-y-1.5">
                {entry.blockers.map((b, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm text-acuity-text"
                  >
                    <span className="shrink-0 text-acuity-bad">↳</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {isComplete && entry.tasks.length > 0 && (
            <section>
              <SectionHeader label="Tasks" count={entry.tasks.length} />
              <div
                className="acuity-stagger mt-3 space-y-2"
                data-stagger-children
              >
                {entry.tasks.map((t) => {
                  const label = t.title ?? t.text ?? "Untitled task";
                  const statusLabel = t.status
                    .replace(/_/g, " ")
                    .toLowerCase();
                  return (
                    <div key={t.id} data-stagger>
                      <Card variant="tinted" radius="lg" padding={4}>
                        <p className="text-sm text-acuity-text">{label}</p>
                        {t.description && (
                          <p className="mt-1 text-xs leading-relaxed text-acuity-text-sec">
                            {t.description}
                          </p>
                        )}
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[1.4px] text-acuity-text-ter">
                          {PRIORITY_LABELS[t.priority] ?? t.priority} ·{" "}
                          {statusLabel}
                        </p>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Transcript stays ungated by status — for PARTIAL entries
              the user's own words are still saved and worth surfacing
              alongside the retry card. */}
          {entry.transcript && (
            <section>
              <SectionHeader label="Transcript" />
              <Card variant="tinted" radius="lg" padding={5} className="mt-3">
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-acuity-text-sec">
                  {entry.transcript}
                </p>
              </Card>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
