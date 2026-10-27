import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Quiz } from "@/components/mythicals/quiz";
import { Track } from "@/components/mythicals/track";
import { isQuizKind, QUIZZES, quizPath, resultImageUrl } from "@/lib/mythicals/quizzes";
import { basePathFor } from "@/lib/mythicals/site";

/**
 * One quiz (2026-10-27): /quiz/beast, /quiz/armor, /quiz/weapon. A short
 * hero sells the result, and the first question sits right under it.
 */
type Props = { params: { kind: string } };

export function generateStaticParams() {
  return Object.keys(QUIZZES).map((kind) => ({ kind }));
}

export function generateMetadata({ params }: Props): Metadata {
  if (!isQuizKind(params.kind)) return {};
  const q = QUIZZES[params.kind];
  return {
    title: { absolute: `${q.headline} | Legendary Mythicals` },
    description: q.blurb,
    alternates: { canonical: quizPath(params.kind) },
  };
}

export default function QuizKindPage({ params }: Props) {
  if (!isQuizKind(params.kind)) notFound();
  const kind = params.kind;
  const q = QUIZZES[kind];
  const base = basePathFor(headers().get("host"));
  return (
    <>
      <Track type="page_view" data={{ quiz: kind }} />
      <section className="relative isolate overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resultImageUrl(kind, q.coverSlug)}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_30%] opacity-40"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0b0a09]/30 via-[#0b0a09]/60 to-[#0b0a09]" />
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-14 text-center sm:px-6 sm:pb-14 sm:pt-20">
          <p className="lm-rise lm-eyebrow mb-4">{q.eyebrow}</p>
          <h1 className="lm-rise font-lm-display text-[2.2rem] font-bold leading-[1.1] text-[var(--lm-bone)] sm:text-6xl">{q.headline}</h1>
          <p className="lm-rise mx-auto mt-5 max-w-md text-base leading-relaxed text-[var(--lm-dim)] sm:text-lg" style={{ animationDelay: "80ms" }}>
            {q.draw} questions. {q.blurb} Get its lore and a free HD wallpaper.
          </p>
          <a href="#quiz" className="lm-btn-gold lm-rise mt-7 px-8" style={{ animationDelay: "140ms" }}>
            Begin
          </a>
        </div>
      </section>
      <section id="quiz" className="scroll-mt-20 px-4 pt-2 sm:px-6">
        <Quiz base={base} kind={kind} />
      </section>
      <p className="mt-12 text-center text-sm text-[var(--lm-dim)]">
        <Link href={`${base}/quiz`} className="underline decoration-white/30 underline-offset-4 hover:text-[var(--lm-bone)]">
          Pick a different quiz
        </Link>
      </p>
    </>
  );
}
