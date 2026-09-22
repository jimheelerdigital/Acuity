"use client";

import { useEffect, useState } from "react";

import { SkeletonChart } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";

/**
 * Audience Pulse — history of the nightly Reddit trend digests
 * (2026-09-17 Trends section). Shows what the audience is talking
 * about per brand, the distilled themes/angles that get injected
 * into every content-factory lane, and the raw scraped source
 * posts for auditing a digest.
 */

interface PulseTheme {
  theme: string;
  why?: string;
  angle?: string;
  phrases?: string[];
}

interface SourceGroup {
  subreddit: string;
  titles: string[];
}

interface Digest {
  id: string;
  brand: string;
  date: string;
  themes: PulseTheme[];
  sourcePosts: SourceGroup[];
  createdAt: string;
}

const BRAND_LABELS: Record<string, string> = {
  ripple: "Ripple",
  bwk: "BWK",
};

export default function AudiencePulseTab() {
  const [digests, setDigests] = useState<Digest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runQueued, setRunQueued] = useState(false);

  // "Run now" (2026-09-21, per Keenan): runs the weekly digest +
  // talking-head script report on demand instead of waiting for Monday.
  // The API runs it inline (2026-09-22 — the Inngest function was
  // silently skipping), so this request takes a few minutes.
  const runNow = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/admin/carousels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reddit-digest" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRunQueued(true);
      load(); // fresh digests are in the DB once the run returns
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run the digest");
    } finally {
      setRunning(false);
    }
  };

  const load = () => {
    setError(null);
    fetch("/api/admin/trends/pulse")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))
      )
      .then((json) => setDigests(json.digests ?? []))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  if (error) return <TabError message={error} onRetry={load} />;

  if (!digests) {
    return (
      <div className="space-y-4">
        <SkeletonChart />
        <SkeletonChart />
      </div>
    );
  }

  const runButton = (
    <button
      onClick={runNow}
      disabled={running || runQueued}
      className="shrink-0 rounded-acuity-md border border-acuity-line px-4 py-2 text-sm text-acuity-text-sec transition hover:border-acuity-line-strong hover:text-acuity-text disabled:opacity-50"
    >
      {runQueued
        ? "Done — report emailed ✓"
        : running
          ? "Running… (takes a few minutes, leave this open)"
          : "Run now"}
    </button>
  );

  if (digests.length === 0) {
    return (
      <div className="neo-glass rounded-acuity-lg space-y-4 p-10 text-center">
        <p className="text-sm text-acuity-text-sec">
          No digests yet. The Reddit scrape runs Mondays at 4:00 UTC — or
          run one now. The run also emails the talking-head script report.
        </p>
        {runButton}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-acuity-text-ter">
          Weekly Reddit scrape (Mondays), distilled by Claude into the
          themes and angles injected into every content lane — plus the
          emailed talking-head script report.
        </p>
        {runButton}
      </div>

      {digests.map((d) => {
        const themes = d.themes ?? [];
        const sources = d.sourcePosts ?? [];
        const isOpen = expanded === d.id;
        return (
          <section
            key={d.id}
            className="neo-glass neo-edge rounded-acuity-lg shadow-acuity-soft"
          >
            <header className="flex items-center justify-between gap-3 border-b border-acuity-line px-5 py-3.5">
              <div className="flex items-baseline gap-3">
                <span className="text-[14px] font-semibold text-acuity-primary-hi">
                  {BRAND_LABELS[d.brand] ?? d.brand}
                </span>
                <span className="font-mono text-[11px] text-acuity-text-quiet">
                  {new Date(d.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              {sources.length > 0 && (
                <button
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                  className="text-[11px] text-acuity-primary hover:underline"
                >
                  {isOpen ? "hide sources" : "view sources"}
                </button>
              )}
            </header>

            <div className="space-y-4 p-5">
              {themes.map((t, i) => (
                <div key={i} className="flex gap-3.5">
                  <span className="neo-glow-cyan mt-0.5 shrink-0 font-mono text-[13px] font-bold text-acuity-primary tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-acuity-text">
                      {t.theme}
                    </p>
                    {t.why && (
                      <p className="mt-1 text-[13px] text-acuity-text-sec">
                        {t.why}
                      </p>
                    )}
                    {t.angle && (
                      <p className="mt-1 text-[13px] text-acuity-text-ter">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-acuity-text-quiet">
                          Angle{" "}
                        </span>
                        {t.angle}
                      </p>
                    )}
                    {t.phrases && t.phrases.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {t.phrases.map((p, j) => (
                          <span
                            key={j}
                            className="rounded-acuity-pill bg-acuity-secondary-soft px-2 py-0.5 text-[11px] text-acuity-secondary-hi"
                          >
                            &ldquo;{p}&rdquo;
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isOpen && (
                <div className="mt-2 space-y-3 rounded-acuity-md border border-acuity-line bg-acuity-bg-inset p-4">
                  {sources.map((s, i) => (
                    <div key={i}>
                      <p className="font-mono text-[11px] font-bold text-acuity-text-ter">
                        r/{s.subreddit}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {(s.titles ?? []).map((t, j) => (
                          <li
                            key={j}
                            className="text-[12px] text-acuity-text-quiet"
                          >
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
