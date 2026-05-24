"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { StickyBackButton } from "@/components/back-button";
import {
  Card,
  GradientText,
  OrbitalCosmos,
  SectionHeader,
  SegmentedTabs,
  hueForTheme,
  type OrbitalTheme,
} from "@/components/acuity";
import { LockedState } from "@/components/theme-map/LockedState";

type SentimentBand = "positive" | "neutral" | "challenging";

type ApiTheme = {
  id: string;
  name: string;
  mentionCount: number;
  sentimentBand: SentimentBand;
  meanMood: number;
  trend: { priorPeriodCount: number; ratio: number | null };
  trendDescription: string;
};

type ApiResponse = {
  themes: ApiTheme[];
  totalMentions: number;
  topTheme: string | null;
  topThemeName: string | null;
  periodLabel: string;
  meta: {
    totalEntries: number;
    windowStart: string | null;
    windowEnd: string;
    /** Window the user asked for. */
    requestedWindow?: string;
    /** Echoes requestedWindow now — fix 2 (2026-05-24) removed
     *  silent server-side widening. Kept for back-compat. */
    appliedWindow?: string;
    /** Always false now; kept for back-compat. */
    widened?: boolean;
    /** Fix 2: narrowest wider window with >= 3 themes (if any).
     *  Drives the empty-state "Try the last 3 months?" CTA. */
    suggestedWindow?: string;
  };
};

const REQUESTED_WINDOW_LABEL: Record<string, string> = {
  week: "your last week",
  month: "your last month",
  "3months": "your last 3 months",
  "6months": "your last 6 months",
  year: "your last year",
  all: "your entries",
};

type TimeWindow = "week" | "month" | "3months" | "year" | "all";

const TIME_TABS = [
  { id: "week" as const, label: "Week" },
  { id: "month" as const, label: "Month" },
  { id: "3months" as const, label: "3 months" },
  { id: "year" as const, label: "Year" },
  { id: "all" as const, label: "All time" },
];

const UNLOCK_THRESHOLD = 10;
const MIN_MENTIONS_FOR_PLANET = 2;

/**
 * /insights/theme-map client — slice 24 / 6b (2026-05-24) rewrite.
 *
 * Replaces the previous force-graph / ThemeMapDashboard treatment
 * with the canonical OrbitalCosmos: 9-planet (up to 6 rendered)
 * orbital cosmos with atmospheric planet treatment, deterministic
 * star field, dashed connector lines, and once-per-session spin-in
 * choreography. Mirrors mobile composition 1:1.
 *
 * Data shape match:
 *   - API returns themes with mentionCount + sentimentBand
 *   - We filter to mentionCount >= 2 (so single mentions don't bloat
 *     the cosmos) + sort by mentionCount desc + take first 6
 *   - Hue derived via hueForTheme() — canonical 9 themes get their
 *     locked hue, anything else gets FNV-1a hash
 *
 * Tap → /insights/theme/[themeId] for the detail view (existing
 * route, unchanged).
 */
export function ThemeMapClient() {
  const router = useRouter();
  const [window_, setWindow] = useState<TimeWindow>("month");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (win: TimeWindow) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/insights/theme-map?window=${encodeURIComponent(win)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load your Theme Map."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(window_);
  }, [window_, fetchData]);

  const entryCount = data?.meta.totalEntries ?? 0;
  const locked = entryCount < UNLOCK_THRESHOLD;

  // Filter + sort + cap to feed OrbitalCosmos. mentionCount ≥ 2 floor
  // matches the mobile orbital — singletons don't earn a planet.
  const orbitalThemes: OrbitalTheme[] = useMemo(() => {
    if (!data) return [];
    return data.themes
      .filter((t) => t.mentionCount >= MIN_MENTIONS_FOR_PLANET)
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 6)
      .map((t) => ({
        id: t.id,
        name: t.name,
        hue: hueForTheme(t.name),
        mentionCount: t.mentionCount,
        sentimentBand: t.sentimentBand,
      }));
  }, [data]);

  // Top theme + simple trend descriptor for the insight strip.
  const topTheme = orbitalThemes[0] ?? null;
  const topApiTheme = useMemo(() => {
    if (!topTheme || !data) return null;
    return data.themes.find((t) => t.id === topTheme.id) ?? null;
  }, [data, topTheme]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-acuity-line border-t-acuity-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center text-[15px] text-acuity-text-sec">
        {error}
      </div>
    );
  }

  if (locked) {
    return (
      <>
        <StickyBackButton />
        <Header
          activeCount={0}
          totalEntries={entryCount}
          windowLabel={data?.periodLabel}
        />
        <LockedState count={entryCount} />
      </>
    );
  }

  return (
    <>
      <StickyBackButton />
      <Header
        activeCount={orbitalThemes.length}
        totalEntries={entryCount}
        windowLabel={data?.periodLabel}
      />

      <div className="mt-5">
        <SegmentedTabs
          tabs={TIME_TABS}
          activeId={window_}
          onChange={(id) => setWindow(id as TimeWindow)}
        />
      </div>

      {orbitalThemes.length > 0 ? (
        <>
          {/* Fix 1 (2026-05-24): orbital uses the available canvas
              instead of sitting as a 440px stamp in the middle of
              an empty desktop content area. Container scales:
              full width on mobile, 480px on tablet, 720px on
              desktop. OrbitalCosmos receives no `width` prop, so
              it sizes the SVG to 100% with preserveAspectRatio +
              the 402/360 wrapper aspect-ratio locking the height. */}
          <div className="mt-8 mx-auto w-full max-w-[480px] md:max-w-[720px]">
            <OrbitalCosmos
              themes={orbitalThemes}
              onPlanetTap={(theme) => {
                router.push(`/insights/theme/${theme.id}`);
              }}
            />
          </div>

          {topTheme && topApiTheme && (
            <Card variant="default" radius="xl" padding={6} className="mt-10">
              <SectionHeader label="Most-mentioned this period" />
              <p className="mt-3 font-display text-xl font-semibold text-acuity-text">
                {topTheme.name}
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-acuity-text-sec">
                {topApiTheme.trendDescription} ·{" "}
                <span className="font-mono text-[13px] text-acuity-text-ter">
                  {topTheme.mentionCount} mentions
                </span>
              </p>
            </Card>
          )}
        </>
      ) : (
        // Empty state (2026-05-24 follow-up): the "Try the last X"
        // gradient pill was redundant with the toggle already at
        // the top of the page. Two paths to the same action with
        // the pill drawing the eye to the middle of empty space.
        // Now: just a soft textTer acknowledgment, centered where
        // the orbital would have been. Server still returns
        // `suggestedWindow` for any future consumer; client no
        // longer renders a CTA.
        <p className="my-16 text-center text-[14px] text-acuity-text-ter">
          No themes in {REQUESTED_WINDOW_LABEL[window_] ?? "this window"}{" "}
          yet.
        </p>
      )}
    </>
  );
}

function Header({
  activeCount,
  totalEntries,
  windowLabel,
}: {
  activeCount: number;
  totalEntries: number;
  windowLabel?: string;
}) {
  return (
    <header className="acuity-fade-up mb-2">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
        What you think about
      </p>
      <h1 className="mt-2 font-display text-4xl font-bold leading-[1.05] tracking-tight text-acuity-text lg:text-5xl">
        <GradientText variant="mix">{activeCount}</GradientText> active theme
        {activeCount === 1 ? "" : "s"}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-acuity-text-sec">
        {totalEntries} {totalEntries === 1 ? "entry" : "entries"}
        {windowLabel ? ` · ${windowLabel}` : ""}
      </p>
    </header>
  );
}

export { ThemeMapClient as default };
