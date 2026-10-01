"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { QUIZ, scoreQuiz } from "@/lib/mythicals/archetypes";

import { beacon } from "./track";

export function Quiz({ base }: { base: string }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<number[]>([]);
  const [revealing, setRevealing] = useState(false);
  const i = answers.length;
  const q = QUIZ[Math.min(i, QUIZ.length - 1)];

  const pick = (a: number) => {
    if (revealing) return;
    const next = [...answers, a];
    if (next.length === 1) beacon("quiz_start");
    if (next.length < QUIZ.length) {
      setAnswers(next);
      return;
    }
    setAnswers(next);
    setRevealing(true);
    const slug = scoreQuiz(next);
    beacon("quiz_complete", { slug, answers: next });
    router.prefetch(`${base}/result/${slug}`);
    setTimeout(() => router.push(`${base}/result/${slug}?a=${next.join("")}`), 1400);
  };

  if (revealing) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
        <div className="lm-ember mb-8 h-16 w-16 rounded-full" />
        <p className="font-lm-display text-2xl tracking-wide text-[var(--lm-gold)]">Reading the signs</p>
        <p className="mt-3 text-sm text-[var(--lm-dim)]">Your creature is answering the call.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.25em] text-[var(--lm-dim)]">
        <button
          type="button"
          onClick={() => setAnswers(answers.slice(0, -1))}
          className={`py-2 pr-4 transition hover:text-[var(--lm-bone)] ${i === 0 ? "invisible" : ""}`}
        >
          Back
        </button>
        <span>
          {i + 1} / {QUIZ.length}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={i} aria-valuemin={0} aria-valuemax={QUIZ.length}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--lm-ember)] to-[var(--lm-gold)] transition-all duration-500"
          style={{ width: `${(i / QUIZ.length) * 100}%` }}
        />
      </div>

      <h1 key={`q${i}`} className="lm-rise font-lm-display mt-10 text-[1.7rem] leading-tight text-[var(--lm-bone)] sm:text-4xl">
        {q.q}
      </h1>
      <div key={`a${i}`} className="mt-8 grid gap-3">
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
