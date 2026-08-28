"use client";

import { useCallback, useEffect, useState } from "react";

import { lifeAreaDisplayLabel } from "@acuity/shared";
import { Card } from "@/components/acuity";
import {
  MEMORY_AXES,
  axisMeta,
  daysSince,
  type MemoryAxis,
  type RecurringGoal,
  type RecurringPerson,
  type RecurringTheme,
} from "@/lib/lifemap-memory-payload";

/**
 * "What Ripple knows about you" — the memory file, read back.
 *
 * Read-only view over `UserMemory`, which the extraction pass already
 * writes. No new extraction, no writes, no schema. Everything here comes
 * from the one `/api/lifemap` GET the Life Matrix already calls.
 *
 * ── Framing ──────────────────────────────────────────────────────────
 * DESIGN_SYSTEM.md §7.6: "Memory is the product, not intelligence."
 * So this is a file that thickens, not a dashboard of insights — the copy
 * says "remembers" and "knows", never "insights" or "analysis". §7.1:
 * observational, not prescriptive. Nothing here tells the user what to do
 * about what it noticed.
 *
 * ── Gating ───────────────────────────────────────────────────────────
 * NONE here, deliberately. Exactly like `life-map.tsx`, the auth + PRO
 * gate is owned by the parent server page (`insights/knows/page.tsx`),
 * which mirrors `/life-matrix`: session → ProLockedCard → LockedFeatureCard.
 * A second in-component gate is what produced the false-locks called out
 * in life-map.tsx's comment, so this component renders once mounted.
 */

type MemoryResponse = {
  totalEntries: number;
  firstEntryDate: string | null;
  recurringThemes: RecurringTheme[];
  recurringPeople: RecurringPerson[];
  recurringGoals: RecurringGoal[];
} & Record<`${MemoryAxis}Summary`, string | null> &
  Record<`${MemoryAxis}Mentions`, number>;

/** Below this, the file is too thin to read back as a portrait. */
const LOW_DATA_ENTRIES = 3;

const SENTIMENT_STYLE: Record<string, { label: string; className: string }> = {
  positive: {
    label: "warm",
    className: "text-emerald-600 dark:text-emerald-400",
  },
  negative: {
    label: "strained",
    className: "text-rose-600 dark:text-rose-400",
  },
  neutral: { label: "steady", className: "text-acuity-text-ter" },
};

const GOAL_STATUS_STYLE: Record<string, string> = {
  active: "text-acuity-text-sec",
  complete: "text-emerald-600 dark:text-emerald-400",
  completed: "text-emerald-600 dark:text-emerald-400",
  dropped: "text-acuity-text-quiet line-through",
  stalled: "text-amber-600 dark:text-amber-400",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
      {children}
    </p>
  );
}

function Section({
  eyebrow,
  title,
  note,
  children,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8" data-stagger>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2 font-display text-xl font-semibold text-acuity-text">
        {title}
      </h2>
      {note && (
        <p className="mt-1 text-[13px] leading-relaxed text-acuity-text-ter">
          {note}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Small count chip — "×7". */
function MentionCount({ n }: { n: number }) {
  return (
    <span className="shrink-0 font-mono text-[11px] tabular-nums text-acuity-text-quiet">
      &times;{n}
    </span>
  );
}

export function WhatRippleKnows() {
  const [memory, setMemory] = useState<MemoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/lifemap");
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = await res.json();
      setMemory(data.memory ?? null);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-acuity-primary dark:border-white/10" />
      </div>
    );
  }

  if (failed || !memory) {
    return (
      <Card padding={6}>
        <p className="text-[15px] leading-relaxed text-acuity-text-sec">
          Couldn&rsquo;t load your file just now. Refresh the page and it
          should come back.
        </p>
      </Card>
    );
  }

  const days = daysSince(memory.firstEntryDate);
  const totalEntries = memory.totalEntries ?? 0;

  // Sort copies — never mutate the arrays held in state.
  const people = [...(memory.recurringPeople ?? [])].sort(
    (a, b) => b.mentionCount - a.mentionCount
  );
  const goals = [...(memory.recurringGoals ?? [])].sort(
    (a, b) => b.mentionCount - a.mentionCount
  );
  const themes = [...(memory.recurringThemes ?? [])].sort(
    (a, b) => b.count - a.count
  );

  const axesWithSummary = MEMORY_AXES.filter(
    (axis) => (memory[`${axis}Summary`] ?? "").trim().length > 0
  );

  // ── Still getting to know you ──────────────────────────────────────
  // Shown when the file is too thin to read back, rather than a page of
  // empty sections. Encouraging, and honest about what it doesn't have.
  if (totalEntries < LOW_DATA_ENTRIES) {
    const remaining = LOW_DATA_ENTRIES - totalEntries;
    return (
      <Card padding={6}>
        <Eyebrow>Still getting to know you</Eyebrow>
        <h2 className="mt-2 font-display text-xl font-semibold text-acuity-text">
          {totalEntries === 0
            ? "Nothing on file yet"
            : `${totalEntries} debrief${totalEntries === 1 ? "" : "s"} on file`}
        </h2>
        <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-acuity-text-sec">
          {totalEntries === 0
            ? "Record your first debrief and this page starts filling in — the people you mention, what keeps coming up, and where each part of your life sits."
            : `Ripple remembers everything you've said so far. Another ${remaining} debrief${remaining === 1 ? "" : "s"} and there's enough here to read back as a picture rather than a list.`}
        </p>
      </Card>
    );
  }

  return (
    <div className="acuity-stagger">
      {/* Header line — the file, and how long it has been open. */}
      <Card padding={6} className="mb-8">
        <Eyebrow>On file</Eyebrow>
        <p className="mt-2 max-w-prose font-display text-[22px] font-semibold leading-snug text-acuity-text">
          {days === null
            ? `Ripple remembers ${totalEntries} debrief${totalEntries === 1 ? "" : "s"}.`
            : `Ripple has been learning about you for ${days} day${days === 1 ? "" : "s"}, across ${totalEntries} debrief${totalEntries === 1 ? "" : "s"}.`}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-acuity-text-ter">
          Everything below came from what you said out loud. It gets thicker
          every time you record.
        </p>
      </Card>

      {people.length > 0 && (
        <Section
          eyebrow="People"
          title="Who keeps coming up"
          note="Named in your debriefs, most-mentioned first."
        >
          <Card variant="tinted" radius="lg" padding={null}>
            <ul className="divide-y divide-acuity-line">
              {people.map((p) => {
                const tone =
                  SENTIMENT_STYLE[p.sentiment?.toLowerCase()] ??
                  SENTIMENT_STYLE.neutral;
                return (
                  <li
                    key={`${p.name}-${p.area}`}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-[15px] text-acuity-text">
                      {p.name}
                    </span>
                    <span className="shrink-0 text-[12px] text-acuity-text-quiet">
                      {lifeAreaDisplayLabel(p.area?.toUpperCase())}
                    </span>
                    <span className={`shrink-0 text-[12px] ${tone.className}`}>
                      {tone.label}
                    </span>
                    <MentionCount n={p.mentionCount} />
                  </li>
                );
              })}
            </ul>
          </Card>
        </Section>
      )}

      {goals.length > 0 && (
        <Section
          eyebrow="Goals"
          title="What it’s tracking"
          note="Things you said you wanted to do."
        >
          <Card variant="tinted" radius="lg" padding={null}>
            <ul className="divide-y divide-acuity-line">
              {goals.map((g) => (
                <li
                  key={g.goal}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span
                    className={`min-w-0 flex-1 text-[15px] ${
                      GOAL_STATUS_STYLE[g.status?.toLowerCase()] ??
                      "text-acuity-text"
                    }`}
                  >
                    {g.goal}
                  </span>
                  <span className="shrink-0 text-[12px] capitalize text-acuity-text-quiet">
                    {g.status ?? "active"}
                  </span>
                  <MentionCount n={g.mentionCount} />
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      {themes.length > 0 && (
        <Section
          eyebrow="Themes"
          title="What comes back around"
          note="Subjects that surfaced more than once."
        >
          <div className="flex flex-wrap gap-2">
            {themes.map((t) => (
              <span
                key={`${t.area}-${t.theme}`}
                className="inline-flex items-center gap-2 rounded-acuity-pill border border-acuity-card-border bg-acuity-card-bg-tint px-3 py-1.5 text-[13px] text-acuity-text-sec"
              >
                {t.theme}
                <span className="font-mono text-[11px] tabular-nums text-acuity-text-quiet">
                  &times;{t.count}
                </span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {axesWithSummary.length > 0 && (
        <Section
          eyebrow="Your life, axis by axis"
          title="What it has pieced together"
          note="Only the parts you've talked about appear here."
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {axesWithSummary.map((axis) => {
              const meta = axisMeta(axis);
              const mentions = memory[`${axis}Mentions`] ?? 0;
              return (
                <Card key={axis} radius="lg" padding={5}>
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-acuity-pill"
                      style={{ backgroundColor: meta.color }}
                    />
                    <h3 className="flex-1 font-display text-[15px] font-semibold text-acuity-text">
                      {meta.label}
                    </h3>
                    {mentions > 0 && (
                      <span className="font-mono text-[11px] tabular-nums text-acuity-text-quiet">
                        {mentions} mention{mentions === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-[14px] leading-relaxed text-acuity-text-sec">
                    {memory[`${axis}Summary`]}
                  </p>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      {/* Enough entries to be here, but the extraction pass hasn't
          written anything back yet. Distinct from the <3-entry state:
          the user has done their part and is waiting on processing. */}
      {people.length === 0 &&
        goals.length === 0 &&
        themes.length === 0 &&
        axesWithSummary.length === 0 && (
          <Card padding={6}>
            <p className="max-w-prose text-[15px] leading-relaxed text-acuity-text-sec">
              Your debriefs are recorded, but Ripple hasn&rsquo;t finished
              reading them back yet. Check again after your next one.
            </p>
          </Card>
        )}
    </div>
  );
}
