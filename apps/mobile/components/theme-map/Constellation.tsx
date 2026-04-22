import { Fragment } from "react";
import { Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  RadialGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";

/**
 * Mobile constellation — hero + up to 5 planets in their final landed
 * positions. This ship is STATIC: no orbital entrance animation yet.
 *
 * TODO (next session): reanimated 3 worklet-driven orbital entrance
 * matching the web keyframes (spec STEP 3). Plan:
 *   1. Shared value `progress` 0→1 per planet with withTiming + the
 *      Easing.bezier(0.33, 0, 0.15, 1) curve.
 *   2. Stagger delays: 0.6s / 1.0s / 1.4s / 1.8s / 2.2s (withDelay).
 *   3. useDerivedValue to compute {angle, radius} from progress, then
 *      cx = 175 + radius*cos(angle*PI/180), cy = 140 + radius*sin(...).
 *   4. useAnimatedProps on Circle cx/cy. react-native-svg exports
 *      Animated primitives for this.
 *   5. Label stagger (4.0 / 4.6 / 5.2 / 5.8 / 5.8), line stroke-dash
 *      draw (6.2/6.4/6.6/6.8), legend fade at 7.0s — all withDelay+
 *      withTiming sequences.
 *   6. AccessibilityInfo.isReduceMotionEnabled() skip branch.
 *   7. useFocusEffect cancelAnimation on screen blur.
 * Reference: apps/web/src/components/theme-map/Constellation.tsx for
 * the exact CSS keyframe values the mobile worklet should mirror.
 *
 * Intentionally deferred per Jim's escape clause in the task brief:
 * ship web fully + mobile static now, orbital math later.
 */

type SentimentTone = "positive" | "challenging" | "neutral";

export type ConstellationTheme = {
  id: string;
  name: string;
  tone: SentimentTone;
};

const SLOTS = [
  { x: 85, y: 80, halo: 40, core: 22, glow: true },
  { x: 280, y: 80, halo: 35, core: 20, glow: true },
  { x: 85, y: 210, halo: 30, core: 16, glow: true },
  { x: 280, y: 210, halo: 28, core: 14, glow: false },
  { x: 175, y: 40, halo: 24, core: 12, glow: false },
] as const;

const TONE_CORE: Record<SentimentTone, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#94a3b8",
};

const TONE_HALO: Record<SentimentTone, string> = {
  positive: "rgba(52,211,153,0.55)",
  challenging: "rgba(248,113,113,0.55)",
  neutral: "rgba(148,163,184,0.35)",
};

const LABEL_FULL = "rgba(250,250,250,0.85)";
const LABEL_DIM = "rgba(250,250,250,0.55)";

export function Constellation({
  hero,
  planets,
  onTapHero,
  onTapPlanet,
}: {
  hero: { id: string; name: string };
  planets: ConstellationTheme[];
  onTapHero?: () => void;
  onTapPlanet?: (id: string) => void;
}) {
  const placed = planets.slice(0, 5);

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginVertical: 20,
        padding: 16,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        // Purple gradient wash — RN doesn't support linear-gradient
        // natively without a dep, so we approximate with a flat tinted
        // background + a radial SVG overlay below.
        backgroundColor: "rgba(124,58,237,0.05)",
      }}
    >
      <Svg
        viewBox="0 0 350 280"
        width="100%"
        height={280}
        style={{ overflow: "visible" }}
      >
        <Defs>
          <RadialGradient id="heroHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="rgba(124,58,237,0.55)" />
            <Stop offset="100%" stopColor="rgba(124,58,237,0)" />
          </RadialGradient>
          {(["positive", "challenging", "neutral"] as const).map((tone) => (
            <RadialGradient
              key={`halo-${tone}`}
              id={`halo-${tone}`}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <Stop offset="0%" stopColor={TONE_HALO[tone]} />
              <Stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </RadialGradient>
          ))}
        </Defs>

        {/* Connection lines — hero → first 4 planets */}
        {placed.slice(0, 4).map((_, i) => {
          const slot = SLOTS[i];
          return (
            <Line
              key={`line-${i}`}
              x1={175}
              y1={140}
              x2={slot.x}
              y2={slot.y}
              stroke="#7C3AED"
              strokeOpacity={0.3}
              strokeWidth={1}
            />
          );
        })}

        {/* Hero halo + core */}
        <Circle cx={175} cy={140} r={55} fill="url(#heroHalo)" opacity={0.7} />
        <Circle cx={175} cy={140} r={32} fill="#7C3AED" onPress={onTapHero} />
        <SvgText
          x={175}
          y={144}
          textAnchor="middle"
          fontSize={12}
          fontWeight="600"
          fill="#FFFFFF"
        >
          {truncate(hero.name, 10)}
        </SvgText>

        {/* Planets */}
        {placed.map((p, i) => {
          const slot = SLOTS[i];
          const coreColor = TONE_CORE[p.tone];
          const labelColor = i <= 1 ? LABEL_FULL : LABEL_DIM;
          const labelFontSize = i <= 1 ? 11 : 10;
          const labelY = i === 4 ? slot.y - slot.halo - 8 : slot.y + slot.halo + 16;
          return (
            <Fragment key={p.id}>
              <Circle
                cx={slot.x}
                cy={slot.y}
                r={slot.halo}
                fill={`url(#halo-${p.tone})`}
                opacity={0.8}
              />
              <Circle
                cx={slot.x}
                cy={slot.y}
                r={slot.core}
                fill={coreColor}
                onPress={() => onTapPlanet?.(p.id)}
              />
              <SvgText
                x={slot.x}
                y={labelY}
                textAnchor="middle"
                fontSize={labelFontSize}
                fontWeight="500"
                fill={labelColor}
              >
                {truncate(p.name, 14)}
              </SvgText>
            </Fragment>
          );
        })}
      </Svg>

      {/* Legend */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 20,
          marginTop: 8,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: "rgba(148,163,184,0.25)",
        }}
      >
        <LegendDot color="#F87171" label="Challenging" glow />
        <LegendDot color="#94a3b8" label="Neutral" />
        <LegendDot color="#34D399" label="Positive" glow />
      </View>
    </View>
  );
}

function LegendDot({
  color,
  label,
  glow,
}: {
  color: string;
  label: string;
  glow?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          shadowColor: glow ? color : "transparent",
          shadowOpacity: glow ? 0.8 : 0,
          shadowRadius: 4,
        }}
      />
      <Text style={{ fontSize: 11, color: "rgba(148,163,184,0.75)" }}>
        {label}
      </Text>
    </View>
  );
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
