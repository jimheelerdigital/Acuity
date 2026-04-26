import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import { CATEGORY, MOOD, TEXT, type CategoryToken } from "./theme-tokens";

/**
 * Mobile mirror of ThemeMoodWaveRow. Stacked layout (top: rank +
 * name + count + chevron; bottom: full-width wave + trend caption).
 * Same per-entry mood-driven path math as web.
 */

export type WaveTheme = {
  id: string;
  name: string;
  category: CategoryToken;
  count: number;
  meanMood: number;
  lastEntryAt: string;
  trend: { priorPeriodCount: number; ratio: number | null };
  entries: { id: string; timestamp: string; mood: number }[];
  coOccurrences: { themeName: string; count: number }[];
};

const VB_W = 600;
const VB_H = 120;
const BASELINE_Y = 60;

export function ThemeMoodWaveRow({
  rank,
  theme,
  maxCountInPeriod,
  isFirst,
  onTap,
}: {
  rank: number;
  theme: WaveTheme;
  maxCountInPeriod: number;
  isFirst: boolean;
  onTap?: (id: string) => void;
}) {
  const c = CATEGORY[theme.category];
  const widthPct = Math.max(
    8,
    Math.min(100, (theme.count / Math.max(1, maxCountInPeriod)) * 100)
  );
  const isFaded = isFadedTheme(theme.lastEntryAt);
  const trendCaption = pickTrendCaption(theme);
  const moodColor = colorForMean(theme.meanMood);

  return (
    <Pressable
      onPress={onTap ? () => onTap(theme.id) : undefined}
      style={({ pressed }) => ({
        paddingVertical: 22,
        paddingHorizontal: 18,
        backgroundColor: pressed ? "rgba(255,255,255,0.03)" : "transparent",
        borderTopWidth: isFirst ? 0 : 0.5,
        borderTopColor: "rgba(255,255,255,0.04)",
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: "rgba(168,168,180,0.55)",
            letterSpacing: 1,
            width: 28,
          }}
        >
          {String(rank).padStart(2, "0")}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 17,
            fontWeight: "500",
            color: TEXT.primary,
            letterSpacing: -0.1,
          }}
        >
          {capitalize(theme.name)}
        </Text>
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: "500",
              letterSpacing: -0.5,
              color: TEXT.primary,
              textShadowColor: `${c.solid}66`,
              textShadowRadius: 10,
            }}
          >
            {theme.count}
          </Text>
          <Text style={{ fontSize: 14, color: moodColor, marginTop: 2 }}>
            mood {theme.meanMood.toFixed(1)}
          </Text>
        </View>
        <ChevronRight size={16} color="rgba(168,168,180,0.5)" />
      </View>
      <View style={{ marginTop: 8, height: VB_H, position: "relative" }}>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: BASELINE_Y - 0.5,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: "rgba(255,255,255,0.06)",
          }}
        />
        <View
          style={{
            width: `${widthPct}%`,
            height: "100%",
            opacity: isFaded ? 0.5 : 1,
          }}
        >
          <WaveSVG entries={theme.entries} category={theme.category} hideTip={isFaded} />
        </View>
      </View>
      <Text
        numberOfLines={1}
        style={{ marginTop: 6, fontSize: 15, color: trendCaption.color }}
      >
        {trendCaption.text}
      </Text>
    </Pressable>
  );
}

function WaveSVG({
  entries,
  category,
  hideTip,
}: {
  entries: WaveTheme["entries"];
  category: CategoryToken;
  hideTip: boolean;
}) {
  const c = CATEGORY[category];
  const id = `${category}-${entries.length}-${Math.random().toString(36).slice(2, 6)}`;
  const points = entries.map((e, i) => {
    const x = entries.length === 1 ? VB_W / 2 : (i / (entries.length - 1)) * VB_W;
    const delta = e.mood - 5;
    const direction = delta >= 0 ? -1 : 1;
    const magnitude = Math.min(50, Math.abs(delta) * 28);
    const y = Math.max(8, Math.min(112, 60 + direction * magnitude));
    return { x, y, mood: e.mood };
  });
  if (points.length === 0) {
    return (
      <Svg width="100%" height={VB_H} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <Line x1={0} y1={BASELINE_Y} x2={VB_W} y2={BASELINE_Y} stroke={c.solid} strokeOpacity={0.35} strokeWidth={1} />
      </Svg>
    );
  }
  const positive = points.filter((p) => p.mood >= 5);
  const negative = points.filter((p) => p.mood < 5);
  const positivePath = buildHalfPath(positive, VB_W);
  const negativePath = buildHalfPath(negative, VB_W);
  const lastPoint = points[points.length - 1];

  // Center the curve in the lane (see web for full rationale).
  const ys = points.map((p) => p.y);
  const yMin = Math.min(...ys, BASELINE_Y);
  const yMax = Math.max(...ys, BASELINE_Y);
  const dy = BASELINE_Y - (yMin + yMax) / 2;

  return (
    <Svg width="100%" height={VB_H} viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none">
      <Defs>
        <SvgLinearGradient id={`top-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={MOOD.positive} stopOpacity={0.6} />
          <Stop offset="100%" stopColor={c.solid} stopOpacity={0.1} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`top-stroke-${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={MOOD.positiveLight} />
          <Stop offset="100%" stopColor={c.solid} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`bot-fill-${id}`} x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0%" stopColor={MOOD.negative} stopOpacity={0.6} />
          <Stop offset="100%" stopColor={c.solid} stopOpacity={0.1} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`bot-stroke-${id}`} x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0%" stopColor={MOOD.negativeLight} />
          <Stop offset="100%" stopColor={c.solid} />
        </SvgLinearGradient>
        <Filter id={`glow-${id}`} x="-10%" y="-50%" width="120%" height="200%">
          <FeGaussianBlur stdDeviation="5" />
        </Filter>
      </Defs>
      <G transform={`translate(0, ${dy})`}>
      <Line x1={0} y1={BASELINE_Y} x2={VB_W} y2={BASELINE_Y} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
      {positivePath && (
        <>
          <Path d={positivePath.area} fill={`url(#top-fill-${id})`} opacity={0.6} filter={`url(#glow-${id})`} />
          <Path d={positivePath.area} fill={`url(#top-fill-${id})`} />
          <Path d={positivePath.line} fill="none" stroke={`url(#top-stroke-${id})`} strokeWidth={1.4} strokeLinecap="round" />
        </>
      )}
      {negativePath && (
        <>
          <Path d={negativePath.area} fill={`url(#bot-fill-${id})`} opacity={0.6} filter={`url(#glow-${id})`} />
          <Path d={negativePath.area} fill={`url(#bot-fill-${id})`} />
          <Path d={negativePath.line} fill="none" stroke={`url(#bot-stroke-${id})`} strokeWidth={1.4} strokeLinecap="round" />
        </>
      )}
      {!hideTip && (
        <>
          <Circle cx={lastPoint.x} cy={lastPoint.y} r={5} fill={lastPoint.mood >= 5 ? MOOD.positive : MOOD.negative} opacity={0.3} />
          <Circle cx={lastPoint.x} cy={lastPoint.y} r={2.5} fill={lastPoint.mood >= 5 ? MOOD.positiveLight : MOOD.negativeLight} />
        </>
      )}
      </G>
    </Svg>
  );
}

function buildHalfPath(
  pts: { x: number; y: number; mood: number }[],
  width: number
): { line: string; area: string } | null {
  if (pts.length === 0) return null;
  const anchored = [
    { x: 0, y: BASELINE_Y },
    ...pts,
    { x: width, y: BASELINE_Y },
  ];
  let line = `M ${anchored[0].x} ${anchored[0].y}`;
  for (let i = 0; i < anchored.length - 1; i++) {
    const p0 = anchored[Math.max(0, i - 1)];
    const p1 = anchored[i];
    const p2 = anchored[i + 1];
    const p3 = anchored[Math.min(anchored.length - 1, i + 2)];
    const t = 0.5;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * t * 2;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * t * 2;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * t * 2;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * t * 2;
    line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  const area = `${line} L ${width} ${BASELINE_Y} L 0 ${BASELINE_Y} Z`;
  return { line, area };
}

function isFadedTheme(lastEntryAt: string): boolean {
  const days = (Date.now() - new Date(lastEntryAt).getTime()) / 86_400_000;
  return days > 14;
}

function pickTrendCaption(theme: WaveTheme): { text: string; color: string } {
  if (isFadedTheme(theme.lastEntryAt)) {
    const date = new Date(theme.lastEntryAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { text: `↓ fading · last seen ${date}`, color: "rgba(168,168,180,0.75)" };
  }
  const topCo = theme.coOccurrences[0];
  if (topCo && topCo.count > theme.count * 0.5) {
    return { text: `paired with ${topCo.themeName}`, color: "rgba(168,168,180,0.75)" };
  }
  if (theme.entries.length >= 3) {
    if (theme.meanMood > 7.5) return { text: "consistently positive · highest mood", color: "#34D399" };
    if (theme.meanMood < 5) {
      const negCount = theme.entries.filter((e) => e.mood < 5).length;
      return { text: `consistently low mood · ${negCount} of ${theme.entries.length} negative`, color: "#FB7185" };
    }
  }
  if (theme.trend.ratio !== null && theme.trend.ratio >= 1.5 && theme.trend.priorPeriodCount > 0) {
    return { text: `↑ ${Math.round(theme.trend.ratio)}× this week vs last`, color: "#FCA85A" };
  }
  return { text: "balanced · reflective tone", color: "rgba(168,168,180,0.75)" };
}

function colorForMean(mean: number): string {
  if (mean < 5) return "#FB7185";
  if (mean > 7.5) return "#34D399";
  return "rgba(168,168,180,0.6)";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
