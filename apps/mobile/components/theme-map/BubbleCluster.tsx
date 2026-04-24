import {
  forceCollide,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, LayoutChangeEvent, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  RadialGradient,
  Stop,
} from "react-native-svg";

/**
 * Bubble cluster. Each theme is a circle; area scales with mention
 * count. A d3-force simulation packs the bubbles around the center
 * with collide forces so they don't overlap. Mount: staggered
 * fade+scale entrance via reanimated shared values — no orbital
 * sweep, just a calm settle. Tap a bubble → onTap(id).
 *
 * Rendering notes (do not regress):
 *   - Simulation runs synchronously inside useMemo: we call .tick()
 *     a fixed number of times rather than using the live ticker so
 *     paint is deterministic and frame-free. No RAF, no state
 *     thrash, no flicker on re-render.
 *   - Container width is measured via onLayout. If width is 0 on
 *     first paint (pre-layout), we skip rendering until we have it.
 *   - Radial gradient fills are defined once per sentiment tone and
 *     referenced via url(#grad-<tone>). react-native-svg can re-use
 *     a single `<Defs>` block across circles.
 *   - Soft glow is a larger semi-transparent circle rendered behind
 *     each bubble (react-native-svg has no filter/blur support that
 *     works reliably on iOS and Android — a second circle is the
 *     portable way to fake depth).
 *   - Labels render in absolute-positioned RN Views layered above
 *     the Svg rather than SvgText, because iOS and Android glyph
 *     metrics diverge inside Svg; RN Text is consistent.
 */

type SentimentTone = "positive" | "challenging" | "neutral";

export type BubbleTheme = {
  id: string;
  name: string;
  mentionCount: number;
  tone: SentimentTone;
};

type SimNode = SimulationNodeDatum & {
  id: string;
  name: string;
  tone: SentimentTone;
  r: number;
};

const MIN_RADIUS = 26;
const MAX_RADIUS = 58;
const PACKING_PADDING = 4;
const CONTAINER_HEIGHT = 340;
const CONTAINER_PADDING = 16;

const GRADIENT_CENTER: Record<SentimentTone, string> = {
  positive: "#6EE7B7",
  challenging: "#FCA5A5",
  neutral: "#C4B5FD",
};
const GRADIENT_EDGE: Record<SentimentTone, string> = {
  positive: "#047857",
  challenging: "#991B1B",
  neutral: "#4338CA",
};
const GLOW: Record<SentimentTone, string> = {
  positive: "rgba(52,211,153,0.35)",
  challenging: "rgba(248,113,113,0.35)",
  neutral: "rgba(124,58,237,0.35)",
};

// react-native-svg's generic component types don't line up with
// Reanimated's createAnimatedComponent signature under React 19's
// @types/react — known upstream typing gap. Cast through `any` at
// construction to avoid a per-prop type workaround at every call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnimatedCircle: any = Animated.createAnimatedComponent(Circle as any);

export function BubbleCluster({
  themes,
  onTap,
  replayToken = 0,
}: {
  themes: BubbleTheme[];
  onTap?: (id: string) => void;
  /** Bump to replay the entrance (e.g., on time-chip change). */
  replayToken?: number | string;
}) {
  const [width, setWidth] = useState(0);
  const height = CONTAINER_HEIGHT;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  const packed = useMemo(() => {
    if (width === 0 || themes.length === 0) return [] as SimNode[];
    return packBubbles(themes, width, height);
  }, [themes, width, height]);

  const svgWidth = Math.max(0, width - CONTAINER_PADDING * 2);
  const svgHeight = height - CONTAINER_PADDING * 2;

  return (
    <View
      onLayout={onLayout}
      style={{
        marginHorizontal: 20,
        marginVertical: 16,
        padding: CONTAINER_PADDING,
        borderRadius: 20,
        backgroundColor: "rgba(124,58,237,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        minHeight: height,
        overflow: "hidden",
      }}
    >
      {width > 0 && packed.length > 0 && (
        <Svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ overflow: "visible" }}
        >
          <Defs>
            {(["positive", "challenging", "neutral"] as const).map((t) => (
              <RadialGradient
                key={t}
                id={`grad-${t}`}
                cx="35%"
                cy="35%"
                r="70%"
              >
                <Stop
                  offset="0%"
                  stopColor={GRADIENT_CENTER[t]}
                  stopOpacity={0.95}
                />
                <Stop
                  offset="100%"
                  stopColor={GRADIENT_EDGE[t]}
                  stopOpacity={0.85}
                />
              </RadialGradient>
            ))}
          </Defs>

          {packed.map((n, i) => (
            <GlowCircle
              key={`glow-${n.id}`}
              cx={n.x ?? 0}
              cy={n.y ?? 0}
              r={n.r + 6}
              color={GLOW[n.tone]}
              delay={i * 35}
              replayToken={replayToken}
              reduceMotion={reduceMotion}
            />
          ))}

          {packed.map((n, i) => (
            <BubbleCircle
              key={n.id}
              node={n}
              index={i}
              onPress={onTap ? () => onTap(n.id) : undefined}
              replayToken={replayToken}
              reduceMotion={reduceMotion}
            />
          ))}
        </Svg>
      )}

      {width > 0 &&
        packed.map((n, i) => (
          <BubbleLabel
            key={`label-${n.id}`}
            node={n}
            index={i}
            replayToken={replayToken}
            reduceMotion={reduceMotion}
          />
        ))}
    </View>
  );
}

function BubbleCircle({
  node,
  index,
  onPress,
  replayToken,
  reduceMotion,
}: {
  node: SimNode;
  index: number;
  onPress?: () => void;
  replayToken: number | string;
  reduceMotion: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      index * 35,
      withTiming(1, {
        duration: 520,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [replayToken, reduceMotion, index, progress]);

  const animatedProps = useAnimatedProps(() => {
    const p = progress.value;
    return {
      r: node.r * (0.4 + 0.6 * p),
      opacity: p,
    };
  });

  return (
    <AnimatedCircle
      cx={node.x ?? 0}
      cy={node.y ?? 0}
      fill={`url(#grad-${node.tone})`}
      animatedProps={animatedProps}
      onPress={onPress}
    />
  );
}

function GlowCircle({
  cx,
  cy,
  r,
  color,
  delay,
  replayToken,
  reduceMotion,
}: {
  cx: number;
  cy: number;
  r: number;
  color: string;
  delay: number;
  replayToken: number | string;
  reduceMotion: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) })
    );
  }, [replayToken, reduceMotion, delay, progress]);

  const animatedProps = useAnimatedProps(() => ({
    opacity: progress.value * 0.8,
  }));

  return (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      r={r}
      fill={color}
      animatedProps={animatedProps}
    />
  );
}

function BubbleLabel({
  node,
  index,
  replayToken,
  reduceMotion,
}: {
  node: SimNode;
  index: number;
  replayToken: number | string;
  reduceMotion: boolean;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      index * 35 + 200,
      withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) })
    );
  }, [replayToken, reduceMotion, index, progress]);

  const style = useAnimatedStyle(() => ({ opacity: progress.value }));

  const insideBubble = node.r >= 34;
  const labelFontSize = insideBubble ? (node.r >= 44 ? 12 : 11) : 11;
  const labelColor = insideBubble
    ? "#FFFFFF"
    : "rgba(228,228,231,0.85)";
  const nodeX = node.x ?? 0;
  const nodeY = node.y ?? 0;
  const left = nodeX - 60 + CONTAINER_PADDING;
  const top = insideBubble
    ? nodeY - labelFontSize / 2 - 2 + CONTAINER_PADDING
    : nodeY + node.r + 4 + CONTAINER_PADDING;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left,
          top,
          width: 120,
          alignItems: "center",
        },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: labelFontSize,
          fontWeight: insideBubble ? "600" : "500",
          color: labelColor,
          textAlign: "center",
        }}
      >
        {sentenceCase(node.name)}
      </Text>
    </Animated.View>
  );
}

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Synchronous d3-force pack. Runs the simulation for a fixed number
 * of ticks to convergence, then returns the nodes with final x/y.
 *
 * Bubble area is proportional to mention count via sqrt scaling
 * (area = π r² ⇒ r ∝ √count). Capped at MAX_RADIUS for the top
 * theme so a 50-mention theme doesn't dwarf the container.
 */
function packBubbles(
  themes: BubbleTheme[],
  width: number,
  height: number
): SimNode[] {
  const innerW = width - CONTAINER_PADDING * 2;
  const innerH = height - CONTAINER_PADDING * 2;
  const cx = innerW / 2;
  const cy = innerH / 2;

  const maxMentions = Math.max(...themes.map((t) => t.mentionCount), 1);
  const minMentions = Math.min(...themes.map((t) => t.mentionCount));
  const span = Math.max(1, maxMentions - minMentions);

  const nodes: SimNode[] = themes.map((t, i) => {
    const scaled =
      MIN_RADIUS +
      Math.sqrt((t.mentionCount - minMentions) / span) *
        (MAX_RADIUS - MIN_RADIUS);
    return {
      id: t.id,
      name: t.name,
      tone: t.tone,
      r: Math.round(scaled),
      x: cx + Math.cos((i / themes.length) * Math.PI * 2) * 60,
      y: cy + Math.sin((i / themes.length) * Math.PI * 2) * 60,
    };
  });

  const sim: Simulation<SimNode, undefined> = forceSimulation<SimNode>(nodes)
    .force("x", forceX<SimNode>(cx).strength(0.08))
    .force("y", forceY<SimNode>(cy).strength(0.08))
    .force(
      "collide",
      forceCollide<SimNode>()
        .radius((d) => d.r + PACKING_PADDING)
        .iterations(3)
    )
    .force("charge", forceManyBody<SimNode>().strength(-8))
    .stop();

  for (let i = 0; i < 180; i++) sim.tick();

  for (const n of nodes) {
    if (n.x == null || n.y == null) continue;
    n.x = Math.max(n.r + 4, Math.min(innerW - n.r - 4, n.x));
    n.y = Math.max(n.r + 4, Math.min(innerH - n.r - 4, n.y));
  }

  return nodes;
}

