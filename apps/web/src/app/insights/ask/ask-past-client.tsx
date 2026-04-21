"use client";

import Link from "next/link";
import { useState } from "react";

import { formatRelativeDate } from "@acuity/shared";

/**
 * "Ask your past self" input + answer surface.
 *
 * Empty state shows example prompts the user can tap to pre-fill the
 * box. Submit runs the full pipeline (embed → search → Claude) on the
 * server; we just render the result + cited entries. Questions +
 * answers from this session stay in local component state; a proper
 * history sidebar can come later.
 */

const EXAMPLES = [
  "How did I feel about work last month?",
  "What's changed since January?",
  "When do I feel most energized?",
  "What keeps coming up when I talk about my partner?",
  "What was I worried about a month ago?",
];

type Cited = {
  id: string;
  createdAt: string;
  excerpt: string;
  score: number;
};

type Answer = {
  question: string;
  answer: string;
  citedEntries: Cited[];
};

export function AskPastClient() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Answer[]>([]);

  const submit = async (raw?: string) => {
    const q = (raw ?? question).trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/ask-past", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        setError(
          `You've hit today's 10-question limit. Try again tomorrow.${
            body.detail ? ` (${body.detail})` : ""
          }`
        );
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail ?? body.error ?? `HTTP ${res.status}`);
        return;
      }
      const body = await res.json();
      setHistory((prev) => [
        {
          question: q,
          answer: body.answer,
          citedEntries: body.citedEntries ?? [],
        },
        ...prev,
      ]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <Link
          href="/insights"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition"
        >
          ← Insights
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Ask your past self
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          We pull the most relevant entries from your journal and let
          Claude answer in your own words. 10 questions per day.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] dark:shadow-none dark:ring-1 dark:ring-white/5">
        <label htmlFor="ask-input" className="sr-only">
          Ask a question
        </label>
        <textarea
          id="ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask anything about your past self…"
          rows={3}
          className="w-full resize-none rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500"
          disabled={loading}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            ⌘ + Enter to submit
          </p>
          <button
            onClick={() => submit()}
            disabled={loading || !question.trim()}
            className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40"
          >
            {loading ? "Thinking…" : "Ask"}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      {history.length === 0 && !loading && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Try asking
          </h2>
          <div className="space-y-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setQuestion(ex);
                  // fire on tap so the user can test without also typing
                  submit(ex);
                }}
                className="w-full text-left rounded-xl border border-dashed border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-sm text-zinc-700 dark:text-zinc-200 hover:border-violet-300 dark:hover:border-violet-700/40 transition"
              >
                {ex}
              </button>
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="mt-8 space-y-8">
          {history.map((h, i) => (
            <article
              key={i}
              className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-2">
                You asked
              </p>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 mb-5 italic">
                {h.question}
              </p>

              <div className="prose prose-zinc dark:prose-invert max-w-none text-sm leading-relaxed">
                {h.answer.split(/\n\n+/).map((para, pi) => (
                  <p key={pi} className="mb-3 text-zinc-700 dark:text-zinc-200">
                    {para}
                  </p>
                ))}
              </div>

              {h.citedEntries.length > 0 && (
                <div className="mt-5 pt-5 border-t border-zinc-100 dark:border-white/10">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                    From these entries
                  </p>
                  <div className="space-y-2">
                    {h.citedEntries.map((c) => (
                      <Link
                        key={c.id}
                        href={`/entry/${c.id}`}
                        className="block rounded-lg border border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-[#13131F] px-3 py-2 hover:border-violet-300 dark:hover:border-violet-700/40 transition"
                      >
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-1">
                          {formatRelativeDate(c.createdAt)}
                        </p>
                        <p className="text-xs text-zinc-700 dark:text-zinc-200 line-clamp-2">
                          {c.excerpt}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
