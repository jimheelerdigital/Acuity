import { Ionicons } from "@expo/vector-icons";
import * as d3Force from "d3-force";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";

import { formatRelativeDate } from "@acuity/shared";

import { api } from "@/lib/api";

/**
 * Mobile Theme Evolution Map. Parity with the web force-graph via a
 * static d3-force simulation run client-side — the simulation runs
 * synchronously to a fixed iteration count, then the node + edge
 * positions are rendered as react-native-svg primitives.
 *
 * No continuous physics + no drag in v1. Pan + pinch-zoom + double-
 * tap-reset land via PanResponder (built-in to React Native) rather
 * than react-native-gesture-handler, to avoid an EAS rebuild right
 * before beta. The transforms mutate the SVG viewBox at render time
 * so there's no JS-thread layout thrash during gesture.
 *
 * Strategy-A choice (from the sprint spec): went with the d3-force
 * approach rather than Strategy B (ranked list). Rationale: d3-force
 * is pure-JS, no native rebuild. Quality of experience is much closer
 * to the web graph. See TOP_OF_MORNING report.
 */

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
  avgSentiment: number;
  firstMentionedAt: string;
  lastMentionedAt: string;
  recentEntries: RecentEntry[];
};

type CoOccurrence = {
  theme1Id: string;
  theme2Id: string;
  count: number;
};

type ApiResponse = {
  themes: Theme[];
  coOccurrences: CoOccurrence[];
  meta: {
    windowStart: string | null;
    windowEnd: string;
    totalEntries: number;
    snapshotAt: string | null;
  };
};

type WindowKey = "week" | "month" | "3months" | "6months" | "year" | "all";

const WINDOW_LABELS: Record<WindowKey, string> = {
  week: "Last week",
  month: "Last month",
  "3months": "Last 3 months",
  "6months": "Last 6 months",
  year: "Last year",
  all: "All time",
};

const UNLOCK_THRESHOLD = 10;
const SPARSE_THRESHOLD = 3;

function sentimentColor(score: number): string {
  const clamped = Math.max(-1, Math.min(1, score));
  if (clamped >= 0) {
    const t = clamped;
    const r = Math.round(136 + (93 - 136) * t);
    const g = Math.round(136 + (202 - 136) * t);
    const b = Math.round(136 + (165 - 136) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = -clamped;
  const r = Math.round(136 + (226 - 136) * t);
  const g = Math.round(136 + (75 - 136) * t);
  const b = Math.round(136 + (74 - 136) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function nodeRadius(count: number, maxCount: number): number {
  if (maxCount <= 1) return 8;
  return 6 + ((count - 1) / (maxCount - 1)) * 14;
}

// Simulation node type — d3 attaches x/y/vx/vy to each object during
// simulation.tick(). We seed with random positions in a small box so
// the first iteration has something to react to.
type SimNode = {
  id: string;
  name: string;
  r: number;
  color: string;
  mentionCount: number;
  avgSentiment: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

type SimLink = {
  source: string;
  target: string;
  count: number;
};

export default function ThemeMapScreen() {
  const router = useRouter();
  const [windowKey, setWindowKey] = useState<WindowKey>("month");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Canvas dims. Mobile canvas is narrower than desktop; keeping the
  // square makes the force layout consistent across devices.
  const width = 340;
  const height = 340;

  // ── Pan + pinch-zoom + double-tap reset ──────────────────────────
  //
  // Hand-rolled via PanResponder so we don't pull in
  // react-native-gesture-handler (and the EAS rebuild) before beta.
  // The SVG viewBox is the transform target — we recompute it from
  // `scale` + `translate` each render instead of animating nodes
  // individually. Tap-to-select still works because we only capture
  // the responder when movement crosses TAP_SLOP; single quick touches
  // fall through to the SVG <Circle onPress>.
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 4;
  const TAP_SLOP = 6; // px before a touch counts as a drag
  const DOUBLE_TAP_MS = 280;

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  const gestureRef = useRef({
    startScale: 1,
    startTranslate: { x: 0, y: 0 },
    startDist: 0,
    lastTapAt: 0,
  });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
          return (
            Math.abs(g.dx) > TAP_SLOP ||
            Math.abs(g.dy) > TAP_SLOP ||
            g.numberActiveTouches >= 2
          );
        },
        onPanResponderGrant: (evt) => {
          gestureRef.current.startScale = scale;
          gestureRef.current.startTranslate = { ...translate };
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            gestureRef.current.startDist = Math.hypot(dx, dy) || 1;
          }

          const now = Date.now();
          if (
            now - gestureRef.current.lastTapAt < DOUBLE_TAP_MS &&
            touches.length === 1
          ) {
            setScale(1);
            setTranslate({ x: 0, y: 0 });
            gestureRef.current.lastTapAt = 0;
          } else {
            gestureRef.current.lastTapAt = now;
          }
        },
        onPanResponderMove: (evt, g) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            const dx = touches[0].pageX - touches[1].pageX;
            const dy = touches[0].pageY - touches[1].pageY;
            const dist = Math.hypot(dx, dy) || 1;
            const next = Math.max(
              MIN_SCALE,
              Math.min(
                MAX_SCALE,
                gestureRef.current.startScale *
                  (dist / gestureRef.current.startDist)
              )
            );
            setScale(next);
          } else {
            setTranslate({
              x: gestureRef.current.startTranslate.x + g.dx,
              y: gestureRef.current.startTranslate.y + g.dy,
            });
          }
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [scale, translate]
  );

  // Transform the static [0, 0, width, height] viewBox by our pan+zoom
  // state. Translation is in screen px and gets converted to viewBox
  // units by the scale factor. Positive tx drags content right.
  const viewBoxX = -translate.x / scale;
  const viewBoxY = -translate.y / scale;
  const viewBoxW = width / scale;
  const viewBoxH = height / scale;

  useEffect(() => {
    api
      .get<{ entries: Array<{ id: string }> }>("/api/entries")
      .then((r) => setEntryCount(r.entries?.length ?? 0))
      .catch(() => setEntryCount(0));
  }, []);

  const load = useCallback(async (w: WindowKey) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ApiResponse>(
        `/api/insights/theme-map?window=${w}`
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(windowKey);
  }, [load, windowKey]);

  // ── Run the d3-force sim to produce laid-out node positions ─────
  // We run it synchronously to a fixed iteration count so the UI
  // isn't jittering. Re-runs when data changes; tap selection doesn't
  // trigger a re-layout.
  const { layoutNodes, layoutLinks, selectedTheme } = useMemo(() => {
    if (!data || data.themes.length === 0) {
      return { layoutNodes: [], layoutLinks: [], selectedTheme: null };
    }

    const maxCount = data.themes.reduce(
      (m, t) => (t.mentionCount > m ? t.mentionCount : m),
      0
    );

    const nodes: SimNode[] = data.themes.map((t, i) => ({
      id: t.id,
      name: t.name,
      r: nodeRadius(t.mentionCount, maxCount),
      color: sentimentColor(t.avgSentiment),
      mentionCount: t.mentionCount,
      avgSentiment: t.avgSentiment,
      // Seed positions around the center so the first tick has mass.
      // Slight jitter from node index keeps them from overlapping
      // perfectly, which would deadlock the collision force.
      x: width / 2 + Math.cos((i / data.themes.length) * Math.PI * 2) * 30,
      y: height / 2 + Math.sin((i / data.themes.length) * Math.PI * 2) * 30,
    }));

    const links: SimLink[] = data.coOccurrences.map((c) => ({
      source: c.theme1Id,
      target: c.theme2Id,
      count: c.count,
    }));

    // d3-force mutates node objects in place. Clone references into
    // d3's expected shape (source/target can be strings; the lib
    // resolves them to nodes internally via forceLink.id(…)).
    const sim = d3Force
      .forceSimulation(nodes as d3Force.SimulationNodeDatum[])
      .force(
        "link",
        d3Force
          .forceLink(links as unknown as d3Force.SimulationLinkDatum<d3Force.SimulationNodeDatum>[])
          .id((n: d3Force.SimulationNodeDatum) => (n as unknown as SimNode).id)
          .distance(60)
          .strength(0.3)
      )
      .force("charge", d3Force.forceManyBody().strength(-120))
      .force(
        "collide",
        d3Force.forceCollide<SimNode>().radius((n) => n.r + 4)
      )
      .force("center", d3Force.forceCenter(width / 2, height / 2))
      .stop();

    // Run the sim to settle. Empirically 200 ticks converges for
    // <50 nodes; more hurts battery without visible improvement.
    for (let i = 0; i < 200; i++) sim.tick();

    return {
      layoutNodes: nodes,
      layoutLinks: links,
      selectedTheme:
        data.themes.find((t) => t.id === selectedId) ?? null,
    };
  }, [data, selectedId]);

  // ── Early-out states ────────────────────────────────────────────
  if (entryCount !== null && entryCount < UNLOCK_THRESHOLD) {
    return (
      <SafeAreaView
        edges={["top"]}
        className="flex-1 bg-white dark:bg-[#0B0B12]"
      >
        <Header onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-5xl mb-4">🗺️</Text>
          <Text className="text-center text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Unlocks after about 10 entries.
          </Text>
          <Text className="mt-2 text-center text-sm text-zinc-500 dark:text-zinc-400 max-w-xs">
            {`${Math.max(0, UNLOCK_THRESHOLD - entryCount)} more recording${
              UNLOCK_THRESHOLD - entryCount === 1 ? "" : "s"
            } and the patterns will start to connect.`}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalThemes = data?.themes.length ?? 0;
  const sparse =
    !loading && data !== null && totalThemes > 0 && totalThemes < SPARSE_THRESHOLD;
  const empty = !loading && data !== null && totalThemes === 0;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-white dark:bg-[#0B0B12]">
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">
          Theme Map
        </Text>
        <Text className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
          Size = how often. Color = how it felt.
        </Text>

        {/* Window chips — avoids a native picker and reads nicely at mobile width */}
        <View className="flex-row flex-wrap gap-2 mb-5">
          {(Object.keys(WINDOW_LABELS) as WindowKey[]).map((w) => {
            const active = windowKey === w;
            return (
              <Pressable
                key={w}
                onPress={() => setWindowKey(w)}
                className={`rounded-full border px-3 py-1.5 ${
                  active
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                    : "border-zinc-200 dark:border-white/10"
                }`}
              >
                <Text
                  className={`text-xs ${
                    active
                      ? "text-violet-700 dark:text-violet-300 font-semibold"
                      : "text-zinc-600 dark:text-zinc-300"
                  }`}
                >
                  {WINDOW_LABELS[w]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error && (
          <View className="mb-4 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2">
            <Text className="text-sm text-red-700 dark:text-red-300">
              {error}
            </Text>
            <Pressable
              onPress={() => load(windowKey)}
              className="mt-1 self-start"
            >
              <Text className="text-xs font-semibold text-red-700 dark:text-red-300 underline">
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-3 items-center">
          {loading && !data ? (
            <View className="py-24">
              <ActivityIndicator color="#7C3AED" />
            </View>
          ) : empty ? (
            <View className="py-16 items-center">
              <Text className="text-2xl mb-2">—</Text>
              <Text className="text-sm text-zinc-700 dark:text-zinc-200">
                No themes in {WINDOW_LABELS[windowKey].toLowerCase()}.
              </Text>
              <Text className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                Try a wider window.
              </Text>
            </View>
          ) : sparse ? (
            <View className="py-16 items-center">
              <Text className="text-2xl mb-2">🌱</Text>
              <Text className="text-center text-sm text-zinc-700 dark:text-zinc-200">
                Only {totalThemes} theme{totalThemes === 1 ? "" : "s"} so far.
              </Text>
              <Text className="mt-1 text-center text-xs text-zinc-400 dark:text-zinc-500">
                As you record more, patterns will connect.
              </Text>
            </View>
          ) : (
            <View {...panResponder.panHandlers}>
            <Svg
              width={width}
              height={height}
              viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}`}
            >
              {/* Edges first so nodes render on top */}
              {layoutLinks.map((l, i) => {
                const src = layoutNodes.find(
                  (n) => n.id === (l.source as unknown as string)
                ) ?? (l.source as unknown as SimNode);
                const tgt = layoutNodes.find(
                  (n) => n.id === (l.target as unknown as string)
                ) ?? (l.target as unknown as SimNode);
                if (
                  typeof src?.x !== "number" ||
                  typeof src?.y !== "number" ||
                  typeof tgt?.x !== "number" ||
                  typeof tgt?.y !== "number"
                )
                  return null;
                const maxCount = Math.max(1, ...layoutLinks.map((x) => x.count));
                const t = Math.min(1, l.count / maxCount);
                return (
                  <Line
                    key={`edge-${i}`}
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke="#78787A"
                    strokeOpacity={0.15 + t * 0.45}
                    strokeWidth={1 + t * 3}
                  />
                );
              })}

              {/* Nodes */}
              {layoutNodes.map((n) => {
                if (typeof n.x !== "number" || typeof n.y !== "number") return null;
                const isSelected = selectedId === n.id;
                return (
                  <G
                    key={`node-${n.id}`}
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    color={isSelected ? "#7C3AED" : n.color}
                    label={n.name}
                    onPress={() =>
                      setSelectedId((cur) => (cur === n.id ? null : n.id))
                    }
                  />
                );
              })}
            </Svg>
            </View>
          )}
          {data && !empty && !sparse && (
            <View className="mt-3 self-stretch flex-row justify-between items-center">
              <Text className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {totalThemes} theme{totalThemes === 1 ? "" : "s"} ·{" "}
                {data.meta.totalEntries} entries
                {scale !== 1 || translate.x !== 0 || translate.y !== 0 ? (
                  <Text> · double-tap to reset</Text>
                ) : (
                  <Text> · pinch to zoom</Text>
                )}
              </Text>
              <View className="flex-row items-center gap-2">
                <LegendDot color="rgb(226,75,74)" label="challenging" />
                <LegendDot color="rgb(136,136,136)" label="neutral" />
                <LegendDot color="rgb(93,202,165)" label="positive" />
              </View>
            </View>
          )}
        </View>

        {/* Selected theme detail — rendered in-page under the graph
            because a bottom-sheet on mobile is overkill for this size. */}
        {selectedTheme && (
          <DetailCard theme={selectedTheme} onClose={() => setSelectedId(null)} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Tiny sub-components ──────────────────────────────────────────

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View className="flex-row items-center gap-2 px-4 pt-3 pb-1">
      <Pressable onPress={onBack} hitSlop={10} className="p-1">
        <Ionicons name="chevron-back" size={22} color="#A1A1AA" />
      </Pressable>
      <Text className="text-sm text-zinc-500 dark:text-zinc-400">Insights</Text>
    </View>
  );
}

/**
 * SVG node with tappable Circle + label. Wrapped in an inline
 * component so we can pass `onPress` cleanly — react-native-svg's
 * Group (G) accepts onPress but mixing with Text + Circle in a loop
 * was getting noisy.
 */
function G({
  cx,
  cy,
  r,
  color,
  label,
  onPress,
}: {
  cx: number;
  cy: number;
  r: number;
  color: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <>
      <Circle
        cx={cx}
        cy={cy}
        r={r + 8}
        fill="transparent"
        onPress={onPress}
      />
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        fill={color}
        stroke="white"
        strokeWidth={1.5}
        onPress={onPress}
      />
      <SvgText
        x={cx}
        y={cy + r + 10}
        textAnchor="middle"
        fontSize={9}
        fill="#A1A1AA"
        onPress={onPress}
      >
        {label}
      </SvgText>
    </>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
      <Text className="text-[10px] text-zinc-400 dark:text-zinc-500">{label}</Text>
    </View>
  );
}

function DetailCard({
  theme,
  onClose,
}: {
  theme: Theme;
  onClose: () => void;
}) {
  const router = useRouter();
  const fill = Math.min(100, Math.max(0, (theme.avgSentiment + 1) * 50));
  return (
    <View className="mt-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4">
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 capitalize">
            {theme.name}
          </Text>
          <Text className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            {theme.mentionCount} mention{theme.mentionCount === 1 ? "" : "s"}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={8} className="p-1">
          <Ionicons name="close" size={18} color="#71717A" />
        </Pressable>
      </View>

      {/* Sentiment bar */}
      <View className="mb-3">
        <View className="h-1.5 rounded-full overflow-hidden relative">
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              opacity: 0.25,
              backgroundColor: "#888",
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${fill}%`,
              width: 3,
              backgroundColor: "#FAFAFA",
            }}
          />
        </View>
        <View className="mt-1 flex-row justify-between">
          <Text className="text-[10px] text-zinc-500 dark:text-zinc-400">challenging</Text>
          <Text className="text-[10px] text-zinc-500 dark:text-zinc-400">positive</Text>
        </View>
      </View>

      <Text className="text-xs text-zinc-500 dark:text-zinc-400">
        First mentioned {formatRelativeDate(theme.firstMentionedAt)} ·{" "}
        last {formatRelativeDate(theme.lastMentionedAt)}
      </Text>

      {theme.recentEntries.length > 0 && (
        <View className="mt-3">
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
            Recent entries
          </Text>
          <View className="gap-2">
            {theme.recentEntries.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => router.push(`/entry/${e.id}`)}
                className="rounded-lg border border-zinc-200 dark:border-white/10 px-3 py-2"
              >
                <View className="flex-row items-center gap-2 mb-1">
                  <Text className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    {formatRelativeDate(e.createdAt)}
                  </Text>
                  <View
                    className="rounded-full px-1.5 py-0.5"
                    style={{
                      backgroundColor:
                        e.sentiment === "POSITIVE"
                          ? "rgba(16,185,129,0.2)"
                          : e.sentiment === "NEGATIVE"
                            ? "rgba(239,68,68,0.2)"
                            : "rgba(161,161,170,0.2)",
                    }}
                  >
                    <Text
                      className="text-[9px] font-semibold"
                      style={{
                        color:
                          e.sentiment === "POSITIVE"
                            ? "#10B981"
                            : e.sentiment === "NEGATIVE"
                              ? "#EF4444"
                              : "#A1A1AA",
                      }}
                    >
                      {e.sentiment.toLowerCase()}
                    </Text>
                  </View>
                </View>
                <Text
                  className="text-sm text-zinc-700 dark:text-zinc-200"
                  numberOfLines={3}
                >
                  {e.excerpt}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
