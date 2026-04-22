"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { formatRelativeDate } from "@acuity/shared";

/**
 * Theme Evolution Map client. Owns:
 *  - Window dropdown + snapshot slider (debounced 200ms)
 *  - Force-directed graph (dynamic-loaded react-force-graph-2d)
 *  - Side detail panel for the selected theme
 *  - Loading / empty / sparse / error states
 *
 * The graph is loaded via next/dynamic with ssr:false because
 * react-force-graph-2d touches window + canvas. Without the dynamic
 * import the page would crash at build time.
 */

// Force-graph lazy-loaded. ForceGraph2D's types don't play perfectly
// with dynamic() generics, so we accept the cast in exchange for
// avoiding an SSR-time crash on window/canvas access.
const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((m) => m.default),
  { ssr: false, loading: () => null }
) as unknown as React.ComponentType<Record<string, unknown>>;

// ─── Types mirroring /api/insights/theme-map ──────────────────────────────

type Sentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

type RecentEntry = {
  id: string;
  createdAt: string;
  sentiment: Sentiment;
  excerpt: string;
};

type Theme = {
  id: string;
  name: string;
  mentionCount: number;
  avgSentiment: number; // -1..1
  firstMentionedAt: string;
  lastMentionedAt: string;
  recentEntries: RecentEntry[];
};

type CoOccurrence = {
  theme1Id: string;
  theme2Id: string;
  count: number;
};

type Meta = {
  windowStart: string | null;
  windowEnd: string;
  totalEntries: number;
  snapshotAt: string | null;
};

type ApiResponse = {
  themes: Theme[];
  coOccurrences: CoOccurrence[];
  meta: Meta;
};

type WindowKey = "week" | "month" | "3months" | "6months" | "year" | "all";

const WINDOW_OPTIONS: Array<{ value: WindowKey; label: string }> = [
  { value: "week", label: "Last week" },
  { value: "month", label: "Last month" },
  { value: "3months", label: "Last 3 months" },
  { value: "6months", label: "Last 6 months" },
  { value: "year", label: "Last year" },
  { value: "all", label: "All time" },
];

// At-least-this-many entries before we consider the user "unlocked"
// for the full graph. Matches the life-map unlock threshold at 3 but
// the theme map needs more breadth to look meaningful. Keep this
// number cheap to change — it's the copy you see at the empty state.
const UNLOCK_THRESHOLD_ENTRIES = 10;
const SPARSE_THEME_THRESHOLD = 3;

// Sentiment → fill color for graph nodes + detail pill.
// -1 → red (#E24B4A), 0 → gray (#888), +1 → green (#5DCAA5)
// Linear RGB blend; no d3-interpolate dep needed.
function sentimentColor(score: number): string {
  const clamped = Math.max(-1, Math.min(1, score));
  if (clamped >= 0) {
    // 0 → gray, 1 → green
    const t = clamped;
    const r = Math.round(136 + (93 - 136) * t);
    const g = Math.round(136 + (202 - 136) * t);
    const b = Math.round(136 + (165 - 136) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  // 0 → gray, -1 → red
  const t = -clamped;
  const r = Math.round(136 + (226 - 136) * t);
  const g = Math.round(136 + (75 - 136) * t);
  const b = Math.round(136 + (74 - 136) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function nodeRadius(count: number, maxCount: number): number {
  // Linear scale 10..30 so even a one-mention node is visible while a
  // dominant theme doesn't swallow the canvas. The 30px cap also
  // bounds the canvas hit target — above that, clicks start to feel
  // imprecise.
  if (maxCount <= 1) return 12;
  const t = (count - 1) / (maxCount - 1);
  return 10 + t * 20;
}

function sentimentLabel(score: number): string {
  if (score >= 0.5) return "Mostly positive";
  if (score <= -0.5) return "Mostly challenging";
  if (score > 0.1) return "Leaning positive";
  if (score < -0.1) return "Leaning challenging";
  return "Neutral";
}

function sentimentPillClass(s: Sentiment): string {
  if (s === "POSITIVE")
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300";
  if (s === "NEGATIVE")
    return "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300";
  return "bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-400";
}

// ─── Main component ──────────────────────────────────────────────────────

export function ThemeMapClient() {
  const [windowKey, setWindowKey] = useState<WindowKey>("month");
  // snapshot is a unix ms value bounded by [windowStart, windowEnd].
  // null = at-windowEnd (latest). Debounced before firing the API call.
  const [snapshotMs, setSnapshotMs] = useState<number | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch the user's total entry count once up-front so we know
  // whether to show the locked-state message before the API returns. ──
  useEffect(() => {
    fetch("/api/entries")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.entries) setEntryCount(body.entries.length);
        else setEntryCount(0);
      })
      .catch(() => setEntryCount(0));
  }, []);

  // ── Main fetch: window + snapshot → /api/insights/theme-map ─────
  const fetchMap = useCallback(
    async (win: WindowKey, snap: number | null) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ window: win });
        if (snap !== null) {
          params.set("snapshot", new Date(snap).toISOString());
        }
        const res = await fetch(`/api/insights/theme-map?${params}`);
        if (!res.ok) {
          setError(`Couldn't load — ${res.status}`);
          return;
        }
        const body = (await res.json()) as ApiResponse;
        setData(body);
        // If the currently-selected theme no longer exists in this
        // window, drop the selection so the panel collapses.
        if (
          selectedThemeId &&
          !body.themes.find((t) => t.id === selectedThemeId)
        ) {
          setSelectedThemeId(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
      }
    },
    [selectedThemeId]
  );

  // Fire on window change immediately. Snapshot changes debounce to
  // avoid API spam while the slider is dragging.
  useEffect(() => {
    fetchMap(windowKey, null);
    setSnapshotMs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey]);

  useEffect(() => {
    if (snapshotMs === null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchMap(windowKey, snapshotMs);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotMs]);

  // ── Derived graph data ──────────────────────────────────────────
  const { graphData, maxMentionCount } = useMemo(() => {
    if (!data) return { graphData: { nodes: [], links: [] }, maxMentionCount: 0 };
    const maxCount = data.themes.reduce(
      (m, t) => (t.mentionCount > m ? t.mentionCount : m),
      0
    );
    const nodes = data.themes.map((t) => ({
      id: t.id,
      name: t.name,
      val: nodeRadius(t.mentionCount, maxCount),
      color: sentimentColor(t.avgSentiment),
      mentionCount: t.mentionCount,
      avgSentiment: t.avgSentiment,
    }));
    const links = data.coOccurrences.map((c) => ({
      source: c.theme1Id,
      target: c.theme2Id,
      value: c.count,
    }));
    return { graphData: { nodes, links }, maxMentionCount: maxCount };
  }, [data]);

  const selectedTheme = useMemo(
    () => data?.themes.find((t) => t.id === selectedThemeId) ?? null,
    [data, selectedThemeId]
  );

  // ── Render states ───────────────────────────────────────────────
  // Locked: the user hasn't recorded enough to build a meaningful map.
  if (entryCount !== null && entryCount < UNLOCK_THRESHOLD_ENTRIES) {
    return <LockedState entryCount={entryCount} />;
  }

  const totalThemes = data?.themes.length ?? 0;
  const totalEntriesInWindow = data?.meta.totalEntries ?? 0;
  // Sparse: user is unlocked but the selected window is thin.
  const sparse =
    !loading &&
    data !== null &&
    totalThemes > 0 &&
    totalThemes < SPARSE_THEME_THRESHOLD;
  const empty = !loading && data !== null && totalThemes === 0;

  return (
    <>
      <Header />

      <ThemeMapControls
        windowKey={windowKey}
        onWindowChange={setWindowKey}
        snapshotMs={snapshotMs}
        onSnapshotChange={setSnapshotMs}
        meta={data?.meta ?? null}
        loading={loading}
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}{" "}
          <button
            className="underline ml-2"
            onClick={() => fetchMap(windowKey, snapshotMs)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Graph + side panel layout. On narrow screens, panel collapses
          under the graph. Both live in the same card for visual coupling. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] overflow-hidden">
          {loading && !data ? (
            <GraphSkeleton />
          ) : empty ? (
            <EmptyWindow windowKey={windowKey} />
          ) : sparse ? (
            <SparseState themeCount={totalThemes} />
          ) : (
            <GraphCanvas
              graphData={graphData}
              maxMentionCount={maxMentionCount}
              onNodeClick={(nodeId: string) =>
                setSelectedThemeId((cur) => (cur === nodeId ? null : nodeId))
              }
              selectedThemeId={selectedThemeId}
            />
          )}
          {data && !empty && (
            <div className="border-t border-zinc-100 dark:border-white/10 px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap items-center gap-4">
              <span>
                {totalThemes} theme{totalThemes === 1 ? "" : "s"} · {totalEntriesInWindow}{" "}
                entr{totalEntriesInWindow === 1 ? "y" : "ies"} in window
              </span>
              <Legend />
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          {selectedTheme ? (
            <ThemeDetailPanel
              theme={selectedTheme}
              onClose={() => setSelectedThemeId(null)}
            />
          ) : (
            <IdleDetailPanel />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function Header() {
  return (
    <div className="mb-8">
      <Link
        href="/insights"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition"
      >
        ← Insights
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Theme Map
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        The patterns your daily debriefs have been circling around. Node
        size = how often. Color = how it felt.
      </p>
    </div>
  );
}

function ThemeMapControls({
  windowKey,
  onWindowChange,
  snapshotMs,
  onSnapshotChange,
  meta,
  loading,
}: {
  windowKey: WindowKey;
  onWindowChange: (w: WindowKey) => void;
  snapshotMs: number | null;
  onSnapshotChange: (v: number | null) => void;
  meta: Meta | null;
  loading: boolean;
}) {
  // Slider bounds: windowStart → windowEnd. When "all time" is selected
  // and there's no windowStart, fall back to 1yr ago just so the slider
  // has a range to drag across.
  const minMs = meta?.windowStart
    ? new Date(meta.windowStart).getTime()
    : Date.now() - 365 * 24 * 60 * 60 * 1000;
  const maxMs = meta?.windowEnd
    ? new Date(meta.windowEnd).getTime()
    : Date.now();
  const value = snapshotMs ?? maxMs;

  return (
    <section className="mb-6 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          Window
        </label>
        <select
          value={windowKey}
          onChange={(e) => onWindowChange(e.target.value as WindowKey)}
          disabled={loading && !meta}
          className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500"
        >
          {WINDOW_OPTIONS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onSnapshotChange(null)}
          disabled={snapshotMs === null}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            snapshotMs === null
              ? "bg-zinc-100 dark:bg-white/5 text-zinc-400 dark:text-zinc-500 cursor-default"
              : "bg-violet-600 text-white hover:bg-violet-500"
          }`}
        >
          Today
        </button>
      </div>

      <div className="mt-4">
        <label className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">
          <span>
            Showing through{" "}
            <strong className="text-zinc-700 dark:text-zinc-200">
              {new Date(value).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </strong>
          </span>
          {meta?.windowStart && (
            <span className="text-zinc-400 dark:text-zinc-500">
              from {new Date(meta.windowStart).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </label>
        <input
          type="range"
          min={minMs}
          max={maxMs}
          step={24 * 60 * 60 * 1000}
          value={value}
          onChange={(e) => onSnapshotChange(Number(e.target.value))}
          className="w-full accent-violet-500"
          disabled={maxMs <= minMs}
        />
      </div>
    </section>
  );
}

function GraphCanvas({
  graphData,
  maxMentionCount,
  onNodeClick,
  selectedThemeId,
}: {
  graphData: { nodes: Array<Record<string, unknown>>; links: Array<Record<string, unknown>> };
  maxMentionCount: number;
  onNodeClick: (id: string) => void;
  selectedThemeId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 500 });

  // Measure once + on resize so the graph fits the container. The
  // force-graph lib sizes to an explicit width/height prop; it does
  // NOT auto-fit to its parent, so we feed it the measured values.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const { clientWidth } = el;
      // Height fixed at 500 — tall enough that the canvas is usable
      // without pushing the side panel off-screen on laptops.
      setSize({ width: Math.max(320, clientWidth), height: 500 });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* react-force-graph-2d props are loosely typed via dynamic() cast;
          using Record<string, unknown> in the wrapper type above keeps
          this block readable without a forest of `as any`. */}
      <ForceGraph2D
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        nodeVal={(n: { val: number }) => n.val}
        nodeColor={(n: { color: string; id: string }) =>
          n.id === selectedThemeId ? "#7C3AED" : n.color
        }
        nodeLabel={(n: { name: string; mentionCount: number }) =>
          `${n.name} · ${n.mentionCount} mention${n.mentionCount === 1 ? "" : "s"}`
        }
        nodeCanvasObjectMode={() => "after"}
        nodeCanvasObject={(
          node: { x?: number; y?: number; name: string; val: number },
          ctx: CanvasRenderingContext2D,
          globalScale: number
        ) => {
          // Label below the node. Only draw when zoomed in enough that
          // labels don't overlap each other to mush.
          if (typeof node.x !== "number" || typeof node.y !== "number") return;
          if (globalScale < 0.6) return;
          const fontSize = 10 / globalScale;
          ctx.font = `${fontSize}px -apple-system, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = "rgba(161, 161, 170, 0.9)";
          ctx.fillText(node.name, node.x, node.y + node.val / globalScale + 2);
        }}
        linkColor={(l: { value: number }) => {
          // Edge opacity grows with co-occurrence count. Gray-base so
          // the sentiment-colored nodes stay visually dominant.
          const maxValue = Math.max(
            1,
            ...graphData.links.map((x) => (x as { value?: number }).value ?? 1)
          );
          const t = Math.min(1, (l.value ?? 1) / maxValue);
          const opacity = 0.15 + t * 0.45;
          return `rgba(120, 120, 130, ${opacity})`;
        }}
        linkWidth={(l: { value: number }) => {
          const maxValue = Math.max(
            1,
            ...graphData.links.map((x) => (x as { value?: number }).value ?? 1)
          );
          const t = Math.min(1, (l.value ?? 1) / maxValue);
          return 1 + t * 5;
        }}
        onNodeClick={(node: { id: string }) => onNodeClick(node.id)}
        cooldownTicks={100}
        enableNodeDrag={true}
        warmupTicks={50}
      />
      {maxMentionCount > 0 && (
        <div className="absolute top-3 left-3 text-[10px] text-zinc-400 dark:text-zinc-500 pointer-events-none">
          Drag nodes · scroll to zoom · tap to open
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-full bg-[rgb(226,75,74)]" />
        challenging
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-full bg-[rgb(136,136,136)]" />
        neutral
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-full bg-[rgb(93,202,165)]" />
        positive
      </span>
    </div>
  );
}

function ThemeDetailPanel({
  theme,
  onClose,
}: {
  theme: Theme;
  onClose: () => void;
}) {
  const sentimentBarFill = Math.min(
    100,
    Math.max(0, (theme.avgSentiment + 1) * 50)
  );

  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-5 sticky top-20 max-h-[75vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 capitalize">
            {theme.name}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            {theme.mentionCount} mention{theme.mentionCount === 1 ? "" : "s"} ·{" "}
            {sentimentLabel(theme.avgSentiment)}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 dark:text-zinc-500"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Sentiment bar — visual on the -1..1 axis */}
      <div className="mb-4">
        <div className="relative h-2 rounded-full bg-zinc-100 dark:bg-white/5 overflow-hidden">
          <div
            className="absolute top-0 h-full w-1 bg-zinc-900 dark:bg-zinc-50 rounded-full"
            style={{ left: `calc(${sentimentBarFill}% - 2px)` }}
          />
          <div
            className="absolute top-0 h-full rounded-full"
            style={{
              left: 0,
              right: 0,
              background:
                "linear-gradient(to right, rgb(226,75,74) 0%, rgb(136,136,136) 50%, rgb(93,202,165) 100%)",
              opacity: 0.25,
            }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
          <span>challenging</span>
          <span>neutral</span>
          <span>positive</span>
        </div>
      </div>

      {/* Timeline spans */}
      <dl className="mb-5 text-xs space-y-1">
        <div className="flex justify-between">
          <dt className="text-zinc-500 dark:text-zinc-400">First mentioned</dt>
          <dd className="text-zinc-800 dark:text-zinc-100">
            {formatRelativeDate(theme.firstMentionedAt)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500 dark:text-zinc-400">Last mentioned</dt>
          <dd className="text-zinc-800 dark:text-zinc-100">
            {formatRelativeDate(theme.lastMentionedAt)}
          </dd>
        </div>
      </dl>

      {/* Recent entries */}
      <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
        Recent entries
      </h3>
      {theme.recentEntries.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
          No entries in this window.
        </p>
      ) : (
        <ul className="space-y-2">
          {theme.recentEntries.map((e) => (
            <li key={e.id}>
              <Link
                href={`/entry/${e.id}`}
                className="block rounded-lg border border-zinc-200 dark:border-white/10 px-3 py-2 hover:border-violet-300 dark:hover:border-violet-700/40 transition"
              >
                <div className="flex items-center gap-2 text-xs mb-1">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {formatRelativeDate(e.createdAt)}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${sentimentPillClass(e.sentiment)}`}
                  >
                    {e.sentiment.toLowerCase()}
                  </span>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-200 line-clamp-3">
                  {e.excerpt}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function IdleDetailPanel() {
  return (
    <section className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        Tap a theme
      </p>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Selecting a node on the map shows when the theme first came up,
        the sentiment it's carried, and the last few entries that
        mentioned it.
      </p>
    </section>
  );
}

function LockedState({ entryCount }: { entryCount: number }) {
  const remaining = Math.max(0, UNLOCK_THRESHOLD_ENTRIES - entryCount);
  return (
    <>
      <Header />
      <section className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-20 text-center">
        <div className="text-4xl mb-4">🗺️</div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Your theme map unlocks after about 10 entries.
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
          {remaining > 0
            ? `${remaining} more recording${remaining === 1 ? "" : "s"} and the patterns will start to connect.`
            : "Keep journaling — patterns will emerge."}
        </p>
        <Link
          href="/home"
          className="inline-block mt-5 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Record today
        </Link>
      </section>
    </>
  );
}

function SparseState({ themeCount }: { themeCount: number }) {
  return (
    <div className="py-24 text-center px-6">
      <div className="text-3xl mb-3">🌱</div>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        Only {themeCount} theme{themeCount === 1 ? "" : "s"} so far in this window.
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
        As you record more, patterns will connect. Keep going.
      </p>
    </div>
  );
}

function EmptyWindow({ windowKey }: { windowKey: WindowKey }) {
  const label = WINDOW_OPTIONS.find((w) => w.value === windowKey)?.label ?? "this window";
  return (
    <div className="py-24 text-center px-6">
      <div className="text-3xl mb-3">—</div>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        No themes mentioned in {label.toLowerCase()}.
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Try a wider window.
      </p>
    </div>
  );
}

function GraphSkeleton() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500" />
    </div>
  );
}
