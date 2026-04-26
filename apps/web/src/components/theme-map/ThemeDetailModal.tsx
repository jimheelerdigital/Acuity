"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";

import { CATEGORY, MOOD, TEXT } from "./theme-tokens";
import type { WaveTheme } from "./ThemeMoodWaveRow";

/**
 * Theme detail modal — opened when a row is tapped on web.
 * Centred + backdrop-blurred. CSS @keyframes fade-in (no
 * framer-motion dep). Esc / backdrop click closes.
 */

export type DetailEntry = {
  id: string;
  createdAt: string;
  excerpt: string;
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
};

export function ThemeDetailModal({
  theme,
  entries,
  windowStart,
  windowEnd,
  onClose,
}: {
  theme: WaveTheme;
  entries: DetailEntry[];
  windowStart: string | null;
  windowEnd: string;
  onClose: () => void;
}) {
  const c = CATEGORY[theme.category];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dateRange = useMemo(() => {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return windowStart ? `${fmt(windowStart)} – ${fmt(windowEnd)}` : `through ${fmt(windowEnd)}`;
  }, [windowStart, windowEnd]);

  const positives = theme.entries.filter((e) => e.mood >= 7).length;
  const neutrals = theme.entries.filter((e) => e.mood >= 5 && e.mood < 7).length;
  const negatives = theme.entries.filter((e) => e.mood < 5).length;

  // Per-day counts for the mini line chart (last 30 days within period).
  const days = 30;
  const buckets = useMemo(() => {
    const arr = new Array(days).fill(0);
    const end = new Date(windowEnd).getTime();
    const start = end - days * 86_400_000;
    for (const e of theme.entries) {
      const t = new Date(e.timestamp).getTime();
      if (t < start || t > end) continue;
      const idx = Math.floor((t - start) / 86_400_000);
      if (idx >= 0 && idx < days) arr[idx] += 1;
    }
    return arr;
  }, [theme.entries, windowEnd]);
  const max = Math.max(1, ...buckets);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{
        background: "rgba(8, 8, 16, 0.7)",
        backdropFilter: "blur(8px)",
        animation: "modal-fade 180ms ease-out",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 96vw)",
          maxHeight: "min(820px, 94vh)",
          borderRadius: 20,
          background:
            "linear-gradient(180deg, #1A1530 0%, #0E0E1C 100%)",
          border: `0.5px solid ${c.solid}55`,
          boxShadow: `0 30px 80px -20px rgba(0,0,0,0.8), 0 0 60px ${c.solid}30`,
          animation: "modal-scale 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* header */}
        <div
          className="flex items-start justify-between gap-4 px-6 pt-5"
          style={{ borderBottom: "0.5px solid rgba(255,255,255,0.06)", paddingBottom: 16 }}
        >
          <div>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 500,
                color: TEXT.primary,
                letterSpacing: -0.4,
              }}
            >
              {capitalize(theme.name)}
            </h2>
            <p
              className="mt-1.5 flex items-center gap-2"
              style={{ fontSize: 12, color: TEXT.secondary }}
            >
              <span>
                {theme.count} mention{theme.count === 1 ? "" : "s"} across {dateRange}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: `${colorForMean(theme.meanMood)}20`,
                  border: `0.5px solid ${colorForMean(theme.meanMood)}55`,
                  color: colorForMean(theme.meanMood),
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                mood {theme.meanMood.toFixed(1)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* body — scrollable */}
        <div className="overflow-y-auto px-6 py-5" style={{ gap: 24 }}>
          <Section label="WHEN">
            <MiniDayChart buckets={buckets} max={max} accent={c.solid} />
          </Section>

          <Section label="MOOD BREAKDOWN">
            <div className="flex gap-3">
              <MoodCount label="positive" count={positives} color={MOOD.positive} />
              <MoodCount label="neutral" count={neutrals} color="rgba(168,168,180,0.7)" />
              <MoodCount label="tense" count={negatives} color={MOOD.negative} />
            </div>
          </Section>

          {theme.coOccurrences.length > 0 && (
            <Section label="PAIRS WITH">
              <div className="flex flex-wrap gap-2">
                {theme.coOccurrences.map((co) => (
                  <span
                    key={co.themeName}
                    style={{
                      fontSize: 12,
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.04)",
                      border: "0.5px solid rgba(255,255,255,0.08)",
                      color: TEXT.primary,
                    }}
                  >
                    {capitalize(co.themeName)}{" "}
                    <span style={{ color: TEXT.tertiary, marginLeft: 4 }}>
                      {co.count}
                    </span>
                  </span>
                ))}
              </div>
            </Section>
          )}

          <Section label="ENTRIES">
            <ul className="flex flex-col gap-2">
              {entries.length === 0 && (
                <li style={{ fontSize: 12, color: TEXT.tertiary }}>
                  No entry excerpts available for this period.
                </li>
              )}
              {entries.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/entries/${e.id}`}
                    className="flex items-start gap-3 rounded-lg p-2.5 transition hover:bg-white/[0.03]"
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: TEXT.tertiary,
                        whiteSpace: "nowrap",
                        marginTop: 2,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {new Date(e.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span
                      className="flex-1"
                      style={{
                        fontSize: 14,
                        color: TEXT.primary,
                        lineHeight: 1.45,
                      }}
                    >
                      {e.excerpt || "—"}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        padding: "2px 6px",
                        borderRadius: 999,
                        background:
                          e.sentiment === "POSITIVE"
                            ? `${MOOD.positive}1f`
                            : e.sentiment === "NEGATIVE"
                              ? `${MOOD.negative}1f`
                              : "rgba(168,168,180,0.1)",
                        color:
                          e.sentiment === "POSITIVE"
                            ? MOOD.positive
                            : e.sentiment === "NEGATIVE"
                              ? MOOD.negative
                              : TEXT.secondary,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                      }}
                    >
                      {e.sentiment.slice(0, 3)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <style jsx>{`
        @keyframes modal-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modal-scale {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <p
        className="mb-2.5 uppercase"
        style={{
          fontSize: 12,
          letterSpacing: 2,
          fontWeight: 700,
          color: TEXT.tertiary,
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function MoodCount({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-start rounded-lg px-3 py-2.5"
      style={{
        background: `${color}10`,
        border: `0.5px solid ${color}40`,
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontWeight: 500,
          color: TEXT.primary,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.5,
        }}
      >
        {count}
      </span>
      <span
        style={{
          fontSize: 10,
          color,
          letterSpacing: 0.5,
          marginTop: 2,
          fontWeight: 600,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function MiniDayChart({
  buckets,
  max,
  accent,
}: {
  buckets: number[];
  max: number;
  accent: string;
}) {
  const W = 600;
  const H = 60;
  const stepX = W / Math.max(1, buckets.length - 1);
  const points = buckets.map((v, i) => ({
    x: i * stepX,
    y: H - 4 - (v / max) * (H - 8),
  }));
  let line = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    line += ` L ${points[i].x} ${points[i].y}`;
  }
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="mini-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.4} />
          <stop offset="100%" stopColor={accent} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#mini-fill)" />
      <path
        d={line}
        fill="none"
        stroke={accent}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function colorForMean(mean: number): string {
  if (mean < 5) return MOOD.negative;
  if (mean > 7.5) return MOOD.positive;
  return "rgba(168,168,180,0.7)";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
