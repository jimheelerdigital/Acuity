"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Insights card that surfaces simple mood ↔ health-data correlations.
 * Silent when the user hasn't connected Apple Health yet (no rows)
 * OR there's not enough overlap (<7 paired days). No empty state —
 * we'd rather the card not appear than nag the user.
 */

type Correlation = {
  kind: "sleep" | "steps" | "hrv" | "active";
  direction: "up" | "down" | "flat";
  observation: string;
  pairedDays: number;
};

const KIND_ICON: Record<Correlation["kind"], string> = {
  sleep: "🌙",
  steps: "👟",
  hrv: "💓",
  active: "🏃",
};

export function HealthCorrelationsCard() {
  const [items, setItems] = useState<Correlation[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/insights/health-correlations");
      if (res.ok) {
        const body = await res.json();
        setItems(body.correlations ?? []);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!items || items.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        Body signals
      </h2>
      <div className="space-y-2">
        {items.map((c) => (
          <div
            key={c.kind}
            className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 flex items-start gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] dark:shadow-none dark:ring-1 dark:ring-white/5"
          >
            <span className="text-lg leading-none mt-0.5">{KIND_ICON[c.kind]}</span>
            <div className="flex-1">
              <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-snug">
                {c.observation}
              </p>
              <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                Based on {c.pairedDays} day{c.pairedDays === 1 ? "" : "s"} of overlap.
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
