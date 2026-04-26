"use client";

import { useState } from "react";

import { ThemeCardsStrip, type StripTheme } from "./ThemeCardsStrip";
import { ThemeDetailModal, type DetailEntry } from "./ThemeDetailModal";
import {
  ThemeMoodWaveRow,
  type WaveTheme,
} from "./ThemeMoodWaveRow";
import { ThemeRings, type ThemePeriods } from "./ThemeRings";
import { BG_GRADIENT, CARD_STYLE, TEXT } from "./theme-tokens";

/**
 * Theme Map v2 — composition root. Single scrollable page (no tabs,
 * no carousel). Sections, top → bottom:
 *
 *   1. Eyebrow + title + subtitle (rendered by the route, not here)
 *   2. Time range chips (rendered by the route)
 *   3. "PERIOD AT A GLANCE"
 *   4. ThemeRings (rings + narrative)
 *   5. ThemeCardsStrip (top 5)
 *   6. "EVERY THEME · TAP TO EXPLORE"
 *   7. Mood-wave list (top 11 visible + "Show N more")
 *
 * Tapping a row opens ThemeDetailModal (web). Empty / sparse states
 * downgrade gracefully (rings + cards stay; wave list hides).
 */

export type SentimentTone = "positive" | "challenging" | "neutral";

export type DashboardTheme = WaveTheme & {
  // Carry-over fields from the legacy API the ThemeRings + cards need.
  sentimentBand: SentimentTone;
  sparkline: number[];
  trendDescription: string;
  firstMentionedDaysAgo: number;
  recentEntries: DetailEntry[];
};

export function ThemeMapDashboard({
  themes,
  totalMentions,
  topThemeName,
  periods,
  windowStart,
  windowEnd,
}: {
  themes: DashboardTheme[];
  totalMentions: number;
  topThemeName: string | null;
  periods: ThemePeriods;
  windowStart: string | null;
  windowEnd: string;
}) {
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const activeTheme = themes.find((t) => t.id === activeThemeId) ?? null;

  if (themes.length === 0) {
    return (
      <EmptyState
        title="Patterns will appear as you record."
        body="Record your first reflection to see your themes start surfacing here."
      />
    );
  }

  const stripThemes: StripTheme[] = themes.slice(0, 5).map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    count: t.count,
    meanMood: t.meanMood,
    trend: t.trend,
  }));

  const maxCount = Math.max(...themes.map((t) => t.count));
  const VISIBLE = 11;
  const visibleThemes = showAll ? themes : themes.slice(0, VISIBLE);
  const hiddenCount = Math.max(0, themes.length - VISIBLE);

  const fewThemes = themes.length < 3;

  return (
    <div
      className="relative isolate overflow-hidden rounded-3xl"
      style={{ background: BG_GRADIENT }}
    >
      <Atmosphere />
      <div className="relative space-y-7 px-5 py-7 sm:px-7 sm:py-8">
        {/* 3. Period at a glance */}
        <SectionLabel label="PERIOD AT A GLANCE" dot="#FB923C" />

        {/* 4. Hero rings */}
        <ThemeRings
          periods={periods}
          topThemeName={topThemeName ?? themes[0].name}
          totalMentions={totalMentions}
        />

        {/* 5. Top 5 cards */}
        <ThemeCardsStrip themes={stripThemes} onTap={setActiveThemeId} />

        {!fewThemes && (
          <>
            {/* 6. Every theme */}
            <SectionLabel label="EVERY THEME · TAP TO EXPLORE" dot="#FB923C" />

            {/* 7. Wave row list */}
            <div
              className="overflow-hidden rounded-2xl"
              style={CARD_STYLE}
            >
              {visibleThemes.map((t, i) => (
                <ThemeMoodWaveRow
                  key={t.id}
                  rank={i + 1}
                  theme={t}
                  maxCountInPeriod={maxCount}
                  isFirst={i === 0}
                  onTap={setActiveThemeId}
                />
              ))}
            </div>
            {hiddenCount > 0 && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="rounded-full px-4 py-2 transition hover:bg-white/[0.04]"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "0.5px solid rgba(255,255,255,0.08)",
                    color: TEXT.secondary,
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {showAll
                    ? "Show fewer themes"
                    : `Show ${hiddenCount} more theme${hiddenCount === 1 ? "" : "s"}`}
                </button>
              </div>
            )}
          </>
        )}

        {fewThemes && (
          <p
            className="text-center"
            style={{ fontSize: 12, color: TEXT.tertiary, padding: "12px 0" }}
          >
            More patterns will appear as you keep journaling.
          </p>
        )}
      </div>

      {activeTheme && (
        <ThemeDetailModal
          theme={activeTheme}
          entries={activeTheme.recentEntries ?? []}
          windowStart={windowStart}
          windowEnd={windowEnd}
          onClose={() => setActiveThemeId(null)}
        />
      )}
    </div>
  );
}

function SectionLabel({ label, dot }: { label: string; dot: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: dot,
          boxShadow: `0 0 10px ${dot}, 0 0 18px ${dot}80`,
        }}
      />
      <span
        style={{
          fontSize: 10.5,
          letterSpacing: 2.4,
          fontWeight: 700,
          color: "rgba(168,168,180,0.65)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Atmosphere() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-44 left-1/2 -translate-x-1/2"
        style={{
          width: 1100,
          height: 1100,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(251,146,60,0.3) 0%, rgba(167,139,250,0.18) 30%, transparent 65%)",
          filter: "blur(80px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-32"
        style={{
          width: 520,
          height: 520,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(34,211,238,0.28) 0%, transparent 70%)",
          filter: "blur(70px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-24"
        style={{
          width: 360,
          height: 360,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(244,114,182,0.18) 0%, transparent 65%)",
          filter: "blur(70px)",
        }}
      />
    </>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-3xl px-6 py-16 text-center"
      style={{ background: BG_GRADIENT }}
    >
      <div
        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          background: "rgba(251,146,60,0.18)",
          border: "0.5px solid rgba(251,146,60,0.4)",
        }}
      >
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
            stroke="#FCA85A"
            strokeWidth={1.5}
          />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="#FCA85A" strokeWidth={1.5} />
          <line x1="12" y1="19" x2="12" y2="22" stroke="#FCA85A" strokeWidth={1.5} />
        </svg>
      </div>
      <h3
        style={{
          fontSize: 18,
          fontWeight: 500,
          color: TEXT.primary,
          letterSpacing: -0.2,
        }}
      >
        {title}
      </h3>
      <p
        className="mt-2"
        style={{ fontSize: 13, color: TEXT.secondary, maxWidth: 360, margin: "8px auto 0" }}
      >
        {body}
      </p>
    </div>
  );
}
