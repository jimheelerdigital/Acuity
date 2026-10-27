import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { Track } from "@/components/mythicals/track";
import { QUIZ_KINDS, QUIZZES, quizPath, resultImageUrl } from "@/lib/mythicals/quizzes";
import { basePathFor } from "@/lib/mythicals/site";

/**
 * Quiz picker (2026-10-27, per Keenan: "the landing page should let people
 * PICK their quiz"). /quiz is the bio link, so it leads with the three
 * quizzes; each card opens /quiz/<kind>.
 */
export const metadata: Metadata = {
  title: { absolute: "Pick Your Quiz: Beast, Armor or Weapon | Legendary Mythicals" },
  description: "Which legendary creature are you? Which armor set is yours? Which legendary weapon answers to you? Three free quizzes.",
  alternates: { canonical: "/quiz" },
};

export default function QuizPickerPage() {
  const base = basePathFor(headers().get("host"));
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
      <Track type="page_view" />
      <div className="text-center">
        <p className="lm-rise lm-eyebrow mb-4">Three quizzes. Your legend.</p>
        <h1 className="lm-rise font-lm-display text-[2.2rem] font-bold leading-[1.1] text-[var(--lm-bone)] sm:text-6xl">
          Pick Your Quiz
        </h1>
        <p className="lm-rise mx-auto mt-5 max-w-md text-base leading-relaxed text-[var(--lm-dim)] sm:text-lg" style={{ animationDelay: "80ms" }}>
          Find your beast, your armor or your weapon. Free, a couple of minutes each, with an HD wallpaper of your result.
        </p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-5">
        {QUIZ_KINDS.map((kind, n) => {
          const q = QUIZZES[kind];
          return (
            <Link
              key={kind}
              href={`${base}${quizPath(kind)}`}
              className="lm-rise group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 p-5 transition hover:border-[#d9a441]/70 sm:aspect-[3/5]"
              style={{ animationDelay: `${120 + n * 80}ms` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resultImageUrl(kind, q.coverSlug)}
                alt=""
                className="absolute inset-0 -z-10 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                fetchPriority={n === 0 ? "high" : undefined}
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0b0a09] via-[#0b0a09]/50 to-transparent" />
              <p className="lm-eyebrow">{q.label}</p>
              <h2 className="font-lm-display mt-2 text-2xl leading-tight text-[var(--lm-bone)]">{q.headline}</h2>
              <p className="mt-2 text-sm text-[var(--lm-dim)]">{q.eyebrow}</p>
              <span className="lm-btn-gold mt-4 w-full">Start</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
