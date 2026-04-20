"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

import {
  PaywallBanner,
  parsePaywallResponse,
} from "@/components/paywall-redirect";

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

export function LifeMap() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [memory, setMemory] = useState<MemoryStats | null>(null);
  const [history, setHistory] = useState<HistoryArea[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paywall, setPaywall] = useState<
    { message: string; redirect: string } | null
  >(null);

  const fetchData = useCallback(async () => {
    try {
      const [mapRes, histRes] = await Promise.all([
        fetch("/api/lifemap"),
        fetch("/api/lifemap/history"),
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

  const selectedArea = areas.find((a) => a.area === selected);
  const selectedHistory = history.find(
    (h) => h.name === selected
  );
  const isLocked = !memory || memory.totalEntries < 3;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-violet-500" />
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
        <div className="mb-6 flex items-center gap-4 text-xs text-zinc-400">
          <span>
            {memory.totalEntries} debrief{memory.totalEntries === 1 ? "" : "s"} processed
            {memory.firstEntryDate &&
              ` since ${new Date(memory.firstEntryDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
          </span>
          <span className="h-3 w-px bg-zinc-200" />
          <span>
            {memory.recurringThemes.filter((t: any) => t.count >= 2).length} recurring themes
          </span>
        </div>
      )}

      {/* Locked state */}
      {isLocked ? (
        <div className="relative">
          <div className="blur-sm pointer-events-none opacity-50">
            <RadarChart areas={areas} onSelect={() => {}} selected={null} />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border border-zinc-200 bg-white px-8 py-6 text-center shadow-lg">
              <div className="text-3xl mb-3">🗺️</div>
              <p className="text-sm font-semibold text-zinc-900 mb-1">
                Record {3 - (memory?.totalEntries ?? 0)} more debrief{3 - (memory?.totalEntries ?? 0) === 1 ? "" : "s"} to unlock your Life Matrix
              </p>
              <p className="text-xs text-zinc-400">
                We need at least 3 sessions to map your life areas.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Radar chart */}
          <RadarChart
            areas={areas}
            onSelect={(name) => setSelected(selected === name ? null : name)}
            selected={selected}
          />

          {/* Score cards */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {areas.map((area) => {
              const config = DEFAULT_LIFE_AREAS.find((a) => a.enum === area.area);
              const status = getStatus(area.score);
              const { label, color } = STATUS_LABELS[status];
              const isActive = selected === area.area;

              return (
                <button
                  key={area.id}
                  onClick={() => setSelected(isActive ? null : area.area)}
                  className={`rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    isActive
                      ? "border-violet-300 bg-violet-50/50 shadow-md"
                      : "border-zinc-200 bg-white shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: config?.color ?? "#71717A" }}
                    />
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}>
                      {label}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-zinc-900 mb-1">
                    {area.name ?? area.area}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-zinc-900">
                      {area.score * 10}
                    </span>
                    <span className="text-xs text-zinc-400">/100</span>
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
                    <p className="mt-1 text-[10px] text-zinc-400">
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
              className="rounded-lg px-4 py-2 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
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
      )}
    </div>
  );
}

// ─── Radar Chart (SVG) ───────────────────────────────────────────────────────

function RadarChart({
  areas,
  onSelect,
  selected,
}: {
  areas: Area[];
  onSelect: (name: string) => void;
  selected: string | null;
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

  // Build polygon points from scores
  const polyPoints = areaConfigs
    .map((config, i) => {
      const area = areas.find((a) => a.area === config.name);
      const score = area ? area.score / 10 : 0;
      const r = score * maxR;
      const p = getPoint(i, r);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <div className="flex justify-center">
      <svg viewBox="0 0 300 300" className="w-full max-w-[400px] h-auto">
        {/* Grid rings */}
        {Array.from({ length: levels }).map((_, i) => {
          const r = ((i + 1) / levels) * maxR;
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
              stroke="#E4E4E7"
              strokeWidth="0.5"
            />
          );
        })}

        {/* Spokes */}
        {areaConfigs.map((_, i) => {
          const p = getPoint(i, maxR);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="#E4E4E7"
              strokeWidth="0.5"
            />
          );
        })}

        {/* Data polygon */}
        <polygon
          points={polyPoints}
          fill="#7C3AED"
          fillOpacity="0.12"
          stroke="#7C3AED"
          strokeWidth="1.5"
          className="transition-all duration-700"
        />

        {/* Area nodes + labels */}
        {areaConfigs.map((config, i) => {
          const area = areas.find((a) => a.area === config.name);
          const score = area ? area.score / 10 : 0;
          const nodeR = score * maxR;
          const nodeP = getPoint(i, nodeR);
          const labelP = getPoint(i, maxR + 18);
          const isSelected = selected === config.name;

          return (
            <g
              key={config.name}
              className="cursor-pointer"
              onClick={() => onSelect(config.name)}
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
  const config = DEFAULT_LIFE_AREAS.find((a) => a.name === area.area);
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
    <div className="mt-6 rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <h3 className="text-lg font-semibold text-zinc-900">
            {area.name ?? area.area}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-700 transition p-1"
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
            <span className="text-3xl font-bold text-zinc-900">{score100}</span>
            <span className="text-sm text-zinc-400">/100</span>
          </div>
          <div className="text-sm">
            <span
              className={`font-medium ${
                diff > 0
                  ? "text-emerald-600"
                  : diff < 0
                  ? "text-red-500"
                  : "text-zinc-500"
              }`}
            >
              {diff > 0 ? "+" : ""}
              {diff}
            </span>{" "}
            <span className="text-zinc-400">vs your baseline ({baseline})</span>
          </div>
        </div>

        {/* Sparkline */}
        {scores.length > 1 && (
          <div>
            <p className="text-xs font-medium text-zinc-400 mb-2">
              Score over time
            </p>
            <Sparkline data={scores} color={accentColor} />
          </div>
        )}

        {/* Themes */}
        {area.topThemes.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-400 mb-2">
              Top themes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {area.topThemes.map((theme) => (
                <span
                  key={theme}
                  className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600"
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
            <p className="text-xs font-medium text-zinc-400 mb-2">
              Key people
            </p>
            <div className="space-y-1.5">
              {relatedPeople.map((p: any) => (
                <div key={p.name} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700">{p.name}</span>
                  <span className="text-xs text-zinc-400">
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
            <p className="text-xs font-medium text-zinc-400 mb-2">
              Recurring goals
            </p>
            <div className="space-y-1.5">
              {relatedGoals.map((g: any) => (
                <div key={g.goal} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700">{g.goal}</span>
                  <span className="text-xs text-zinc-400">
                    {g.mentionCount}x
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mention count */}
        <p className="text-xs text-zinc-400 pt-2 border-t border-zinc-100">
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
