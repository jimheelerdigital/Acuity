import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Your Day 14 Life Audit — Acuity",
  description: "The pattern that showed up across your first fourteen days.",
  robots: { index: false, follow: false },
};

type ThemesArc = {
  starting?: string[];
  emerging?: string[];
  fading?: string[];
};

export default async function LifeAuditPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/insights/life-audit/${params.id}`);
  }

  const { prisma } = await import("@/lib/prisma");
  const audit = await prisma.lifeAudit.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      userId: true,
      kind: true,
      periodStart: true,
      periodEnd: true,
      entryCount: true,
      narrative: true,
      closingLetter: true,
      themesArc: true,
      moodArc: true,
      status: true,
    },
  });

  // 404 (not 403) on missing OR wrong owner — don't disclose
  // existence of someone else's audit.
  if (!audit || audit.userId !== session.user.id) {
    notFound();
  }

  if (audit.status !== "COMPLETE") {
    return <PendingAuditView status={audit.status} />;
  }

  // Fire analytics event on view (IMPLEMENTATION_PLAN_PAYWALL §8.3).
  // Server-side fire for MVP — future refinement: send a
  // time-on-page heartbeat from a client component once we want
  // the `timeOnPageSeconds` property back.
  try {
    const { track } = await import("@/lib/posthog");
    await track(session.user.id, "life_audit_viewed", {
      lifeAuditId: audit.id,
    });
  } catch {
    // Never block a page render on an analytics call.
  }

  const themesArc: ThemesArc = (audit.themesArc as ThemesArc) ?? {};
  const starting = themesArc.starting ?? [];
  const emerging = themesArc.emerging ?? [];
  const fading = themesArc.fading ?? [];

  // The narrative already ends with the closing. We strip the
  // closing from the rendered narrative and render it separately so
  // its "Continue it →" line can be soft-linked. If the closing
  // isn't found as a suffix (shouldn't happen; defensive), fall
  // back to rendering everything as one block.
  const closing = audit.closingLetter ?? "";
  const narrativeWithoutClosing =
    closing && audit.narrative.endsWith(closing)
      ? audit.narrative.slice(0, -closing.length).trimEnd()
      : audit.narrative;

  const periodLabel = `${audit.periodStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} — ${audit.periodEnd.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;

  return (
    <article className="min-h-screen bg-[#FAFAF7] px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-400 transition hover:text-zinc-900"
        >
          &larr; Back to dashboard
        </Link>

        <header className="mt-8 mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">
            Day 14 Life Audit
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Your first fourteen days
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {periodLabel} &middot; {audit.entryCount} entries
          </p>
          {audit.moodArc && (
            <p className="mt-4 text-base italic text-zinc-600">
              {audit.moodArc}
            </p>
          )}
        </header>

        {/* Narrative body — rendered as long-form prose with the
            closing stripped so we can soft-link it below. */}
        <div className="prose prose-zinc max-w-none text-[17px] leading-[1.8] text-zinc-700">
          {narrativeWithoutClosing.split(/\n\n+/).map((para, i) => (
            <p key={i} className="mb-5 whitespace-pre-line">
              {para}
            </p>
          ))}
        </div>

        {/* Themes arc — render as three horizontal groups. Data, not
            prose, so bullets are fine here. */}
        {(starting.length > 0 || emerging.length > 0 || fading.length > 0) && (
          <section className="mt-12 rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">
              Themes across the fourteen days
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <ThemeGroup label="Starting" themes={starting} />
              <ThemeGroup label="Emerging" themes={emerging} />
              <ThemeGroup label="Fading" themes={fading} />
            </dl>
          </section>
        )}

        {/* Closing letter + "Continue it →" soft-link. Rendered as
            body copy, NOT a button, per §4.1. */}
        {closing && (
          <section className="mt-12 border-t border-zinc-200 pt-12 text-[17px] leading-[1.8] text-zinc-700">
            <ClosingLetter text={closing} />
          </section>
        )}
      </div>
    </article>
  );
}

function ThemeGroup({ label, themes }: { label: string; themes: string[] }) {
  if (themes.length === 0) {
    return (
      <div>
        <dt className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          {label}
        </dt>
        <dd className="mt-2 text-sm text-zinc-300">—</dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
        {label}
      </dt>
      <dd className="mt-2 flex flex-wrap gap-1.5">
        {themes.map((t) => (
          <span
            key={t}
            className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600"
          >
            {t}
          </span>
        ))}
      </dd>
    </div>
  );
}

/**
 * Render the closing letter. Detects "Continue it →" and wraps it in
 * a soft link to /upgrade?src=life_audit_body_link (per §4.1 + §8).
 * Preserves the rest of the copy as-is, including the "**What comes
 * next**" header which we strip of Markdown markers and render as an
 * h2.
 */
function ClosingLetter({ text }: { text: string }) {
  // Split header from body. The prompt contract is that the closing
  // starts with "**What comes next**" on its own line.
  const lines = text.split("\n");
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("**What comes next")) {
      headerIndex = i;
      break;
    }
  }

  const header =
    headerIndex >= 0
      ? lines[headerIndex].replace(/\*\*/g, "").trim()
      : "What comes next";
  const bodyText =
    (headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines)
      .join("\n")
      .trim();

  // Replace the literal "Continue it →" with a soft-link. The prompt
  // ensures that token is on its own line; we match permissively.
  const CONTINUE_TOKEN = /Continue it →/;
  const hasContinue = CONTINUE_TOKEN.test(bodyText);
  const [beforeContinue, afterContinue] = hasContinue
    ? bodyText.split(CONTINUE_TOKEN)
    : [bodyText, ""];

  return (
    <>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-violet-500 mb-4">
        {header}
      </h2>
      <div className="space-y-5">
        {beforeContinue
          .split(/\n\n+/)
          .filter((p) => p.trim().length > 0)
          .map((para, i) => (
            <p key={i} className="whitespace-pre-line">
              {para}
            </p>
          ))}
        {hasContinue && (
          <p>
            <Link
              href="/upgrade?src=life_audit_body_link"
              className="text-violet-600 underline decoration-violet-200 underline-offset-4 transition hover:text-violet-900 hover:decoration-violet-600"
            >
              Continue it &rarr;
            </Link>
            {afterContinue}
          </p>
        )}
      </div>
    </>
  );
}

function PendingAuditView({ status }: { status: string }) {
  const isFailed = status === "FAILED";
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAF7] px-6">
      <div className="mx-auto max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">
          Day 14 Life Audit
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900">
          {isFailed
            ? "We hit a snag writing your audit."
            : "Your audit is almost ready."}
        </h1>
        <p className="mt-3 text-sm text-zinc-500">
          {isFailed
            ? "Support has been notified. Try refreshing this page in a few minutes — we retry automatically."
            : "Generation takes a few minutes. This page will update as soon as it's ready."}
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-block text-sm text-violet-600 underline underline-offset-4 transition hover:text-violet-900"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
