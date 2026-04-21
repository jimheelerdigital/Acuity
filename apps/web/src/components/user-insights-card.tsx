"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Auto-flagged observations surface. Renders up to 3 non-dismissed
 * UserInsight rows at the top of /insights. Severity-tinted left
 * border + icon; individual X dismisses (fires POST dismiss, removes
 * from view). Weekly Inngest cron refills.
 */

type Severity = "POSITIVE" | "NEUTRAL" | "CONCERNING";

type Observation = {
  id: string;
  observationText: string;
  severity: Severity;
  linkedAreaId: string | null;
  createdAt: string;
};

const SEVERITY_STYLES: Record<
  Severity,
  { border: string; bg: string; text: string; icon: string }
> = {
  POSITIVE: {
    border: "border-l-emerald-500",
    bg: "bg-emerald-50/50 dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-300",
    icon: "↑",
  },
  NEUTRAL: {
    border: "border-l-zinc-400 dark:border-l-zinc-600",
    bg: "bg-zinc-50 dark:bg-white/5",
    text: "text-zinc-700 dark:text-zinc-200",
    icon: "•",
  },
  CONCERNING: {
    border: "border-l-amber-500",
    bg: "bg-amber-50/50 dark:bg-amber-950/20",
    text: "text-amber-700 dark:text-amber-300",
    icon: "↓",
  },
};

export function UserInsightsCard() {
  const [items, setItems] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/insights/observations");
      if (res.ok) {
        const data = await res.json();
        setItems(data.observations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = async (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    fetch("/api/insights/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", id }),
    }).catch(() => {});
  };

  if (loading || items.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        What we noticed
      </h2>
      <div className="space-y-2">
        {items.map((o) => {
          const s = SEVERITY_STYLES[o.severity];
          return (
            <div
              key={o.id}
              className={`flex items-start justify-between gap-3 rounded-xl border-l-4 ${s.border} ${s.bg} px-4 py-3`}
            >
              <div className="flex items-start gap-2 min-w-0">
                <span className={`text-base font-bold ${s.text}`}>{s.icon}</span>
                <p className={`text-sm leading-snug ${s.text}`}>
                  {o.observationText}
                </p>
              </div>
              <button
                onClick={() => dismiss(o.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded-full p-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white/40 dark:hover:bg-white/10 transition"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
