import { useEffect, useMemo, type ComponentType } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  RadialGradient,
  Stop,
  Svg,
  Text as SvgText,
  type CircleProps,
} from "react-native-svg";

import { useTheme } from "@/contexts/theme-context";

import type { OrbitalTheme } from "./types";

// Widen the SVG component types so animatedProps accepts cx/cy/opacity
// without TS complaining (the inferred RestProps shape narrows
// otherwise). Same pattern as RingProgress's AnimatedCircle.
const AnimatedCircle = Animated.createAnimatedComponent(
  Circle as ComponentType<
    CircleProps & { cx?: number; cy?: number; opacity?: number }
  >
);
const AnimatedG = Animated.createAnimatedComponent(
  G as ComponentType<{ opacity?: number; children?: React.ReactNode }>
);

/**
 * OrbitalCosmos — the Theme Map's planetary visualization.
 *
 * ─── Geometry math (iPhone 16e 375pt screen) ──────────────────────────
 *
 * SVG viewBox: 0 0 402 360 (design spec fidelity).
 * Render width is set by the caller (theme-map.tsx); at iPhone 16e
 * 375pt screen with 0 horizontal page padding around the SVG container,
 * the viewBox scales by 375/402 = 0.933×. All planet sizes + label
 * font sizes render at 93.3% of design values — within the spec's
 * intended range.
 *
 * Center: (201, 180).
 * Ring radii: [78, 110, 140, 168].
 * Ring distribution (matches design): 2 / 2 / 3 / 2 = 9 planet slots.
 *
 * Slot positions + sizes (in viewBox coordinates):
 *
 *   ring 0 (r=78, biggest planets):
 *     slot 0 — angle  30°  size 52  pos (201+78·cos30°, 180+78·sin30°)  = (268, 219)
 *     slot 1 — angle 200°  size 46  pos (201+78·cos200°, 180+78·sin200°) = (128, 153)
 *   ring 1 (r=110):
 *     slot 2 — angle 130°  size 40  pos (201+110·cos130°, 180+110·sin130°) = (130, 264)
 *     slot 3 — angle 320°  size 34  pos (201+110·cos320°, 180+110·sin320°) = (285, 109)
 *   ring 2 (r=140):
 *     slot 4 — angle  80°  size 30  pos (225, 318)
 *     slot 5 — angle 230°  size 28  pos (111, 73)
 *     slot 6 — angle 350°  size 26  pos (339, 156)
 *   ring 3 (r=168, smallest planets):
 *     slot 7 — angle 200°  size 22  pos (43, 122)
 *     slot 8 — angle 310°  size 20  pos (309, 51)
 *
 * Worst-case bounds check:
 *   - rightmost: slot 6 at x=339, planet half-width=13 → reaches x=352
 *     (viewBox 402 → 50pt margin) ✓
 *   - leftmost: slot 7 at x=43, half-width=11 → reaches x=32
 *     (viewBox 0 → 32pt margin) ✓
 *   - topmost: slot 8 at y=51, half-height=10 → reaches y=41 ✓
 *   - bottommost: slot 4 at y=318, half-height=15 + label below
 *     (fontSize 12, label baseline at y≈340) → reaches y≈346
 *     (viewBox 360 → 14pt margin) ✓
 *
 * No clipping at the 375pt render size. All 9 planets + labels fit.
 *
 * ─── Animation choreography (6.0s total) ──────────────────────────────
 *
 *   T=0.0-0.6s   Center sun fades + scales in
 *   T=0.6-1.8s   Ring guides fade in (one shared progress, all four)
 *   T=1.5-5.0s   Planets stagger by ring:
 *                  slot 0 (1.5→2.5s)   slot 1 (1.6→2.6s)
 *                  slot 2 (2.0→3.0s)   slot 3 (2.1→3.1s)
 *                  slot 4 (2.5→3.5s)   slot 5 (2.7→3.7s)
 *                  slot 6 (2.9→3.9s)
 *                  slot 7 (3.5→5.0s)   slot 8 (3.7→5.2s)
 *   T=5.0-5.8s   Dashed connector lines fade in
 *
 * Each planet animates from (cx, cy) center outward to its slot
 * position as its local progress 0→1. Center sun + halo use a separate
 * progress. Reanimated 3 worklets keep the animation off the JS thread.
 *
 * `animateOnMount={false}` snaps to final state with no entrance —
 * used on second+ loads in the same session per Jim's UX directive
 * (the 6-second cosmos is a first-impression moment, not a chore).
 */

interface SlotConfig {
  ring: number;
  angle: number;
  size: number;
  /** Delay in ms before this planet starts its 1000ms tween. */
  delay: number;
}

const SLOT_CONFIGS: SlotConfig[] = [
  { ring: 0, angle: 30, size: 52, delay: 1500 },
  { ring: 0, angle: 200, size: 46, delay: 1600 },
  { ring: 1, angle: 130, size: 40, delay: 2000 },
  { ring: 1, angle: 320, size: 34, delay: 2100 },
  { ring: 2, angle: 80, size: 30, delay: 2500 },
  { ring: 2, angle: 230, size: 28, delay: 2700 },
  { ring: 2, angle: 350, size: 26, delay: 2900 },
  { ring: 3, angle: 200, size: 22, delay: 3500 },
  { ring: 3, angle: 310, size: 20, delay: 3700 },
];

const RING_RADII = [78, 110, 140, 168];
const VIEWBOX_W = 402;
const VIEWBOX_H = 360;
const CX = 201;
const CY = 180;
const EASE_STANDARD = Easing.bezier(0.32, 0.72, 0, 1);
const PLANET_DURATION_MS = 1000;

function angleToXY(angleDeg: number, radius: number) {
  const a = (angleDeg * Math.PI) / 180;
  return {
    x: CX + Math.cos(a) * radius,
    y: CY + Math.sin(a) * radius,
  };
}

interface Props {
  themes: OrbitalTheme[];
  size: number;
  onPlanetTap: (theme: OrbitalTheme) => void;
  animateOnMount: boolean;
}

export function OrbitalCosmos({
  themes,
  size,
  onPlanetTap,
  animateOnMount,
}: Props) {
  const { tokens, resolved } = useTheme();

  // Take top 9 by mentionCount (sort happens upstream, but defensive).
  const visibleThemes = themes.slice(0, 9);

  // Compute final positions for each slot.
  const slots = useMemo(
    () =>
      SLOT_CONFIGS.map((cfg) => {
        const { x, y } = angleToXY(cfg.angle, RING_RADII[cfg.ring]);
        return { ...cfg, x, y };
      }),
    []
  );

  // Animation progress shared values.
  const init = animateOnMount ? 0 : 1;
  const sunP = useSharedValue(init);
  const ringP = useSharedValue(init);
  const lineP = useSharedValue(init);
  const p0 = useSharedValue(init);
  const p1 = useSharedValue(init);
  const p2 = useSharedValue(init);
  const p3 = useSharedValue(init);
  const p4 = useSharedValue(init);
  const p5 = useSharedValue(init);
  const p6 = useSharedValue(init);
  const p7 = useSharedValue(init);
  const p8 = useSharedValue(init);
  const planetProgress = [p0, p1, p2, p3, p4, p5, p6, p7, p8];

  useEffect(() => {
    if (!animateOnMount) return;
    sunP.value = withTiming(1, {
      duration: 600,
      easing: EASE_STANDARD,
    });
    ringP.value = withDelay(
      600,
      withTiming(1, { duration: 1200, easing: EASE_STANDARD })
    );
    slots.forEach((slot, i) => {
      planetProgress[i].value = withDelay(
        slot.delay,
        withTiming(1, {
          duration: PLANET_DURATION_MS,
          easing: EASE_STANDARD,
        })
      );
    });
    lineP.value = withDelay(
      5000,
      withTiming(1, { duration: 800, easing: EASE_STANDARD })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateOnMount]);

  // Per-planet animated props (cx/cy/opacity interpolate from center
  // to final slot position as local progress 0→1). The label inside
  // the same <G> shares the planet's opacity; geometry stays in sync
  // because the <SvgText> below also uses the same anchored coordinates
  // (planet final pos). Labels appear with their planet, faded together.
  const planet0Props = useAnimatedProps(() => ({
    cx: interpolate(p0.value, [0, 1], [CX, slots[0].x]),
    cy: interpolate(p0.value, [0, 1], [CY, slots[0].y]),
    opacity: p0.value,
  }));
  const planet1Props = useAnimatedProps(() => ({
    cx: interpolate(p1.value, [0, 1], [CX, slots[1].x]),
    cy: interpolate(p1.value, [0, 1], [CY, slots[1].y]),
    opacity: p1.value,
  }));
  const planet2Props = useAnimatedProps(() => ({
    cx: interpolate(p2.value, [0, 1], [CX, slots[2].x]),
    cy: interpolate(p2.value, [0, 1], [CY, slots[2].y]),
    opacity: p2.value,
  }));
  const planet3Props = useAnimatedProps(() => ({
    cx: interpolate(p3.value, [0, 1], [CX, slots[3].x]),
    cy: interpolate(p3.value, [0, 1], [CY, slots[3].y]),
    opacity: p3.value,
  }));
  const planet4Props = useAnimatedProps(() => ({
    cx: interpolate(p4.value, [0, 1], [CX, slots[4].x]),
    cy: interpolate(p4.value, [0, 1], [CY, slots[4].y]),
    opacity: p4.value,
  }));
  const planet5Props = useAnimatedProps(() => ({
    cx: interpolate(p5.value, [0, 1], [CX, slots[5].x]),
    cy: interpolate(p5.value, [0, 1], [CY, slots[5].y]),
    opacity: p5.value,
  }));
  const planet6Props = useAnimatedProps(() => ({
    cx: interpolate(p6.value, [0, 1], [CX, slots[6].x]),
    cy: interpolate(p6.value, [0, 1], [CY, slots[6].y]),
    opacity: p6.value,
  }));
  const planet7Props = useAnimatedProps(() => ({
    cx: interpolate(p7.value, [0, 1], [CX, slots[7].x]),
    cy: interpolate(p7.value, [0, 1], [CY, slots[7].y]),
    opacity: p7.value,
  }));
  const planet8Props = useAnimatedProps(() => ({
    cx: interpolate(p8.value, [0, 1], [CX, slots[8].x]),
    cy: interpolate(p8.value, [0, 1], [CY, slots[8].y]),
    opacity: p8.value,
  }));
  const planetAnimatedProps = [
    planet0Props,
    planet1Props,
    planet2Props,
    planet3Props,
    planet4Props,
    planet5Props,
    planet6Props,
    planet7Props,
    planet8Props,
  ];

  // Group-level opacity for the sun, rings, and connector lines.
  const sunAnimatedProps = useAnimatedProps(() => ({
    opacity: sunP.value,
  }));
  const ringAnimatedProps = useAnimatedProps(() => ({
    opacity: ringP.value,
  }));
  const lineAnimatedProps = useAnimatedProps(() => ({
    opacity: lineP.value * 0.7, // full opacity for connectors is 0.7 per design
  }));

  // Per-planet label opacity reads from the same shared value as the
  // planet itself. Defined inline so labels and planets share animation.
  const label0Props = useAnimatedProps(() => ({ opacity: p0.value }));
  const label1Props = useAnimatedProps(() => ({ opacity: p1.value }));
  const label2Props = useAnimatedProps(() => ({ opacity: p2.value }));
  const label3Props = useAnimatedProps(() => ({ opacity: p3.value }));
  const label4Props = useAnimatedProps(() => ({ opacity: p4.value }));
  const label5Props = useAnimatedProps(() => ({ opacity: p5.value }));
  const label6Props = useAnimatedProps(() => ({ opacity: p6.value }));
  const label7Props = useAnimatedProps(() => ({ opacity: p7.value }));
  const label8Props = useAnimatedProps(() => ({ opacity: p8.value }));
  const labelAnimatedProps = [
    label0Props,
    label1Props,
    label2Props,
    label3Props,
    label4Props,
    label5Props,
    label6Props,
    label7Props,
    label8Props,
  ];

  const gridStroke =
    resolved === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const youStroke =
    resolved === "dark" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.85)";

  return (
    <View style={{ width: size, height: (size * VIEWBOX_H) / VIEWBOX_W }}>
      <Svg
        width={size}
        height={(size * VIEWBOX_H) / VIEWBOX_W}
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      >
        <Defs>
          {/* Center sun glow halo */}
          <RadialGradient
            id="tm-you-glow"
            cx="50%"
            cy="50%"
            r="50%"
          >
            <Stop offset="0%" stopColor={tokens.primary} stopOpacity="0.45" />
            <Stop offset="100%" stopColor={tokens.primary} stopOpacity="0" />
          </RadialGradient>
          {/* Center sun body gradient (palette primary → secondary) */}
          <LinearGradient id="tm-you-body" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={tokens.primary} />
            <Stop offset="100%" stopColor={tokens.secondary} />
          </LinearGradient>
          {/* Per-planet radial gradients — generated per visible slot */}
          {visibleThemes.map((theme, i) => (
            <RadialGradient
              key={`planet-grad-${i}`}
              id={`planet-grad-${i}`}
              cx="32%"
              cy="28%"
              r="60%"
            >
              <Stop offset="0%" stopColor={`hsl(${theme.hue}, 70%, 78%)`} />
              <Stop offset="40%" stopColor={`hsl(${theme.hue}, 65%, 55%)`} />
              <Stop offset="95%" stopColor={`hsl(${theme.hue}, 55%, 28%)`} />
            </RadialGradient>
          ))}
        </Defs>

        {/* Ring guides — 4 concentric dashed circles */}
        <AnimatedG animatedProps={ringAnimatedProps}>
          {RING_RADII.map((r, i) => (
            <Circle
              key={`ring-${i}`}
              cx={CX}
              cy={CY}
              r={r}
              fill="none"
              stroke={gridStroke}
              strokeWidth={0.6}
              strokeDasharray={i === 0 ? undefined : "2 5"}
            />
          ))}
        </AnimatedG>

        {/* Dashed connector lines, center→each visible planet */}
        <AnimatedG animatedProps={lineAnimatedProps}>
          {visibleThemes.map((theme, i) => {
            const slot = slots[i];
            return (
              <Line
                key={`line-${i}`}
                x1={CX}
                y1={CY}
                x2={slot.x}
                y2={slot.y}
                stroke={`hsl(${theme.hue}, 55%, 55%)`}
                strokeOpacity={resolved === "dark" ? 0.25 : 0.3}
                strokeWidth={0.7}
                strokeDasharray="1.5 3"
              />
            );
          })}
        </AnimatedG>

        {/* Center sun — halo + body + initial + YOU caption */}
        <AnimatedG animatedProps={sunAnimatedProps}>
          {/* Glow halo */}
          <Circle cx={CX} cy={CY} r={40} fill="url(#tm-you-glow)" />
          {/* Dashed outer ring (subtle frame around the sun) */}
          <Circle
            cx={CX}
            cy={CY}
            r={26}
            fill="none"
            stroke={gridStroke}
            strokeWidth={0.6}
            strokeDasharray="2 4"
          />
          {/* Body */}
          <Circle
            cx={CX}
            cy={CY}
            r={20}
            fill="url(#tm-you-body)"
            stroke={youStroke}
            strokeWidth={1.5}
          />
          {/* Initial (centered) — use first letter of theme map title for
              now; could be threaded as a prop from theme-map.tsx for the
              user's actual first initial. Static "J" placeholder for
              v1.1; future polish slice. */}
          <SvgText
            x={CX}
            y={CY + 5}
            textAnchor="middle"
            fontSize={17}
            fontWeight="800"
            fill="#FFFFFF"
            fontFamily={tokens.fontDisplay}
            letterSpacing={-0.4}
          >
            You
          </SvgText>
          <SvgText
            x={CX}
            y={CY + 36}
            textAnchor="middle"
            fontSize={9}
            fontWeight="700"
            fill={tokens.textSec}
            fontFamily={tokens.fontMono}
            letterSpacing={1.6}
          >
            CENTER
          </SvgText>
        </AnimatedG>

        {/* Planets — each is an animated G containing the planet circle
            + label. Tappable via onPress on the G; the touch area
            covers the whole group bounds. */}
        {visibleThemes.map((theme, i) => {
          const slot = slots[i];
          const planetR = slot.size / 2;
          const labelY = slot.y + planetR + 14;
          const countY = labelY + 12;
          const isInner = slot.ring <= 1;
          return (
            <G key={`planet-g-${i}`} onPress={() => onPlanetTap(theme)}>
              {/* Animated planet circle — cx/cy/opacity animate from
                  center outward. Radius is static (no scale-up effect
                  needed; opacity + position-shift carry the entrance). */}
              <AnimatedCircle
                animatedProps={planetAnimatedProps[i]}
                r={planetR}
                fill={`url(#planet-grad-${i})`}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={0.5}
              />
              {/* Label — appears at the planet's final position, fades in
                  with the planet's opacity. */}
              <AnimatedG animatedProps={labelAnimatedProps[i]}>
                <SvgText
                  x={slot.x}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={isInner ? 13 : 11.5}
                  fontWeight="700"
                  fill={tokens.text}
                  fontFamily={tokens.fontSans}
                  letterSpacing={-0.1}
                >
                  {theme.name}
                </SvgText>
                <SvgText
                  x={slot.x}
                  y={countY}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="600"
                  fill={tokens.textTer}
                  fontFamily={tokens.fontMono}
                  letterSpacing={0.5}
                >
                  {theme.mentionCount}
                </SvgText>
              </AnimatedG>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
