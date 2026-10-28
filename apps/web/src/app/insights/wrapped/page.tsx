import type { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { parseWrappedPeriod } from "@acuity/shared";

import { Card } from "@/components/acuity";
import { BackButton } from "@/components/back-button";
import { PageContainer } from "@/components/page-container";
import { getAuthOptions } from "@/lib/auth";
import { loadUserLocalDate, loadWrapped } from "@/lib/insights-reports-data";
import { defaultWrappedPeriod } from "@/lib/insights-reports-plan";

import { WrappedShareBlock } from "./share-block";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ripple Wrapped — Ripple",
  robots: { index: false, follow: false },
};

/**
 * /insights/wrapped?period=YYYY-MM | YYYY — the web Ripple Wrapped
 * (2026-10-27). Same recap as the app's screen: loaded server-side with
 * the shared loader (lib/insights-reports-data → lib/wrapped.ts), every
 * section hidden below its own threshold, and a copy-to-clipboard share
 * of the privacy-safe text (wrappedShareText).
 */
export default async function WrappedPage({
  searchParams,
}: {
  searchParams?: { period?: string | string[] };
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/insights/wrapped");
  }
  const userId = session.user.id;
  const { prisma } = await import("@/lib/prisma");

  const raw = Array.isArray(searchParams?.period)
    ? searchParams?.period[0]
    : searchParams?.period;
  let period = parseWrappedPeriod(raw ?? null);
  if (!period) {
    const { localDate } = await loadUserLocalDate(prisma, userId);
    period = defaultWrappedPeriod(localDate(new Date()));
  }

  const result = await loadWrapped(prisma, userId, period);

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <PageContainer mobileWidth="3xl">
        <BackButton className="mb-4" ariaLabel="Back to Insights" />

        {!result.ok ? (
          <Message
            title="Not yet"
            body="That period hasn't started yet. Come back once it's underway."
          />
        ) : !result.wrapped.eligible ? (
          <Message
            title={result.wrapped.period.label}
            body={`Wrapped needs ${result.wrapped.minEntries} debriefs in ${result.wrapped.period.label.replace(/^Your /, "")}. You have ${result.wrapped.entries}.`}
          />
        ) : (
          <WrappedBody wrapped={result.wrapped} />
        )}

      </PageContainer>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Card radius="lg" padding={6}>
      <h1 className="font-display text-2xl font-semibold text-acuity-text">{title}</h1>
      <p className="mt-2 text-[15px] text-acuity-text-sec">{body}</p>
    </Card>
  );
}

function Section({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <Card radius="lg" padding={6}>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
        {eyebrow}
      </p>
      <div className="mt-2">{children}</div>
    </Card>
  );
}

function Big({ children }: { children: ReactNode }) {
  return <p className="font-display text-4xl font-semibold text-acuity-text">{children}</p>;
}

function Sub({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[15px] text-acuity-text-sec">{children}</p>;
}

function WrappedBody({
  wrapped: w,
}: {
  wrapped: Extract<Awaited<ReturnType<typeof loadWrapped>>, { ok: true }>["wrapped"];
}) {
  const maxMood = 10;
  return (
    <div className="space-y-4">
      <section className="rounded-acuity-xl bg-acuity-grad-mix p-8 text-white">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-white/85">
          Ripple Wrapped
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold">{w.period.label}</h1>
        <p className="mt-6 font-display text-6xl font-semibold leading-none">{w.entries}</p>
        <p className="mt-2 text-base text-white/90">
          debriefs over {w.daysJournaled} {w.daysJournaled === 1 ? "day" : "days"}
          {w.minutesTalked ? ` · ${w.minutesTalked} min of talking` : ""}
        </p>
      </section>

      {w.topThemes.length > 0 ? (
        <Section eyebrow="On your mind">
          <ol className="space-y-2">
            {w.topThemes.map((t, i) => (
              <li key={t.theme} className="flex items-baseline gap-3">
                <span className="w-6 font-display text-2xl text-acuity-primary">{i + 1}</span>
                <span className="flex-1 font-display text-2xl text-acuity-text">{t.theme}</span>
                <span className="text-sm text-acuity-text-ter">in {t.entries} debriefs</span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {w.habitStreak ? (
        <Section eyebrow="Longest streak">
          <Big>{w.habitStreak.days} days</Big>
          <Sub>of {w.habitStreak.habit}, in a row</Sub>
        </Section>
      ) : null}

      {w.tasks ? (
        <Section eyebrow="Just by talking">
          <Big>{w.tasks.captured} to-dos</Big>
          <Sub>captured from your debriefs · {w.tasks.completed} done</Sub>
        </Section>
      ) : null}

      {w.biggestWin ? (
        <Section eyebrow="A win worth remembering">
          <p className="font-display text-xl leading-relaxed text-acuity-text">
            &ldquo;{w.biggestWin}&rdquo;
          </p>
        </Section>
      ) : null}

      {w.person ? (
        <Section eyebrow="Came up most">
          <Big>{w.person.firstName}</Big>
          <Sub>mentioned {w.person.mentions} times</Sub>
        </Section>
      ) : null}

      {w.moodArc ? (
        <Section eyebrow="Your mood">
          <div
            className="flex items-end gap-2"
            role="img"
            aria-label={`Average mood: ${w.moodArc.map((b) => `${b.label} ${b.avg} out of 10`).join(", ")}`}
          >
            {w.moodArc.map((b) => (
              <div key={b.label} className="flex flex-1 flex-col items-center">
                <span className="mb-1 text-xs text-acuity-text-ter">{b.avg}</span>
                <div
                  className="w-full rounded-t-md bg-acuity-grad-primary"
                  style={{ height: `${Math.max(8, (b.avg / maxMood) * 120)}px` }}
                />
                <span className="mt-2 text-xs text-acuity-text-sec">{b.label}</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section eyebrow="Share it">
        <WrappedShareBlock wrapped={w} />
      </Section>
    </div>
  );
}
