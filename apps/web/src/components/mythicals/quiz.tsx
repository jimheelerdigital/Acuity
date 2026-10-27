"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { drawQuestions, encodePicks, QUIZZES, resultPath, scorePicks, type Pick, type QuizKind } from "@/lib/mythicals/quizzes";

import { beacon } from "./track";

/**
 * One quiz run (2026-10-27: beast, armor or weapon). The questions are drawn
 * at random from the quiz's pool on mount, client-side only so the server
 * render and the browser never disagree about which questions show.
 */
export function Quiz({ base, kind }: { base: string; kind: QuizKind }) {
  const router = useRouter();
  const def = QUIZZES[kind];
  const [order, setOrder] = useState<number[] | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => setOrder(drawQuestions(kind)), [kind]);

  if (!order) return <div className="min-h-[60vh]" aria-busy="true" />;

  const total = order.length;
  const i = picks.length;
  const qi = order[Math.min(i, total - 1)];
  const q = def.pool[qi];

  const pick = (a: number) => {
    if (revealing) return;
    const next = [...picks, { q: qi, a }];
    if (next.length === 1) beacon("quiz_start", { quiz: kind });
    setPicks(next);
    if (next.length < total) return;
    setRevealing(true);
    const slug = scorePicks(kind, next);
    const code = encodePicks(next);
    beacon("quiz_complete", { quiz: kind, slug, answers: code });
    const href = `${base}${resultPath(kind, slug)}`;
    router.prefetch(href);
    setTimeout(() => router.push(`${href}?a=${code}`), 1400);
  };

  if (revealing) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
        <div className="lm-ember mb-8 h-16 w-16 rounded-full" />
        <p className="font-lm-display text-2xl tracking-wide text-[var(--lm-gold)]">Reading the signs</p>
        <p className="mt-3 text-sm text-[var(--lm-dim)]">Your {def.noun} is answering the call.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.25em] text-[var(--lm-dim)]">
        <button
          type="button"
          onClick={() => setPicks(picks.slice(0, -1))}
          className={`py-2 pr-4 transition hover:text-[var(--lm-bone)] ${i === 0 ? "invisible" : ""}`}
        >
          Back
        </button>
        <span>
          {i + 1} / {total}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={i} aria-valuemin={0} aria-valuemax={total}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--lm-ember)] to-[var(--lm-gold)] transition-all duration-500"
          style={{ width: `${(i / total) * 100}%` }}
        />
      </div>

      <h2 key={`q${qi}`} className="lm-rise font-lm-display mt-10 text-[1.7rem] leading-tight text-[var(--lm-bone)] sm:text-4xl">
        {q.q}
      </h2>
      <div key={`a${qi}`} className="mt-8 grid gap-3">
        {q.answers.map((a, ai) => (
          <button
            key={a.text}
            type="button"
            onClick={() => pick(ai)}
            className="lm-rise group rounded-lg border border-white/10 bg-white/[0.03] px-5 py-4 text-left text-base text-[var(--lm-bone)] transition hover:border-[#d9a441]/70 hover:bg-white/[0.06] active:scale-[0.99]"
            style={{ animationDelay: `${80 + ai * 60}ms` }}
          >
            <span className="mr-3 font-lm-display text-sm text-[var(--lm-gold)]">{String.fromCharCode(65 + ai)}</span>
            {a.text}
          </button>
        ))}
      </div>
    </div>
  );
}
