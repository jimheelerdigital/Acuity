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
 * OrbitalCosmos — Phase E rebuild (2026-05-21).
 *
 * Design spec: _design/design_handoff_acuity_v2/screen-thememap.jsx.
 * Motion spec: _design/design_handoff_acuity_v2/motion-gallery.jsx
 * "Theme map solar-system entrance" (6.0s easeInOutCubic staggered).
 *
 * ─── Geometry (iPhone 16e 375pt) ──────────────────────────────────────
 *   viewBox 0 0 402 360 (design spec fidelity).
 *   Render scale: 375 / 402 ≈ 0.933×.
 *   Center: (CX=201, CY=180). Ring radii: [78, 110, 140, 168].
 *   9 slots, distribution 2/2/3/2 across rings, sizes 52→20 inside-out.
 *
 *   Slot positions (per design fixtures — angle/size hardcoded):
 *     0: ring 0  angle 30°   size 52  → (268, 219)
 *     1: ring 0  angle 200°  size 46  → (128, 153)
 *     2: ring 1  angle 130°  size 40  → (130, 264)
 *     3: ring 1  angle 320°  size 34  → (285, 109)
 *     4: ring 2  angle 80°   size 30  → (225, 318)
 *     5: ring 2  angle 230°  size 28  → (111, 73)
 *     6: ring 2  angle 350°  size 26  → (339, 156)
 *     7: ring 3  angle 200°  size 22  → (43, 122)
 *     8: ring 3  angle 310°  size 20  → (309, 51)
 *
 * ─── Label budget at iPhone 16e ───────────────────────────────────────
 *   Labels render in tokens.fontMono fontSize 11, textSec @ 0.85
 *   opacity, centered (textAnchor="middle") below each planet. In
 *   monospace, ~6.5pt per char at fontSize 11 in viewBox units; at the
 *   0.933× screen scale, ~6.06pt per char. Label half-width budget:
 *     - Edge slots (3, 6, 7, 8) sit close to SVG vertical edges. Slot
 *       7 at x=43 means worst-case left clearance is 43pt in viewBox.
 *       A 13-char label = 84.5pt wide / 42pt half — exceeds the 43pt
 *       budget on the left and clips. Same risk on slot 6 at right.
 *     - Mitigation: any label > 10 chars truncates to 10 + ellipsis
 *       ("Relationships" → "Relationsh…"). Applied uniformly so the
 *       longest in-use names ("Relationships", "Avoidance") never
 *       clip regardless of which slot they land at.
 *   Vertical: bottommost label (slot 4 at y=318, planet r=15, label
 *   baseline at 347) sits 13pt above viewBox bottom — fine.
 *
 * ─── Planet treatment — FLAT, not 3D ──────────────────────────────────
 *   Two-stop RadialGradient with off-center origin (cx=35%, cy=35%).
 *   No inset shadows, no specular highlight, no box-shadow glow.
 *   Atmospheric-textbook-planet feel, not glossy 3D button.
 *   Stop 0 — hsl(${hue} 65% 72%): the lit edge.
 *   Stop 1 — hsl(${hue} 65% 48%): the shaded edge.
 *
 * ─── Motion — SPIN-IN ────────────────────────────────────────────────
 *   Each planet starts at its target ring radius (NOT 1.45× per the
 *   web design's spiral-in — Jim's directive overrides that), with
 *   starting angle = target − 90°. Rotates +90° over 1.2s with
 *   Easing.out(Easing.cubic), opacity 0→1 in lockstep. Stagger 0.15s
 *   between slots; last planet's animation ends ~4.5s in.
 *
 *   Choreography:
 *     T=0.0-0.6s   Center sun + halo fade in
 *     T=0.6-1.8s   Ring guides cascade in (4 rings, all together)
 *     T=1.5s+      Planet 0 starts (1.5→2.7s)
 *     T=1.65s+     Planet 1 (1.65→2.85s)
 *     T=1.80s+     Planet 2 (1.80→3.00s)
 *     ... +0.15s per slot ...
 *     T=2.70s+     Planet 8 (2.70→3.90s)
 *     T=4.0-4.8s   Connector lines fade to 0.7 opacity
 *   Total: ~4.8s (under 6s by design — solar-system feel without dragging)
 *
 * `animateOnMount={false}` snaps to final state with no entrance.
 */

interface SlotConfig {
  ring: number;
  angle: number;
  size: number;
  delay: number;
}

const SLOT_CONFIGS: SlotConfig[] = [
  { ring: 0, angle: 30, size: 52, delay: 1500 },
  { ring: 0, angle: 200, size: 46, delay: 1650 },
  { ring: 1, angle: 130, size: 40, delay: 1800 },
  { ring: 1, angle: 320, size: 34, delay: 1950 },
  { ring: 2, angle: 80, size: 30, delay: 2100 },
  { ring: 2, angle: 230, size: 28, delay: 2250 },
  { ring: 2, angle: 350, size: 26, delay: 2400 },
  { ring: 3, angle: 200, size: 22, delay: 2550 },
  { ring: 3, angle: 310, size: 20, delay: 2700 },
];

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

function truncateLabel(label: string, max = 10): string {
  if (label.length <= max) return label;
  return label.slice(0, max) + "…";
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

  const visibleThemes = themes.slice(0, 9);

  // Compute final slot positions + starting angles (target - 90°).
  const slots = useMemo(
    () =>
      SLOT_CONFIGS.map((cfg) => {
        const targetRad = (cfg.angle * Math.PI) / 180;
        const startAngleDeg = cfg.angle - 90;
        const startRad = (startAngleDeg * Math.PI) / 180;
        const r = RING_RADII[cfg.ring];
        return {
          ...cfg,
          startRad,
          targetRad,
          finalX: CX + Math.cos(targetRad) * r,
          finalY: CY + Math.sin(targetRad) * r,
          ringRadius: r,
        };
      }),
    []
  );

  // Per-planet shared progress (0→1 over the planet's spin-in).
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
      duration: SUN_DURATION_MS,
      easing: EASE_OUT_CUBIC,
    });
    ringP.value = withDelay(
      600,
      withTiming(1, {
        duration: RING_DURATION_MS,
        easing: EASE_OUT_CUBIC,
      })
    );
    slots.forEach((slot, i) => {
      planetProgress[i].value = withDelay(
        slot.delay,
        withTiming(1, {
          duration: SPIN_DURATION_MS,
          easing: EASE_OUT_CUBIC,
        })
      );
    });
    lineP.value = withDelay(
      4000,
      withTiming(1, { duration: LINE_DURATION_MS, easing: EASE_OUT_CUBIC })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateOnMount]);

  // Per-planet animated props — interpolate the angle from start to
  // target, compute cx/cy from polar coordinates on the UI thread.
  // 9 inline useAnimatedProps calls (one per slot) so React's hooks
  // order stays deterministic across renders. Each closure captures
  // its own shared value + slot index.
  const planet0Props = useAnimatedProps(() => {
    const t = p0.value;
    const s = slots[0];
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return { cx: CX + Math.cos(a) * s.ringRadius, cy: CY + Math.sin(a) * s.ringRadius, opacity: t };
  });
  const planet1Props = useAnimatedProps(() => {
    const t = p1.value;
    const s = slots[1];
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return { cx: CX + Math.cos(a) * s.ringRadius, cy: CY + Math.sin(a) * s.ringRadius, opacity: t };
  });
  const planet2Props = useAnimatedProps(() => {
    const t = p2.value;
    const s = slots[2];
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return { cx: CX + Math.cos(a) * s.ringRadius, cy: CY + Math.sin(a) * s.ringRadius, opacity: t };
  });
  const planet3Props = useAnimatedProps(() => {
    const t = p3.value;
    const s = slots[3];
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return { cx: CX + Math.cos(a) * s.ringRadius, cy: CY + Math.sin(a) * s.ringRadius, opacity: t };
  });
  const planet4Props = useAnimatedProps(() => {
    const t = p4.value;
    const s = slots[4];
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return { cx: CX + Math.cos(a) * s.ringRadius, cy: CY + Math.sin(a) * s.ringRadius, opacity: t };
  });
  const planet5Props = useAnimatedProps(() => {
    const t = p5.value;
    const s = slots[5];
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return { cx: CX + Math.cos(a) * s.ringRadius, cy: CY + Math.sin(a) * s.ringRadius, opacity: t };
  });
  const planet6Props = useAnimatedProps(() => {
    const t = p6.value;
    const s = slots[6];
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return { cx: CX + Math.cos(a) * s.ringRadius, cy: CY + Math.sin(a) * s.ringRadius, opacity: t };
  });
  const planet7Props = useAnimatedProps(() => {
    const t = p7.value;
    const s = slots[7];
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return { cx: CX + Math.cos(a) * s.ringRadius, cy: CY + Math.sin(a) * s.ringRadius, opacity: t };
  });
  const planet8Props = useAnimatedProps(() => {
    const t = p8.value;
    const s = slots[8];
    const a = s.startRad + (s.targetRad - s.startRad) * t;
    return { cx: CX + Math.cos(a) * s.ringRadius, cy: CY + Math.sin(a) * s.ringRadius, opacity: t };
  });
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

  // Labels — quadratic-eased opacity so they pop in ~half-way through
  // the planet's spin, settling with the planet's arrival.
  const label0Props = useAnimatedProps(() => ({ opacity: p0.value * p0.value }));
  const label1Props = useAnimatedProps(() => ({ opacity: p1.value * p1.value }));
  const label2Props = useAnimatedProps(() => ({ opacity: p2.value * p2.value }));
  const label3Props = useAnimatedProps(() => ({ opacity: p3.value * p3.value }));
  const label4Props = useAnimatedProps(() => ({ opacity: p4.value * p4.value }));
  const label5Props = useAnimatedProps(() => ({ opacity: p5.value * p5.value }));
  const label6Props = useAnimatedProps(() => ({ opacity: p6.value * p6.value }));
  const label7Props = useAnimatedProps(() => ({ opacity: p7.value * p7.value }));
  const label8Props = useAnimatedProps(() => ({ opacity: p8.value * p8.value }));
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

  const sunAnimatedProps = useAnimatedProps(() => ({ opacity: sunP.value }));
  const ringAnimatedProps = useAnimatedProps(() => ({ opacity: ringP.value }));
  const lineAnimatedProps = useAnimatedProps(() => ({
    opacity: lineP.value * 0.6,
  }));

  // Ring stroke — palette-primary at strokeOpacity 0.18. Setting via
  // separate attribute (not hex+alpha suffix) so token-format changes
  // don't silently break the look.
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
          {/* Center sun halo */}
          <RadialGradient id="tm-you-glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={tokens.primary} stopOpacity="0.45" />
            <Stop offset="100%" stopColor={tokens.primary} stopOpacity="0" />
          </RadialGradient>
          {/* Center sun body */}
          <LinearGradient id="tm-you-body" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={tokens.primary} />
            <Stop offset="100%" stopColor={tokens.secondary} />
          </LinearGradient>
          {/* Per-planet flat 2-stop radial gradient.
              cx=35%, cy=35% gives subtle directional shading without
              creating a glossy specular highlight. */}
          {visibleThemes.map((theme, i) => (
            <RadialGradient
              key={`planet-grad-${i}`}
              id={`planet-grad-${i}`}
              cx="35%"
              cy="35%"
              r="65%"
            >
              <Stop offset="0%" stopColor={`hsl(${theme.hue}, 65%, 72%)`} />
              <Stop offset="100%" stopColor={`hsl(${theme.hue}, 65%, 48%)`} />
            </RadialGradient>
          ))}
        </Defs>

        {/* Ring guides — palette-tinted, faint, dashed "4 4". Ring 0
            stays solid (innermost frames the center sun). */}
        <AnimatedG animatedProps={ringAnimatedProps}>
          {RING_RADII.map((r, i) => (
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
          ))}
        </AnimatedG>

        {/* Dashed connector lines (center → each planet). Fade in last. */}
        <AnimatedG animatedProps={lineAnimatedProps}>
          {visibleThemes.map((theme, i) => {
            const slot = slots[i];
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

        {/* Center sun — halo + dashed outer frame + gradient body +
            initial. NO "CENTER" debug text; spec shows "YOU" mono
            caption only. */}
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

        {/* Planets + labels. Each planet wrapped in <G onPress> so the
            tap target covers planet + label. */}
        {visibleThemes.map((theme, i) => {
          const slot = slots[i];
          const planetR = slot.size / 2;
          // Label position: centered below the planet's FINAL position.
          // Gaps tightened to 11pt + 11pt to keep slot 4 (the
          // bottommost, y=318+r=15) within viewBox bottom 360:
          //   labelY = 318 + 15 + 11 = 344
          //   countY = 344 + 11 = 355  (glyph descender ~358, 2pt margin)
          // Labels fade in via opacity (slot's progress squared) so they
          // pop in after the planet settles. They don't move during the
          // spin — only the planet body does.
          const labelY = slot.finalY + planetR + 11;
          const countY = labelY + 11;
          const labelText = truncateLabel(theme.name, 10);

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
                  {labelText}
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
