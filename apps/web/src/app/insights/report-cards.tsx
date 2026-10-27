import Link from "next/link";
import type { ReactNode } from "react";

import type { WrappedSummary } from "@acuity/shared";

import { Card } from "@/components/acuity";
import type { FirstRead } from "@/lib/first-read";
import type { FollowThroughReport } from "@/lib/follow-through";
import type { HowYouTalk } from "@/lib/how-you-talk";
import {
  finishTimeLabel,
  formatAverage,
  wrappedCardCopy,
} from "@/lib/insights-reports-plan";
import type { LiftDrain, LiftsDrainsResult } from "@/lib/lifts-drains";
import type { OpenLoop } from "@/lib/open-loops";

/**
 * Web versions of the Insights v2 report cards (2026-10-27). Pure
 * presentation: the /insights page loads the data server-side (shared
 * loaders in lib/insights-reports-data) and decides visibility with the
 * same rules as the iPhone cards (lib/insights-reports-plan). Each card
 * expects data that already passed its "show" check.
 */

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
      {children}
    </p>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-2 font-display text-xl font-semibold text-acuity-text">{children}</h2>
  );
}

function Divider() {
  return <div className="my-4 h-px bg-acuity-card-border" />;
}

// ── Follow-through ────────────────────────────────────────────────────

export function FollowThroughCard({ report }: { report: FollowThroughReport }) {
  const { thisWeek, lastWeek, groupSpeed, stillOpen } = report;
  const delta = thisWeek.completed - lastWeek.completed;
  return (
    <Card radius="lg" padding={6} data-testid="report-follow-through">
      <Eyebrow>Last 7 days vs the 7 before</Eyebrow>
      <Title>Follow-through</Title>

      <dl className="mt-4 space-y-2 text-[15px]">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-acuity-text-sec">
            Tasks captured
            {thisWeek.fromRecordings > 0 ? (
              <span className="block text-xs text-acuity-text-ter">
                {thisWeek.fromRecordings} from your debriefs
              </span>
            ) : null}
          </dt>
          <dd className="font-medium text-acuity-text">{thisWeek.captured}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-acuity-text-sec">Tasks done</dt>
          <dd className="font-medium text-acuity-text">
            {thisWeek.completed}
            {delta !== 0 ? (
              <span
                className={`ml-2 text-xs ${delta > 0 ? "text-acuity-good" : "text-acuity-text-ter"}`}
              >
                {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      {groupSpeed.length > 0 ? (
        <>
          <Divider />
          <p className="text-sm font-semibold text-acuity-text">Typical time to finish</p>
          <dl className="mt-2 space-y-1 text-[15px]">
            {groupSpeed.map((g) => (
              <div key={g.group} className="flex items-baseline justify-between gap-4">
                <dt className="text-acuity-text-sec">{g.group}</dt>
                <dd className="text-acuity-text">{finishTimeLabel(g.medianDays)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}

      {stillOpen.kind !== "none" && stillOpen.items.length > 0 ? (
        <>
          <Divider />
          <p className="text-sm font-semibold text-acuity-text">
            {stillOpen.kind === "repeated" ? "Keeps coming up" : "Waiting the longest"}
          </p>
          <p className="text-xs text-acuity-text-ter">
            {stillOpen.kind === "repeated"
              ? "Still open, and mentioned in more than one debrief"
              : "Open tasks from your debriefs"}
          </p>
          <ul className="mt-2 space-y-1">
            {stillOpen.items.map((t) => (
              <li key={t.id}>
                <Link
                  href="/tasks"
                  className="flex items-baseline justify-between gap-4 text-[15px] text-acuity-text-sec hover:text-acuity-text"
                >
                  <span className="truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-acuity-text-ter">
                    {stillOpen.kind === "repeated" ? `${t.mentions} debriefs` : `${t.ageDays}d`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

// ── Open loops ────────────────────────────────────────────────────────

export function OpenLoopsCard({ loops }: { loops: OpenLoop[] }) {
  return (
    <Card radius="lg" padding={6} data-testid="report-open-loops">
      <Eyebrow>Open loops</Eyebrow>
      <Title>Still on your mind</Title>
      <p className="mt-1 text-sm text-acuity-text-sec">
        Things that keep coming up, and goals that have gone quiet.
      </p>
      <ul className="mt-4 divide-y divide-acuity-card-border">
        {loops.map((loop) => {
          const href =
            loop.kind === "worry"
              ? `/insights/theme/${encodeURIComponent(loop.themeId)}`
              : `/goals/${loop.goalId}`;
          const key = loop.kind === "worry" ? `w-${loop.themeId}` : `g-${loop.goalId}`;
          return (
            <li key={key}>
              <Link
                href={href}
                className="group flex items-center gap-3 py-3 text-[15px] text-acuity-text"
              >
                <span aria-hidden className="text-acuity-primary">
                  {loop.kind === "worry" ? "↻" : "⚑"}
                </span>
                <span className="flex-1">{loop.text}</span>
                <span className="text-acuity-text-ter transition group-hover:text-acuity-primary">
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ── What lifts you, what drains you ───────────────────────────────────

const KIND_GLYPH: Record<LiftDrain["kind"], string> = {
  theme: "💬",
  person: "👤",
  habit: "✓",
  calendar: "📅",
};

function FactorList({ title, items, tone }: { title: string; items: LiftDrain[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <p className={`text-xs font-semibold ${tone}`}>{title}</p>
      <ul className="mt-2 space-y-3">
        {items.map((f) => (
          <li key={`${f.kind}-${f.label}`} className="flex gap-3">
            <span aria-hidden className="mt-0.5 w-5 shrink-0 text-center text-sm">
              {KIND_GLYPH[f.kind]}
            </span>
            <div>
              <p className="text-[15px] leading-relaxed text-acuity-text">{f.observation}</p>
              <p className="text-xs text-acuity-text-ter">
                {f.withDays} days vs {f.withoutDays} days
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LiftsDrainsCard({ data }: { data: LiftsDrainsResult }) {
  return (
    <Card radius="lg" padding={6} data-testid="report-lifts-drains">
      <Eyebrow>Mood patterns</Eyebrow>
      <Title>What lifts you, what drains you</Title>
      <FactorList title="Lifts" items={data.lifts} tone="text-acuity-primary" />
      <FactorList title="Drains" items={data.drains} tone="text-acuity-text-sec" />
      <p className="mt-4 text-xs text-acuity-text-ter">
        Mood out of 10, from your last 60 days of entries. Patterns, not proof.
      </p>
    </Card>
  );
}

// ── How you talk ──────────────────────────────────────────────────────

const SHIFT_GLYPH: Record<HowYouTalk["shifts"][number]["direction"], string> = {
  up: "↗",
  down: "↘",
  new: "✦",
  gone: "–",
};

export function HowYouTalkCard({ data }: { data: HowYouTalk }) {
  return (
    <Card radius="lg" padding={6} data-testid="report-how-you-talk">
      <Eyebrow>Your own words, last 30 days vs the 30 before</Eyebrow>
      <Title>How you talk</Title>
      <ul className="mt-4 space-y-2">
        {data.shifts.map((s) => (
          <li key={s.group} className="flex gap-3 text-[15px] text-acuity-text">
            <span aria-hidden className="w-4 shrink-0 text-acuity-primary">
              {SHIFT_GLYPH[s.direction]}
            </span>
            <span>{s.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Your first read ───────────────────────────────────────────────────

function FirstReadSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1 text-xs font-semibold text-acuity-text-ter">{label}</p>
      {children}
    </div>
  );
}

export function FirstReadCard({ data }: { data: FirstRead }) {
  return (
    <section className="mb-10" data-testid="report-first-read">
      <Card variant="tinted" radius="lg" padding={6}>
        <Eyebrow>After {data.entriesCount} debriefs</Eyebrow>
        <Title>Your first read</Title>

        {data.mood ? (
          <FirstReadSection label="Mood so far">
            <p className="text-[15px] text-acuity-text">
              {data.mood.label}, averaging {formatAverage(data.mood.average)} out of 10
              {data.energy ? `, with energy around ${formatAverage(data.energy.average)}` : ""}.
            </p>
          </FirstReadSection>
        ) : data.energy ? (
          <FirstReadSection label="Energy so far">
            <p className="text-[15px] text-acuity-text">
              Around {formatAverage(data.energy.average)} out of 10.
            </p>
          </FirstReadSection>
        ) : null}

        {data.themes.length > 0 ? (
          <FirstReadSection label="Coming up more than once">
            <p className="text-[15px] text-acuity-text">
              {data.themes.join(" and ")}. It&rsquo;s early, so these might be nothing yet.
            </p>
          </FirstReadSection>
        ) : null}

        {data.tasks ? (
          <FirstReadSection label="Captured for you">
            <p className="text-[15px] text-acuity-text">
              Ripple pulled {data.tasks.count} task{data.tasks.count === 1 ? "" : "s"} out of what
              you said.
            </p>
            <ul className="mt-1 space-y-0.5">
              {data.tasks.titles.map((t) => (
                <li key={t} className="truncate text-[14px] text-acuity-text-sec">
                  • {t}
                </li>
              ))}
            </ul>
          </FirstReadSection>
        ) : null}
      </Card>
    </section>
  );
}

// ── Ripple Wrapped entry ──────────────────────────────────────────────

export function WrappedEntryCard({ wrapped }: { wrapped: WrappedSummary }) {
  const { title, sub } = wrappedCardCopy(wrapped);
  return (
    <section className="mb-10" data-testid="report-wrapped-entry">
      <Link
        href={`/insights/wrapped?period=${wrapped.period.key}`}
        className="group block overflow-hidden rounded-acuity-lg bg-acuity-grad-mix p-6 text-white"
      >
        <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-white/85">
          Ripple Wrapped
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-1 text-[15px] text-white/90">{sub}</p>
        <p className="mt-4 text-sm font-semibold text-white transition group-hover:translate-x-0.5">
          See your recap →
        </p>
      </Link>
    </section>
  );
}
