import { useEffect, useMemo, type ComponentType } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
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
  TSpan,
  type CircleProps,
} from "react-native-svg";

import { useTheme } from "@/contexts/theme-context";

import type { OrbitalTheme } from "./types";

const AnimatedCircle = Animated.createAnimatedComponent(
  Circle as ComponentType<
    CircleProps & { cx?: number; cy?: number; opacity?: number }
  >
);
const AnimatedG = Animated.createAnimatedComponent(
  G as ComponentType<{ opacity?: number; children?: React.ReactNode }>
);

/**
 * OrbitalCosmos — Phase E polish 1 (2026-05-21).
 *
 * Slot distribution is dynamic now based on theme count (2-6 themes
 * post-mentionCount filter). With ≤4 themes we use rings 0/1 only;
 * with 5-6 we add a ring 2 pair. The outermost ring 3 is unused
 * post-polish so labels have more breathing room.
 *
 * ─── Slot configs by count ────────────────────────────────────────────
 *   n=2: ring 0 [30°(52), 200°(46)]
 *   n=3: + ring 1 [130°(40)]
 *   n=4: + ring 1 [130°(40), 320°(34)]
 *   n=5: + ring 2 [350°(30)]
 *   n=6: + ring 2 [190°(30), 350°(28)]  (horizontal pair, both y≈156)
 *
 * Why not the design's deep-bottom angle 80° for ring 2: at y=318 the
 * planet's 2-line label + count would overflow viewBox bottom by 9pt.
 * Right/left horizontal pair (190° / 350°) both at y≈156 stay in
 * comfortable bounds, balance visually, and don't fight gravity.
 *
 * ─── Label bounds at iPhone 16e 375pt ─────────────────────────────────
 *   Labels: mono fontSize 11, textSec @ 0.85 opacity, textAnchor middle.
 *   Wrap to 2 lines at 14-char threshold; line 2 truncates to 13 chars
 *   + ellipsis if still too long. Line spacing 11pt.
 *   Block heights:
 *     - 1-line block (line + count): ~24pt (11 + 2 + 11)
 *     - 2-line block (line + line + count): ~36pt (11 + 11 + 3 + 11)
 *   Worst-case 2-line width: "Friends & Community" → "Friends &" / "Community"
 *     9 chars × ~6.6pt mono = ~60pt wide / half-width 30pt.
 *
 *   Horizontal bounds for ring 2 pair:
 *     angle 190°: x=63   label spans (33, 93)   left margin 33pt ✓
 *     angle 350°: x=339  label spans (309, 369) right margin 33pt ✓
 *   All ring 0/1 slots have ≥70pt margin to viewBox edges. ✓
 *
 *   Vertical bounds: max slot finalY is 264 (ring 1, angle 130°).
 *   2-line block below: 264 + 20 (planetR) + 36 = 320. ViewBox 360 →
 *   40pt bottom margin. Always safe.
 *
 * ─── Animation (unchanged from earlier rebuild) ───────────────────────
 *   Spin-in per planet: target radius, start angle = target − 90°,
 *   rotate +90° over 1.2s with Easing.out(Easing.cubic), 0.15s stagger.
 *   Center sun 0.0-0.6s; ring guides 0.6-1.8s; planets 1.5s onwards;
 *   connector lines 4.0-4.8s. Total ~4.8s.
 */

interface SlotConfig {
  ring: number;
  angle: number;
  delay: number;
}

/**
 * Slot layout (ring + angle + animation delay) is purely positional —
 * size is now data-driven from mentionCount (see sizeForMentionCount).
 * Ring assignment still goes inside-out so higher-mention themes sit
 * closer to center; size emphasizes the same hierarchy.
 */
function getSlotsForCount(n: number): SlotConfig[] {
  if (n <= 0) return [];
  if (n === 1) return [{ ring: 0, angle: 30, delay: 1500 }];
  if (n === 2) {
    return [
      { ring: 0, angle: 30, delay: 1500 },
      { ring: 0, angle: 200, delay: 1650 },
    ];
  }
  if (n === 3) {
    return [
      { ring: 0, angle: 30, delay: 1500 },
      { ring: 0, angle: 200, delay: 1650 },
      { ring: 1, angle: 130, delay: 1800 },
    ];
  }
  if (n === 4) {
    return [
      { ring: 0, angle: 30, delay: 1500 },
      { ring: 0, angle: 200, delay: 1650 },
      { ring: 1, angle: 130, delay: 1800 },
      { ring: 1, angle: 320, delay: 1950 },
    ];
  }
  if (n === 5) {
    return [
      { ring: 0, angle: 30, delay: 1500 },
      { ring: 0, angle: 200, delay: 1650 },
      { ring: 1, angle: 130, delay: 1800 },
      { ring: 1, angle: 320, delay: 1950 },
      { ring: 2, angle: 350, delay: 2100 },
    ];
  }
  // n >= 6
  return [
    { ring: 0, angle: 30, delay: 1500 },
    { ring: 0, angle: 200, delay: 1650 },
    { ring: 1, angle: 130, delay: 1800 },
    { ring: 1, angle: 320, delay: 1950 },
    { ring: 2, angle: 190, delay: 2100 },
    { ring: 2, angle: 350, delay: 2250 },
  ];
}

const MIN_PLANET_SIZE = 30;
const MAX_PLANET_SIZE = 52;

/**
 * Map mentionCount → planet diameter (pt).
 *   size = MIN + (mentionCount / maxMentionCount) × (MAX - MIN)
 * When all themes share the same mentionCount, every planet renders
 * at MAX. When one theme dominates (e.g. 10x another), the smaller
 * theme renders at the MIN floor. Linear interpolation keeps the
 * visual proportional to data without runaway scale at the top end.
 */
function sizeForMentionCount(
  mentionCount: number,
  maxMentionCount: number
): number {
  if (maxMentionCount <= 0) return MIN_PLANET_SIZE;
  const ratio = Math.max(0, Math.min(1, mentionCount / maxMentionCount));
  return MIN_PLANET_SIZE + ratio * (MAX_PLANET_SIZE - MIN_PLANET_SIZE);
}

const RING_RADII = [78, 110, 140, 168];
const VIEWBOX_W = 402;
const VIEWBOX_H = 360;
const CX = 201;
const CY = 180;
const SPIN_DURATION_MS = 1200;
const SUN_DURATION_MS = 600;
const RING_DURATION_MS = 1200;
const LINE_DURATION_MS = 800;
const EASE_OUT_CUBIC = Easing.out(Easing.cubic);
const MAX_PLANETS = 6;
const WRAP_THRESHOLD = 14;

/**
 * Wrap a label into 1 or 2 lines for SVG <TSpan> rendering. Single-
 * word labels longer than the threshold force-break at the threshold.
 * Two-line outputs cap line 2 at 13 chars + ellipsis if the remainder
 * is still long enough to risk edge clipping.
 */
function wrapLabel(text: string): { line1: string; line2: string | null } {
  if (text.length <= WRAP_THRESHOLD) return { line1: text, line2: null };
  let splitAt = text.lastIndexOf(" ", WRAP_THRESHOLD);
  if (splitAt < 1) splitAt = WRAP_THRESHOLD; // force-break single word
  const line1 = text.slice(0, splitAt).trim();
  let line2 = text.slice(splitAt).trim();
  if (line2.length > WRAP_THRESHOLD) {
    line2 = line2.slice(0, WRAP_THRESHOLD - 1) + "…";
  }
  return { line1, line2 };
}

interface Props {
  themes: OrbitalTheme[];
  size: number;
  onPlanetTap: (theme: OrbitalTheme) => void;
  animateOnMount: boolean;
  /** Optional first initial for the center "you" sun. Defaults to "•". */
  centerInitial?: string;
}

export function OrbitalCosmos({
  themes,
  size,
  onPlanetTap,
  animateOnMount,
  centerInitial,
}: Props) {
  const { tokens, resolved } = useTheme();

  const visibleThemes = themes.slice(0, MAX_PLANETS);
  const slotConfigs = getSlotsForCount(visibleThemes.length);

  // Max mentionCount across the visible set — used to scale planet
  // sizes data-relatively. When ties exist (all themes at the same
  // mention count) every planet renders at MAX_PLANET_SIZE.
  const maxMentionCount = useMemo(
    () =>
      visibleThemes.reduce(
        (max, t) => (t.mentionCount > max ? t.mentionCount : max),
        0
      ),
    [visibleThemes]
  );

  // Compute final slot positions + starting angles (target - 90°).
  // Size is now per-theme (driven by mentionCount, not slot index).
  const slots = useMemo(
    () =>
      slotConfigs.map((cfg, i) => {
        const targetRad = (cfg.angle * Math.PI) / 180;
        const startAngleDeg = cfg.angle - 90;
        const startRad = (startAngleDeg * Math.PI) / 180;
        const r = RING_RADII[cfg.ring];
        const theme = visibleThemes[i];
        const size = theme
          ? sizeForMentionCount(theme.mentionCount, maxMentionCount)
          : MIN_PLANET_SIZE;
        return {
          ...cfg,
          size,
          startRad,
          targetRad,
          finalX: CX + Math.cos(targetRad) * r,
          finalY: CY + Math.sin(targetRad) * r,
          ringRadius: r,
        };
      }),
    // slots depend on count + the data-driven sizes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleThemes.length, maxMentionCount]
  );

  // Shared values — declared up-front for stable hook order regardless
  // of how many planets actually render. Unused slots stay at init.
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
  const planetProgress = [p0, p1, p2, p3, p4, p5];

  useEffect(() => {
    if (!animateOnMount) return;
    sunP.value = withTiming(1, {
      duration: SUN_DURATION_MS,
      easing: EASE_OUT_CUBIC,
    });
    ringP.value = withDelay(
      600,
      withTiming(1, { duration: RING_DURATION_MS, easing: EASE_OUT_CUBIC })
    );
    slots.forEach((slot, i) => {
      planetProgress[i].value = withDelay(
        slot.delay,
        withTiming(1, { duration: SPIN_DURATION_MS, easing: EASE_OUT_CUBIC })
      );
    });
    lineP.value = withDelay(
      4000,
      withTiming(1, { duration: LINE_DURATION_MS, easing: EASE_OUT_CUBIC })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateOnMount]);

  // 6 inline useAnimatedProps for planet positions. Unused ones (when
  // n<6) reference shared values that stay at init — no visible output
  // because their parent <G> doesn't render.
  const planet0Props = useAnimatedProps(() => {
    const t = p0.value;
    const s = slots[0];
    if (!s) return { cx: CX, cy: CY, opacity: 0 };
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return {
      cx: CX + Math.cos(a) * s.ringRadius,
      cy: CY + Math.sin(a) * s.ringRadius,
      opacity: t,
    };
  });
  const planet1Props = useAnimatedProps(() => {
    const t = p1.value;
    const s = slots[1];
    if (!s) return { cx: CX, cy: CY, opacity: 0 };
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return {
      cx: CX + Math.cos(a) * s.ringRadius,
      cy: CY + Math.sin(a) * s.ringRadius,
      opacity: t,
    };
  });
  const planet2Props = useAnimatedProps(() => {
    const t = p2.value;
    const s = slots[2];
    if (!s) return { cx: CX, cy: CY, opacity: 0 };
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return {
      cx: CX + Math.cos(a) * s.ringRadius,
      cy: CY + Math.sin(a) * s.ringRadius,
      opacity: t,
    };
  });
  const planet3Props = useAnimatedProps(() => {
    const t = p3.value;
    const s = slots[3];
    if (!s) return { cx: CX, cy: CY, opacity: 0 };
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return {
      cx: CX + Math.cos(a) * s.ringRadius,
      cy: CY + Math.sin(a) * s.ringRadius,
      opacity: t,
    };
  });
  const planet4Props = useAnimatedProps(() => {
    const t = p4.value;
    const s = slots[4];
    if (!s) return { cx: CX, cy: CY, opacity: 0 };
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return {
      cx: CX + Math.cos(a) * s.ringRadius,
      cy: CY + Math.sin(a) * s.ringRadius,
      opacity: t,
    };
  });
  const planet5Props = useAnimatedProps(() => {
    const t = p5.value;
    const s = slots[5];
    if (!s) return { cx: CX, cy: CY, opacity: 0 };
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return {
      cx: CX + Math.cos(a) * s.ringRadius,
      cy: CY + Math.sin(a) * s.ringRadius,
      opacity: t,
    };
  });
  const planetAnimatedProps = [
    planet0Props,
    planet1Props,
    planet2Props,
    planet3Props,
    planet4Props,
    planet5Props,
  ];

  const label0Props = useAnimatedProps(() => ({ opacity: p0.value * p0.value }));
  const label1Props = useAnimatedProps(() => ({ opacity: p1.value * p1.value }));
  const label2Props = useAnimatedProps(() => ({ opacity: p2.value * p2.value }));
  const label3Props = useAnimatedProps(() => ({ opacity: p3.value * p3.value }));
  const label4Props = useAnimatedProps(() => ({ opacity: p4.value * p4.value }));
  const label5Props = useAnimatedProps(() => ({ opacity: p5.value * p5.value }));
  const labelAnimatedProps = [
    label0Props,
    label1Props,
    label2Props,
    label3Props,
    label4Props,
    label5Props,
  ];

  const sunAnimatedProps = useAnimatedProps(() => ({ opacity: sunP.value }));
  const ringAnimatedProps = useAnimatedProps(() => ({ opacity: ringP.value }));
  const lineAnimatedProps = useAnimatedProps(() => ({
    opacity: lineP.value * 0.6,
  }));

  const ringStrokeColor = tokens.primary;
  const sunStrokeAccent =
    resolved === "dark" ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.85)";
  const sunFrameStroke =
    resolved === "dark" ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";

  return (
    <View style={{ width: size, height: (size * VIEWBOX_H) / VIEWBOX_W }}>
      <Svg
        width={size}
        height={(size * VIEWBOX_H) / VIEWBOX_W}
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      >
        <Defs>
          <RadialGradient id="tm-you-glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={tokens.primary} stopOpacity="0.45" />
            <Stop offset="100%" stopColor={tokens.primary} stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id="tm-you-body" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={tokens.primary} />
            <Stop offset="100%" stopColor={tokens.secondary} />
          </LinearGradient>
          {visibleThemes.map((theme, i) => (
            <RadialGradient
              key={`planet-grad-${i}`}
              id={`planet-grad-${i}`}
              cx="50%"
              cy="50%"
              r="60%"
            >
              {/* Phase E polish 2: tighter lightness range + centered
                  origin. No directional highlight — reads as a flat
                  colored disc with subtle atmospheric depth, not a 3D
                  marble. */}
              <Stop offset="0%" stopColor={`hsl(${theme.hue}, 65%, 62%)`} />
              <Stop offset="100%" stopColor={`hsl(${theme.hue}, 65%, 52%)`} />
            </RadialGradient>
          ))}
        </Defs>

        {/* Ring guides — only render the rings actually in use plus the
            next one out as a guide hint. Keeps the cosmos visually
            anchored without showing empty rings for low-theme-count
            users. */}
        <AnimatedG animatedProps={ringAnimatedProps}>
          {RING_RADII.map((r, i) => {
            // Show rings up to the outermost in-use ring + 1 (or the
            // first if no planets render).
            const maxRingInUse = slots.reduce(
              (max, s) => Math.max(max, s.ring),
              -1
            );
            if (i > maxRingInUse + 1) return null;
            return (
              <Circle
                key={`ring-${i}`}
                cx={CX}
                cy={CY}
                r={r}
                fill="none"
                stroke={ringStrokeColor}
                strokeOpacity={0.18}
                strokeWidth={0.8}
                strokeDasharray={i === 0 ? undefined : "4 4"}
              />
            );
          })}
        </AnimatedG>

        {/* Dashed connector lines */}
        <AnimatedG animatedProps={lineAnimatedProps}>
          {visibleThemes.map((theme, i) => {
            const slot = slots[i];
            if (!slot) return null;
            return (
              <Line
                key={`line-${i}`}
                x1={CX}
                y1={CY}
                x2={slot.finalX}
                y2={slot.finalY}
                stroke={`hsl(${theme.hue}, 55%, 60%)`}
                strokeOpacity={0.35}
                strokeWidth={0.7}
                strokeDasharray="1.5 3"
              />
            );
          })}
        </AnimatedG>

        {/* Center sun */}
        <AnimatedG animatedProps={sunAnimatedProps}>
          <Circle cx={CX} cy={CY} r={40} fill="url(#tm-you-glow)" />
          <Circle
            cx={CX}
            cy={CY}
            r={26}
            fill="none"
            stroke={sunFrameStroke}
            strokeWidth={0.6}
            strokeDasharray="2 4"
          />
          <Circle
            cx={CX}
            cy={CY}
            r={20}
            fill="url(#tm-you-body)"
            stroke={sunStrokeAccent}
            strokeWidth={1.5}
          />
          <SvgText
            x={CX}
            y={CY + 6}
            textAnchor="middle"
            fontSize={17}
            fontWeight="800"
            fill="#FFFFFF"
            fontFamily={tokens.fontDisplay}
            letterSpacing={-0.4}
          >
            {centerInitial ?? "•"}
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
            YOU
          </SvgText>
        </AnimatedG>

        {/* Planets + labels with 2-line wrap support */}
        {visibleThemes.map((theme, i) => {
          const slot = slots[i];
          if (!slot) return null;
          const planetR = slot.size / 2;
          const wrapped = wrapLabel(theme.name);
          // Vertical layout: line1 below planet, line2 below line1
          // (if present), count below the last line.
          const labelY = slot.finalY + planetR + 13; // line1 baseline
          const line2Y = labelY + 11;
          const countY = wrapped.line2 ? line2Y + 11 : labelY + 11;

          return (
            <G key={`planet-g-${i}`} onPress={() => onPlanetTap(theme)}>
              <AnimatedCircle
                animatedProps={planetAnimatedProps[i]}
                r={planetR}
                fill={`url(#planet-grad-${i})`}
              />
              <AnimatedG animatedProps={labelAnimatedProps[i]}>
                <SvgText
                  x={slot.finalX}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight="600"
                  fill={tokens.textSec}
                  fillOpacity={0.85}
                  fontFamily={tokens.fontMono}
                  letterSpacing={0.4}
                >
                  <TSpan>{wrapped.line1}</TSpan>
                  {wrapped.line2 && (
                    <TSpan x={slot.finalX} dy={11}>
                      {wrapped.line2}
                    </TSpan>
                  )}
                </SvgText>
                <SvgText
                  x={slot.finalX}
                  y={countY}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight="600"
                  fill={tokens.textTer}
                  fontFamily={tokens.fontMono}
                  letterSpacing={0.8}
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
