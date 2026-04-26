"use client";

import type { CategoryToken } from "./theme-tokens";
import { CATEGORY } from "./theme-tokens";

/**
 * Top-5 theme cards. 5-col grid on desktop, horizontal scroll on
 * mobile. Each card shows a trend chip (up / new / steady / fading),
 * theme name, count, and "mood X.X · descriptor".
 */

export type StripTheme = {
  id: string;
  name: string;
  category: CategoryToken;
  count: number;
  meanMood: number;
  trend: { priorPeriodCount: number; ratio: number | null };
};

export function ThemeCardsStrip({
  themes,
  onTap,
}: {
  themes: StripTheme[];
  onTap?: (id: string) => void;
}) {
  const top5 = themes.slice(0, 5);
  if (top5.length === 0) return null;
  return (
    <div className="-mx-2 overflow-x-auto px-2 pb-1 sm:mx-0 sm:overflow-x-visible sm:px-0">
      <div
        className="flex gap-3 sm:grid sm:gap-3"
        style={{
          gridTemplateColumns: `repeat(${Math.min(5, top5.length)}, minmax(0, 1fr))`,
        }}
      >
        {top5.map((t) => (
          <Card key={t.id} theme={t} onTap={onTap} />
        ))}
      </div>
    </div>
  );
}

function Card({
  theme,
  onTap,
}: {
  theme: StripTheme;
  onTap?: (id: string) => void;
}) {
  const c = CATEGORY[theme.category];
  const trend = computeTrend(theme.count, theme.trend.priorPeriodCount);
  const moodDesc = describeMood(theme.meanMood);

  const Tag: keyof JSX.IntrinsicElements = onTap ? "button" : "div";
  return (
    <Tag
      onClick={onTap ? () => onTap(theme.id) : undefined}
      className="group shrink-0 cursor-pointer rounded-xl text-left transition hover:-translate-y-0.5"
      style={{
        width: "min(220px, 80vw)",
        padding: 22,
        background: `linear-gradient(180deg, ${c.solid}14 0%, ${c.solid}05 100%)`,
        border: `0.5px solid ${c.solid}66`,
        boxShadow: `0 18px 50px -28px ${c.solid}90`,
      }}
    >
      <TrendChip trend={trend} accent={c.solid} />
      <div
        className="truncate"
        style={{
          marginTop: 12,
          marginBottom: 10,
          fontSize: 17,
          fontWeight: 500,
          color: "#FAFAFA",
          letterSpacing: -0.1,
          lineHeight: 1.25,
        }}
      >
        {capitalize(theme.name)}
      </div>
      <div
        style={{
          fontSize: 40,
          fontWeight: 500,
          letterSpacing: -1.5,
          color: "#FAFAFA",
          fontVariantNumeric: "tabular-nums",
          textShadow: `0 0 18px ${c.solid}60`,
          lineHeight: 1,
        }}
      >
        {theme.count}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 14,
          color: "rgba(168,168,180,0.7)",
        }}
      >
        mood {theme.meanMood.toFixed(1)} ·{" "}
        <span style={{ color: moodDesc.color }}>{moodDesc.label}</span>
      </div>
    </Tag>
  );
}

type TrendKind = "up" | "new" | "steady" | "fading";
function computeTrend(current: number, prior: number): { kind: TrendKind; multiplier?: number } {
  if (prior === 0 && current > 0) return { kind: "new" };
  if (prior === 0) return { kind: "steady" };
  const ratio = current / prior;
  if (ratio >= 2) return { kind: "up", multiplier: Math.round(ratio) };
  if (ratio < 0.5) return { kind: "fading" };
  if (ratio >= 0.7 && ratio <= 1.3) return { kind: "steady" };
  if (ratio > 1.3) return { kind: "up", multiplier: Math.round(ratio * 10) / 10 };
  return { kind: "fading" };
}

function TrendChip({
  trend,
  accent,
}: {
  trend: ReturnType<typeof computeTrend>;
  accent: string;
}) {
  const labelMap: Record<TrendKind, string> = {
    up: trend.multiplier ? `↑ ${trend.multiplier}× UP` : "↑ UP",
    new: "↑ NEW",
    steady: "STEADY",
    fading: "↓ FADING",
  };
  const dotColor =
    trend.kind === "up" || trend.kind === "new"
      ? accent
      : trend.kind === "fading"
        ? "#FB7185"
        : "rgba(168,168,180,0.7)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
      style={{
        background: `${dotColor}1f`,
        border: `0.5px solid ${dotColor}55`,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 1.6,
        color: dotColor,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: 9999,
          background: dotColor,
          boxShadow: `0 0 6px ${dotColor}`,
        }}
      />
      {labelMap[trend.kind]}
    </span>
  );
}

function describeMood(mean: number): { label: string; color: string } {
  if (mean >= 8) return { label: "warm", color: "#FCA85A" };
  if (mean >= 7) return { label: "positive", color: "#34D399" };
  if (mean >= 6) return { label: "reflective", color: "#A78BFA" };
  if (mean >= 5) return { label: "neutral", color: "rgba(168,168,180,0.8)" };
  return { label: "tense", color: "#FB7185" };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
