import type { Metadata } from "next";
import Link from "next/link";

import { EmailCapture, PortraitOrder, ProductInterest, ShareButtons } from "@/components/mythicals/result-actions";
import { Track } from "@/components/mythicals/track";
import {
  decodePicks,
  QUIZ_KINDS,
  QUIZZES,
  quizPath,
  quizResult,
  resultImageUrl,
  resultOgUrl,
  resultPath,
  type QuizKind,
} from "@/lib/mythicals/quizzes";
import { shopLive } from "@/lib/mythicals/site";

/**
 * Result page for any quiz (2026-10-27, generalized from the beast-only
 * page). Order, per Keenan: the result first, then "which of these would you
 * actually want?", then the email ask for when it drops.
 */

function shareText(kind: QuizKind, name: string): string {
  if (kind === "armor") return `My armor is the ${name}. Which armor set is yours?`;
  if (kind === "weapon") return `My legendary weapon is ${name}. Which one is yours?`;
  return `I'm the ${name}. Which legendary creature are you?`;
}

export function resultMetadata(kind: QuizKind, slug: string): Metadata {
  const r = quizResult(kind, slug);
  if (!r) return {};
  const title = shareText(kind, r.name);
  const path = resultPath(kind, slug);
  return {
    title: { absolute: `${r.name}: ${r.title} | Legendary Mythicals` },
    description: r.essence,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "Legendary Mythicals",
      url: path,
      title,
      description: r.essence,
      images: [{ url: resultOgUrl(kind, slug), width: 1200, height: 630, alt: r.name }],
    },
    twitter: { card: "summary_large_image", title, description: r.essence, images: [resultOgUrl(kind, slug)] },
  };
}

export function ResultView({ kind, slug, base, rawAnswers }: { kind: QuizKind; slug: string; base: string; rawAnswers?: string }) {
  const r = quizResult(kind, slug)!;
  const def = QUIZZES[kind];
  // ?a= = this visitor's own picks (fresh from the quiz). Shared links
  // arrive without it and get a "take the quiz" nudge first.
  const own = decodePicks(kind, rawAnswers) !== null;
  const live = kind === "beast" && shopLive();
  const others = QUIZ_KINDS.filter((k) => k !== kind);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <Track type="result_view" data={{ quiz: kind, slug, own }} />
      {!own && (
        <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center">
          <p className="text-sm text-[var(--lm-dim)]">Someone shared their result with you. {def.headline}</p>
          <Link href={`${base}${quizPath(kind)}`} className="lm-btn-gold py-2.5 text-sm">Take the quiz</Link>
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-12">
        <div className="relative mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_80px_-20px_rgba(196,80,42,0.45)] md:max-w-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultImageUrl(kind, slug)} alt={r.name} className="h-full w-full object-cover" fetchPriority="high" />
        </div>

        <div className="md:pt-4">
          <p className="lm-rise text-xs uppercase tracking-[0.35em] text-[var(--lm-gold)]">{own ? def.resultLead : "The"}</p>
          <h1 className="lm-rise font-lm-display mt-2 text-4xl font-bold leading-tight text-[var(--lm-bone)] sm:text-5xl">{r.name}</h1>
          <p className="lm-rise font-lm-display mt-2 text-lg text-[var(--lm-gold)]">{r.title}</p>
          <p className="mt-6 text-lg leading-relaxed text-[var(--lm-bone)]">{r.essence}</p>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--lm-dim)]">Strengths</h2>
              <ul className="mt-3 grid gap-2">
                {r.strengths.map((s) => (
                  <li key={s} className="flex gap-3 text-[var(--lm-bone)]">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-[var(--lm-gold)]" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--lm-dim)]">Weakness</h2>
              <p className="mt-3 text-[var(--lm-bone)]">{r.weakness}</p>
            </div>
          </div>

          <blockquote className="mt-8 border-l-2 border-[var(--lm-ember)] pl-4 font-lm-display text-base leading-relaxed text-[var(--lm-dim)]">
            {r.lore}
          </blockquote>

          <div className="mt-8">
            <ShareButtons
              slug={slug}
              name={r.name}
              path={`${base}${resultPath(kind, slug)}`}
              imageUrl={resultImageUrl(kind, slug)}
              shareText={shareText(kind, r.name)}
              label={`Share my ${def.noun}`}
            />
          </div>

          <div id="gear" className="mt-10 scroll-mt-6 rounded-xl border border-[#d9a441]/30 bg-gradient-to-b from-[#d9a441]/[0.08] to-transparent p-5">
            {own ? (
              <ProductInterest quiz={kind} slug={slug} name={r.name} />
            ) : (
              <>
                <h2 className="font-lm-display text-lg text-[var(--lm-bone)]">Get the {r.name} profile + HD wallpaper</h2>
                <p className="mb-4 mt-1 text-sm text-[var(--lm-dim)]">Sent to your inbox. Unsubscribe any time.</p>
                <EmailCapture slug={slug} quiz={kind} />
              </>
            )}
          </div>

          {live && (
            <div id="portrait" className="mt-6 scroll-mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-[var(--lm-gold)]">Your Legendary Creature Portrait</p>
              <h2 className="font-lm-display mt-2 text-xl text-[var(--lm-bone)]">A {r.name} that is yours alone</h2>
              <p className="mb-5 mt-2 text-sm leading-relaxed text-[var(--lm-dim)]">
                A one-of-a-kind portrait named for you, plus a lore card with its powers and legend. Delivered by email in minutes. $12.
              </p>
              <PortraitOrder slug={slug} answers={[]} />
            </div>
          )}

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {others.map((k) => (
              <Link key={k} href={`${base}${quizPath(k)}`} className="lm-btn-ghost text-sm">
                {QUIZZES[k].headline}
              </Link>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-[var(--lm-dim)] md:text-left">
            <Link href={`${base}${quizPath(kind)}`} className="underline decoration-white/30 underline-offset-4 hover:text-[var(--lm-bone)]">
              Take this quiz again
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
