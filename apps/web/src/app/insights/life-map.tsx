"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

import {
  PaywallBanner,
  parsePaywallResponse,
} from "@/components/paywall-redirect";
import { DimensionDetailModal } from "./dimension-detail";

type Area = {
  id: string;
  area: string;
  name: string | null;
  color: string | null;
  icon: string | null;
  score: number;
  trend: string | null;
  weeklyDelta: number | null;
  mentionCount: number;
  topThemes: string[];
  insightSummary: string | null;
  historicalHigh: number;
  historicalLow: number;
  baselineScore: number;
};

type MemoryStats = {
  totalEntries: number;
  firstEntryDate: string | null;
  recurringThemes: { area: string; theme: string; count: number }[];
  recurringPeople: { name: string; area: string; sentiment: string; mentionCount: number }[];
  recurringGoals: { goal: string; area: string; mentionCount: number; status: string }[];
};

type HistoryArea = {
  area: string;
  name: string;
  weeklyScores: { week: string; score: number | null }[];
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  thriving: { label: "Thriving", color: "text-emerald-600 bg-emerald-50" },
  steady: { label: "Steady", color: "text-blue-600 bg-blue-50" },
  attention: { label: "Needs attention", color: "text-amber-600 bg-amber-50" },
  struggling: { label: "Struggling", color: "text-red-600 bg-red-50" },
};

function getStatus(score: number): keyof typeof STATUS_LABELS {
  const s = score * 10;
  if (s >= 80) return "thriving";
  if (s >= 60) return "steady";
  if (s >= 40) return "attention";
  return "struggling";
}

type TrendPoint = { area: string; score: number | null };

export function LifeMap() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [memory, setMemory] = useState<MemoryStats | null>(null);
  const [history, setHistory] = useState<HistoryArea[]>([]);
  const [dimensionOverrides, setDimensionOverrides] = useState<
    Record<string, { label: string; color: string | null; isActive: boolean }>
  >({});
  const [selected, setSelected] = useState<string | null>(null);
  // Dimension drill-down modal: lowercase key of the dimension whose
  // detail modal is currently open, or null if none.
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paywall, setPaywall] = useState<
    { message: string; redirect: string } | null
  >(null);
  const [view, setView] = useState<"current" | "trend">("current");
  const [trend, setTrend] = useState<{
    hasEnoughHistory: boolean;
    fourWeeksAgo: TrendPoint[];
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [mapRes, histRes, trendRes, dimRes] = await Promise.all([
        fetch("/api/lifemap"),
        fetch("/api/lifemap/history"),
        fetch("/api/lifemap/trend"),
        fetch("/api/account/life-dimensions"),
      ]);
      if (mapRes.ok) {
        const data = await mapRes.json();
        setAreas(data.areas);
        setMemory(data.memory);
      }
      if (histRes.ok) {
        const data = await histRes.json();
        setHistory(data.history);
      }
      if (trendRes.ok) {
        const data = await trendRes.json();
        setTrend({
          hasEnoughHistory: data.hasEnoughHistory,
          fourWeeksAgo: data.fourWeeksAgo,
        });
      }
      if (dimRes.ok) {
        const data = await dimRes.json();
        const overrides: Record<
          string,
          { label: string; color: string | null; isActive: boolean }
        > = {};
        for (const d of data.dimensions ?? []) {
          overrides[d.area] = {
            label: d.label,
            color: d.color ?? null,
            isActive: d.isActive ?? true,
          };
        }
        setDimensionOverrides(overrides);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = async () => {
    setRefreshing(true);
    setPaywall(null);
    try {
      const res = await fetch("/api/lifemap/refresh", { method: "POST" });
      const paywallInfo = await parsePaywallResponse(res);
      if (paywallInfo) {
        setPaywall(paywallInfo);
        return;
      }
      await fetchData();
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  };

  const displayAreas: Area[] = areas
    .map((a) => {
      const ov = dimensionOverrides[a.area];
      if (!ov) return a;
      return { ...a, name: ov.label ?? a.name, color: ov.color ?? a.color };
    })
    .filter((a) => {
      const ov = dimensionOverrides[a.area];
      return !ov || ov.isActive !== false;
    });

  const selectedArea = displayAreas.find((a) => a.area === selected);
  // History rows carry both `area` (enum) and `name` (title-case). Match
  // on `area` since `selected` is now the enum in every code path.
  const selectedHistory = history.find((h) => h.area === selected);
  // The unlock gate is owned by the parent page via
  // `progression.unlocked.lifeMatrix` (entriesCount >= 5 &&
  // dimensionsCovered >= 3). LifeMap is only mounted when that gate
  // passes, so we don't second-guess it here. A previous in-component
  // gate keyed on `memory.totalEntries < 3` produced false-locks when
  // UserMemory hadn't been seeded yet (e.g. the App Store reviewer
  // account) — the parent page would let the user through, then this
  // gate would re-lock based on a different criterion.

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500" />
      </div>
    );
  }

  return (
    <div>
      {paywall && (
        <PaywallBanner
          message={paywall.message}
          redirect={paywall.redirect}
          src="lifemap_interstitial"
          onClose={() => setPaywall(null)}
        />
      )}
      {/* Memory stats */}
      {memory && memory.totalEntries > 0 && (
        <div className="mb-6 flex items-center gap-4 text-xs text-zinc-400 dark:text-zinc-500">
          <span>
            {memory.totalEntries} debrief{memory.totalEntries === 1 ? "" : "s"} processed
            {memory.firstEntryDate &&
              ` since ${new Date(memory.firstEntryDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
          </span>
          <span className="h-3 w-px bg-zinc-200 dark:bg-white/10" />
          <span>
            {memory.recurringThemes.filter((t: any) => t.count >= 2).length} recurring themes
          </span>
        </div>
      )}

      {/* Unlock gating happens at the parent page (see /life-matrix
          and /insights). LifeMap renders the live view unconditionally
          once mounted. */}
      <>
          {/* Current / Trend toggle — disabled when we don't have 4+
              weeks of data, with a tooltip explaining why. */}
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="inline-flex rounded-full bg-zinc-100 dark:bg-white/5 p-1">
              {(["current", "trend"] as const).map((v) => {
                const disabled = v === "trend" && !trend?.hasEnoughHistory;
                return (
                  <button
                    key={v}
                    disabled={disabled}
                    onClick={() => setView(v)}
                    title={
                      disabled
                        ? "Check back in a few weeks — we need 4+ weeks of data to show a trend."
                        : undefined
                    }
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      view === v
                        ? "bg-white dark:bg-[#1E1E2E] text-zinc-900 dark:text-zinc-50 shadow-sm"
                        : disabled
                          ? "text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    }`}
                  >
                    {v === "current" ? "Current" : "Trend"}
                  </button>
                );
              })}
            </div>
            {view === "trend" && trend?.hasEnoughHistory && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                last 8 weeks
              </span>
            )}
          </div>

          {/* Current view = radar; Trend view = multi-line chart of each
              dimension's weekly average score over the last 8 weeks. */}
          {view === "trend" && trend?.hasEnoughHistory ? (
            <TrendLineChart history={history} displayAreas={displayAreas} />
          ) : (
            <RadarChart
              areas={displayAreas}
              onSelect={(name) => setSelected(selected === name ? null : name)}
              selected={selected}
            />
          )}

          {/* Score cards */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {displayAreas.map((area) => {
              const override = dimensionOverrides[area.area];
              const config = DEFAULT_LIFE_AREAS.find((a) => a.enum === area.area);
              const colorOverride = override?.color ?? area.color ?? config?.color ?? "#71717A";
              const status = getStatus(area.score);
              const { label, color } = STATUS_LABELS[status];
              const isActive = selected === area.area;

              return (
                <button
                  key={area.id}
                  onClick={() => {
                    // Area-card click opens the drill-down modal (new behavior).
                    // Radar node click below still toggles `selected` for the
                    // inline-highlight visual state on the radar itself.
                    if (config?.key) setDetailKey(config.key);
                  }}
                  className={`rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    isActive
                      ? "border-violet-300 bg-violet-50/50 shadow-md"
                      : "border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: colorOverride }}
                    />
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}>
                      {label}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                    {area.name ?? area.area}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                      {area.score * 10}
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">/100</span>
                    {area.weeklyDelta != null && area.weeklyDelta !== 0 && (
                      <span
                        className={`text-xs font-medium ${
                          area.weeklyDelta > 0 ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {area.weeklyDelta > 0 ? "+" : ""}
                        {area.weeklyDelta * 10} this week
                      </span>
                    )}
                  </div>
                  {area.mentionCount > 0 && (
                    <p className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                      Range: {area.historicalLow}–{area.historicalHigh}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Refresh button */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={refresh}
              disabled={refreshing}
              className="rounded-lg px-4 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 transition hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-700 disabled:opacity-50"
            >
              {refreshing ? "Refreshing insights..." : "Refresh insights"}
            </button>
          </div>

          {/* Detail panel */}
          {selectedArea && (
            <DetailPanel
              area={selectedArea}
              memory={memory}
              history={selectedHistory}
              onClose={() => setSelected(null)}
            />
          )}
        </>

      {/* Rich dimension drill-down modal. Opens when the user clicks
          one of the score cards above. Fetches /api/lifemap/dimension/[key]
          which returns Claude-synthesized insights + recent entries +
          related goals + a reflection prompt. */}
      {detailKey && (
        <DimensionDetailModal
          dimensionKey={detailKey}
          onClose={() => setDetailKey(null)}
        />
      )}
    </div>
  );
}

// ─── Radar Chart (SVG) ───────────────────────────────────────────────────────

function RadarChart({
  areas,
  onSelect,
  selected,
  trendAreas,
}: {
  areas: Area[];
  onSelect: (name: string) => void;
  selected: string | null;
  /** Optional "~4 weeks ago" overlay polygon. When provided, renders
   *  a light-grey polygon BEHIND the current-polygon so the user reads
   *  today's shape against a prior baseline. Null entries mean "no
   *  data for that axis" — treated as the current score so the overlay
   *  doesn't distort the vertex at that axis (zero-delta). */
  trendAreas?: Array<{ area: string; score: number | null }>;
}) {
  const cx = 150;
  const cy = 150;
  const maxR = 110;
  const levels = 5;

  const areaConfigs = DEFAULT_LIFE_AREAS;
  const angleStep = (2 * Math.PI) / areaConfigs.length;
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, radius: number) => {
    const angle = startAngle + index * angleStep;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  };

  // Build polygon points from scores. Match on the uppercase enum
  // (CAREER / HEALTH / …) since that's what /api/lifemap returns in
  // `areas[].area`. Previously compared against `config.name` ("Career")
  // which always missed, collapsing the polygon to a single point at
  // the center and producing the empty-hexagon regression.
  const polyPoints = areaConfigs
    .map((config, i) => {
      const area = areas.find((a) => a.area === config.enum);
      const score = area ? area.score / 10 : 0;
      const r = score * maxR;
      const p = getPoint(i, r);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  // Overlay polygon — built from trendAreas (4wk-ago snapshot) keyed
  // by the uppercase enum value; if any vertex has no data, fall back
  // to the current value so the overlay stays a closed shape.
  const trendPolyPoints = trendAreas
    ? areaConfigs
        .map((config, i) => {
          const t = trendAreas.find((ta) => ta.area === config.enum);
          const current = areas.find((a) => a.area === config.enum);
          const score10 =
            t?.score != null
              ? Math.max(0, Math.min(10, t.score / 10))
              : current
                ? current.score / 10
                : 0;
          const p = getPoint(i, score10 * maxR);
          return `${p.x},${p.y}`;
        })
        .join(" ")
    : null;

  return (
    <div className="flex justify-center">
      {/* viewBox expanded from "0 0 300 300" so axis labels at the
          extra-radial offset don't clip on the long names ("Personal
          Growth", "Relationships"). 30px horizontal margin per side,
          10px vertical. */}
      <svg viewBox="-30 -10 360 320" className="w-full max-w-[420px] 2xl:max-w-[640px] h-auto">
        {/* Grid rings — outermost ring slightly stronger than the
            inner three so the chart's outer boundary is clear without
            competing with the data polygon. Class-based strokes scale
            with light/dark theme. */}
        {Array.from({ length: levels }).map((_, i) => {
          const r = ((i + 1) / levels) * maxR;
          const isOuter = i === levels - 1;
          const points = areaConfigs
            .map((_, j) => {
              const p = getPoint(j, r);
              return `${p.x},${p.y}`;
            })
            .join(" ");
          return (
            <polygon
              key={i}
              points={points}
              fill="none"
              className={
                isOuter
                  ? "stroke-zinc-300 dark:stroke-white/[0.15]"
                  : "stroke-zinc-200 dark:stroke-white/[0.10]"
              }
              strokeWidth="0.75"
            />
          );
        })}

        {/* Spokes — same fade as inner rings. */}
        {areaConfigs.map((_, i) => {
          const p = getPoint(i, maxR);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              className="stroke-zinc-200 dark:stroke-white/[0.10]"
              strokeWidth="0.75"
            />
          );
        })}

        {/* Trend overlay polygon — rendered BEHIND the current polygon
            so today's shape reads on top of the baseline. Dashed stroke
            signals "then, not now" without needing a legend. */}
        {trendPolyPoints && (
          <polygon
            points={trendPolyPoints}
            fill="none"
            stroke="#A1A1AA"
            strokeWidth="1"
            strokeDasharray="4 3"
            strokeOpacity="0.7"
            className="transition-all duration-700"
          />
        )}

        {/* Data polygon. Fill bumped from 0.12 to 0.50 (2026-04-27) so
            the shape reads clearly on the larger dedicated /life-matrix
            radar — the original opacity was tuned for a smaller render
            and got lost in the empty space at full size. Stroke +
            vertex dots unchanged. */}
        <polygon
          points={polyPoints}
          fill="#7C3AED"
          fillOpacity="0.50"
          stroke="#7C3AED"
          strokeWidth="1.5"
          className="transition-all duration-700"
        />

        {/* Area nodes + labels — keyed by the uppercase enum everywhere
            so the same `selected` value works whether the user tapped
            the radar or a score card (both now flow the enum). */}
        {areaConfigs.map((config, i) => {
          const area = areas.find((a) => a.area === config.enum);
          const score = area ? area.score / 10 : 0;
          const nodeR = score * maxR;
          const nodeP = getPoint(i, nodeR);
          // Label offset bumped from +18 to +32 (2026-04-27): with
          // the polygon fill at 0.50 the previous offset put labels
          // close enough to the polygon edge that long names like
          // "Personal Growth" and "Relationships" started to touch
          // the fill near high-score vertices. The expanded viewBox
          // above absorbs the extra radial distance.
          const labelP = getPoint(i, maxR + 32);
          const isSelected = selected === config.enum;

          return (
            <g
              key={config.enum}
              className="cursor-pointer"
              onClick={() => onSelect(config.enum)}
            >
              {/* Pulse ring on selected */}
              {isSelected && (
                <circle
                  cx={nodeP.x}
                  cy={nodeP.y}
                  r="8"
                  fill="none"
                  stroke={config.color}
                  strokeWidth="1"
                  className="animate-pulse"
                  opacity="0.5"
                />
              )}
              {/* Node */}
              <circle
                cx={nodeP.x}
                cy={nodeP.y}
                r={isSelected ? "6" : "4.5"}
                fill={config.color}
                className="transition-all duration-300"
                stroke="white"
                strokeWidth="2"
              />
              {/* Label */}
              <text
                x={labelP.x}
                y={labelP.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fontWeight={isSelected ? "700" : "500"}
                fill={isSelected ? "#18181B" : "#71717A"}
                className="transition-all duration-300"
              >
                {config.name}
              </text>
              {/* Score */}
              <text
                x={labelP.x}
                y={labelP.y + 12}
                textAnchor="middle"
                fontSize="9"
                fill="#A1A1AA"
              >
                {area ? area.score * 10 : "—"}
              </text>
            </g>
          );
        })}

        {/* Center */}
        <circle cx={cx} cy={cy} r="3" fill="#18181B" />
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize="8"
          fill="#A1A1AA"
        >
          You
        </text>
      </svg>
    </div>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function DetailPanel({
  area,
  memory,
  history,
  onClose,
}: {
  area: Area;
  memory: MemoryStats | null;
  history: HistoryArea | undefined;
  onClose: () => void;
}) {
  const config = DEFAULT_LIFE_AREAS.find((a) => a.enum === area.area);
  const accentColor = config?.color ?? "#71717A";
  const score100 = area.score * 10;
  const baseline = area.baselineScore;
  const diff = score100 - baseline;

  // Filter memory data for this area
  const areaKey = config?.key ?? "";
  const relatedPeople = memory?.recurringPeople.filter(
    (p: any) => p.area === areaKey && p.mentionCount >= 2
  ) ?? [];
  const relatedGoals = memory?.recurringGoals.filter(
    (g: any) => g.area === areaKey && g.mentionCount >= 1
  ) ?? [];

  // Sparkline data
  const scores = history?.weeklyScores
    .map((w) => w.score)
    .filter((s): s is number => s != null) ?? [];

  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] shadow-sm overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {area.name ?? area.area}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 transition p-1"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Insight callout */}
      {area.insightSummary && (
        <div
          className="mx-6 mt-4 rounded-xl p-4 text-sm leading-relaxed"
          style={{ backgroundColor: accentColor + "10", color: accentColor }}
        >
          {area.insightSummary}
        </div>
      )}

      <div className="px-6 py-4 space-y-5">
        {/* Score vs baseline */}
        <div className="flex items-center gap-4">
          <div>
            <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{score100}</span>
            <span className="text-sm text-zinc-400 dark:text-zinc-500">/100</span>
          </div>
          <div className="text-sm">
            <span
              className={`font-medium ${
                diff > 0
                  ? "text-emerald-600"
                  : diff < 0
                  ? "text-red-500"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {diff > 0 ? "+" : ""}
              {diff}
            </span>{" "}
            <span className="text-zinc-400 dark:text-zinc-500">vs your baseline ({baseline})</span>
          </div>
        </div>

        {/* Sparkline */}
        {scores.length > 1 && (
          <div>
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-2">
              Score over time
            </p>
            <Sparkline data={scores} color={accentColor} />
          </div>
        )}

        {/* Themes */}
        {area.topThemes.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-2">
              Top themes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {area.topThemes.map((theme) => (
                <span
                  key={theme}
                  className="rounded-full bg-zinc-100 dark:bg-white/10 px-2.5 py-0.5 text-xs text-zinc-600 dark:text-zinc-300"
                >
                  {theme}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* People */}
        {relatedPeople.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-2">
              Key people
            </p>
            <div className="space-y-1.5">
              {relatedPeople.map((p: any) => (
                <div key={p.name} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700 dark:text-zinc-200">{p.name}</span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {p.mentionCount}x · {p.sentiment}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Goals */}
        {relatedGoals.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-2">
              Recurring goals
            </p>
            <div className="space-y-1.5">
              {relatedGoals.map((g: any) => (
                <div key={g.goal} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700 dark:text-zinc-200">{g.goal}</span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {g.mentionCount}x
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mention count */}
        <p className="text-xs text-zinc-400 dark:text-zinc-500 pt-2 border-t border-zinc-100 dark:border-white/5">
          Mentioned across {area.mentionCount} of {memory?.totalEntries ?? 0} total debriefs
        </p>
      </div>
    </div>
  );
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;

  const w = 200;
  const h = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - ((v - min) / range) * (h - 4) - 2,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  // Fill area
  const fillD = `${pathD} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10">
      <path d={fillD} fill={color} fillOpacity="0.08" />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}

// ─── Trend line chart ────────────────────────────────────────────────────────

/**
 * Replaces the radar when `view === "trend"`. Renders one colored line
 * per life area over the last 8 weeks using `/api/lifemap/history` data
 * that the parent already fetches. Null scores (weeks with no mention
 * of that area) are left as gaps — recharts handles this when the
 * `connectNulls` prop is false, which is the default.
 */
function TrendLineChart({
  history,
  displayAreas,
}: {
  history: HistoryArea[];
  displayAreas: Area[];
}) {
  // Flatten history (per-area weeklyScores arrays) into a single array
  // of {week, CAREER: 64, HEALTH: null, ...} records keyed by enum, in
  // chronological order. Recharts expects a flat array with one entry
  // per x-axis tick and numeric/null values for each series.
  const weekKeys = new Set<string>();
  for (const a of history) for (const w of a.weeklyScores) weekKeys.add(w.week);
  const weeks = Array.from(weekKeys).sort();

  const data = weeks.map((week) => {
    const row: Record<string, string | number | null> = { week };
    for (const config of DEFAULT_LIFE_AREAS) {
      const areaHistory = history.find((h) => h.area === config.key);
      const w = areaHistory?.weeklyScores.find((ws) => ws.week === week);
      row[config.enum] = w?.score ?? null;
    }
    row.label = new Date(week).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return row;
  });

  // Only show lines for areas currently visible on the user's matrix
  // (respects per-user dimension activation overrides the parent applied).
  const enabledEnums = new Set(displayAreas.map((a) => a.area));
  const series = DEFAULT_LIFE_AREAS.filter((a) => enabledEnums.has(a.enum));

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Not enough history yet — record a few more debriefs and the trend
        lines will appear here.
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, left: -12, bottom: 0 }}
        >
          <CartesianGrid
            stroke="#E4E4E7"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#A1A1AA" }}
            axisLine={{ stroke: "#E4E4E7" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#A1A1AA" }}
            axisLine={{ stroke: "#E4E4E7" }}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: "#1E1E2E",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
              color: "#FAFAFA",
            }}
            itemStyle={{ color: "#FAFAFA" }}
            labelStyle={{ color: "#A1A1AA", marginBottom: 4 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
          />
          {series.map((config) => (
            <Line
              key={config.enum}
              type="monotone"
              dataKey={config.enum}
              name={config.name}
              stroke={config.color}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
