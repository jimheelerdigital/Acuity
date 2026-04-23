import { Fragment, useEffect, useState } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  Line,
  RadialGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";

/**
 * Mobile constellation with orbital entrance — Reanimated 3 port of
 * the web CSS-keyframe animation in apps/web/src/components/theme-map/
 * Constellation.tsx. Every timing value is mirrored one-to-one with
 * the web file; search by number below if you need to re-tune.
 *
 * Structure (viewBox 0 0 350 280, hero at 175,140):
 *   - Hero fall (1s @ 200ms, cubic-bezier(0.22, 1, 0.36, 1))
 *   - 5 planet orbital sweeps (3.2-3.8s, staggered 0.6-2.2s,
 *     cubic-bezier(0.33, 0, 0.15, 1), 1.5 revolutions each)
 *   - 5 label fades (staggered 4.0-5.8s)
 *   - 4 connection-line draws (6.2-6.8s, stroke-dashoffset + opacity)
 *   - Legend fade at 7.0s
 *   - Continuous loops start at 7s: hero breathe (4s), ripple ring
 *     (3s), planet breathe (4.5s)
 *
 * Animation strategy:
 *   - Per-planet `progress` shared value 0→1 drives both cx/cy via
 *     polar math (angle + radius interpolated) and opacity.
 *   - Single `master` shared value 0→8000ms drives labels, lines,
 *     legend — cheap staggered fades via interpolate(master, [t,t+dur]).
 *   - Hero has its own `heroProgress`. Core `r` multiplies with
 *     `heroBreathe`. Ripple circle has its own `ripple` loop.
 *   - Planet cores multiply their `r` with `planetBreathe` (shared
 *     across all 5 — one loop, five visual effects).
 *
 * Reduced motion: AccessibilityInfo check on mount + on change. When
 * enabled, every shared value snaps to its end state — no timing,
 * no loops, no entrance. Planets render at landed positions.
 *
 * Replay: `replayToken` prop from parent triggers a re-run of the
 * entrance timeline when it changes (e.g. user taps a different time
 * chip and the parent re-fetches + bumps the token).
 */

type SentimentTone = "positive" | "challenging" | "neutral";

export type ConstellationTheme = {
  id: string;
  name: string;
  tone: SentimentTone;
};

// react-native-svg's generic component types don't line up perfectly
// with Reanimated's createAnimatedComponent signature — known upstream
// typing gap. Cast through `any` at construction to avoid a per-prop
// type workaround at every call site.
/* eslint-disable @typescript-eslint/no-explicit-any */
const AnimatedCircle: any = Animated.createAnimatedComponent(Circle as any);
const AnimatedLine: any = Animated.createAnimatedComponent(Line as any);
const AnimatedText: any = Animated.createAnimatedComponent(SvgText as any);
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Positions + sizes (verbatim from web spec) ─────────────────────────
const HERO_CX = 175;
const HERO_CY = 140;

type Slot = {
  x: number;
  y: number;
  halo: number;
  core: number;
  glow: boolean;
  startAngle: number;
  endAngle: number;
  startRadius: number;
  endRadius: number;
  duration: number;
  delay: number;
};

const SLOTS: Slot[] = [
  {
    x: 85,
    y: 80,
    halo: 40,
    core: 22,
    glow: true,
    startAngle: 0,
    endAngle: 394,
    startRadius: 180,
    endRadius: 108,
    duration: 3200,
    delay: 600,
  },
  {
    x: 280,
    y: 80,
    halo: 35,
    core: 20,
    glow: true,
    startAngle: 60,
    endAngle: 510,
    startRadius: 180,
    endRadius: 121,
    duration: 3400,
    delay: 1000,
  },
  {
    x: 85,
    y: 210,
    halo: 30,
    core: 16,
    glow: true,
    startAngle: -90,
    endAngle: 322,
    startRadius: 180,
    endRadius: 114,
    duration: 3600,
    delay: 1400,
  },
  {
    x: 280,
    y: 210,
    halo: 28,
    core: 14,
    glow: false,
    startAngle: 180,
    endAngle: 574,
    startRadius: 180,
    endRadius: 126,
    duration: 3800,
    delay: 1800,
  },
  {
    x: 175,
    y: 40,
    halo: 24,
    core: 12,
    glow: false,
    startAngle: 120,
    endAngle: 450,
    startRadius: 170,
    endRadius: 100,
    duration: 3400,
    delay: 2200,
  },
];

// Label fade delays + duration (ms).
const LABEL_DELAYS = [4000, 4600, 5200, 5800, 5800] as const;
const LABEL_DURATION = 500;

// Line draw delays + duration (ms).
const LINE_DELAYS = [6200, 6400, 6600, 6800] as const;
const LINE_DURATION = 800;

// Precomputed line lengths, hero→slot Euclidean distance.
const LINE_LENGTHS = SLOTS.slice(0, 4).map((s) =>
  Math.hypot(s.x - HERO_CX, s.y - HERO_CY)
);

// Legend fade.
const LEGEND_DELAY = 7000;
const LEGEND_DURATION = 600;

// Easings.
const HERO_EASE = Easing.bezier(0.22, 1, 0.36, 1);
const PLANET_EASE = Easing.bezier(0.33, 0, 0.15, 1);

// Loop cadences (ms).
const HERO_BREATHE_HALF = 2000; // 4s full cycle, symmetric
const PLANET_BREATHE_HALF = 2250; // 4.5s full cycle
const RIPPLE_DURATION = 3000;
const LOOP_DELAY = 7000;

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
  replayToken = 0,
}: {
  hero: { id: string; name: string };
  planets: ConstellationTheme[];
  onTapHero?: () => void;
  onTapPlanet?: (id: string) => void;
  /** Bumped by the parent to trigger an entrance replay (e.g. when the
   *  time-window chip changes and new data arrives). */
  replayToken?: number | string;
}) {
  const placed = planets.slice(0, 5);

  // ── Reduce-motion detection ──────────────────────────────────────────
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

  // ── Shared values ────────────────────────────────────────────────────
  const heroProgress = useSharedValue(0);
  const p1 = useSharedValue(0);
  const p2 = useSharedValue(0);
  const p3 = useSharedValue(0);
  const p4 = useSharedValue(0);
  const p5 = useSharedValue(0);
  const planetProgresses = [p1, p2, p3, p4, p5];
  const master = useSharedValue(0); // 0 → 8000ms, drives labels/lines/legend
  const heroBreathe = useSharedValue(1);
  const planetBreathe = useSharedValue(1);
  const ripple = useSharedValue(0);

  // ── Drive the timeline on mount + replay ─────────────────────────────
  useEffect(() => {
    // Snap-to-end for reduce motion. No further work.
    if (reduceMotion) {
      heroProgress.value = 1;
      planetProgresses.forEach((sv) => {
        sv.value = 1;
      });
      master.value = 8000;
      heroBreathe.value = 1;
      planetBreathe.value = 1;
      ripple.value = 0; // ripple off in reduce-motion mode
      return;
    }

    // Reset everything to 0 so replay actually replays.
    heroProgress.value = 0;
    planetProgresses.forEach((sv) => {
      sv.value = 0;
    });
    master.value = 0;
    heroBreathe.value = 1;
    planetBreathe.value = 1;
    ripple.value = 0;

    // Hero fall: 1s at 200ms.
    heroProgress.value = withDelay(
      200,
      withTiming(1, { duration: 1000, easing: HERO_EASE })
    );

    // Planet orbital sweeps.
    SLOTS.forEach((slot, i) => {
      planetProgresses[i].value = withDelay(
        slot.delay,
        withTiming(1, {
          duration: slot.duration,
          easing: PLANET_EASE,
        })
      );
    });

    // Master clock — linear 0 → 8000ms. Drives everything keyed off
    // absolute time (labels, lines, legend).
    master.value = withTiming(8000, {
      duration: 8000,
      easing: Easing.linear,
    });

    // Continuous loops after entrance completes (7s delay).
    heroBreathe.value = withDelay(
      LOOP_DELAY,
      withRepeat(
        withSequence(
          withTiming(1.07, {
            duration: HERO_BREATHE_HALF,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, {
            duration: HERO_BREATHE_HALF,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        false
      )
    );
    planetBreathe.value = withDelay(
      LOOP_DELAY,
      withRepeat(
        withSequence(
          withTiming(1.1, {
            duration: PLANET_BREATHE_HALF,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, {
            duration: PLANET_BREATHE_HALF,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        false
      )
    );
    // Ripple: r 32 → 62, opacity 0.5 → 0. Represented as 0→1 so the
    // render reads interpolate(ripple, [0,1], [32,62]) etc. Non-reverse
    // repeat so each cycle starts fresh at r=32.
    ripple.value = withDelay(
      LOOP_DELAY,
      withRepeat(
        withTiming(1, {
          duration: RIPPLE_DURATION,
          easing: Easing.out(Easing.ease),
        }),
        -1,
        false
      )
    );

    // Cancellation — Reanimated cancels running animations when a
    // shared value is reassigned, so the "reset to 0" above handles
    // replay. On unmount, RN GCs the hook-owned values.
    return () => {
      cancelAnimation(heroProgress);
      planetProgresses.forEach((sv) => cancelAnimation(sv));
      cancelAnimation(master);
      cancelAnimation(heroBreathe);
      cancelAnimation(planetBreathe);
      cancelAnimation(ripple);
    };
    // planetProgresses is a stable array of refs; we intentionally don't
    // add every shared value to deps to avoid re-running the timeline
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, replayToken]);

  // ── Hero animated props ──────────────────────────────────────────────
  // Halo: entrance only (ty + scale on r), no breathing.
  const haloProps = useAnimatedProps(() => {
    const p = heroProgress.value;
    const ty = interpolate(p, [0, 0.8, 1], [-180, 0, 0]);
    const s = interpolate(p, [0, 0.8, 1], [0.4, 1.1, 1]);
    const op = interpolate(p, [0, 0.6, 1], [0, 0.7, 0.7]);
    return {
      cx: HERO_CX,
      cy: HERO_CY + ty,
      r: 55 * s,
      opacity: op,
    };
  });

  // Core: entrance + breathing.
  const coreProps = useAnimatedProps(() => {
    const p = heroProgress.value;
    const ty = interpolate(p, [0, 0.8, 1], [-180, 0, 0]);
    const s = interpolate(p, [0, 0.8, 1], [0.4, 1.1, 1]);
    const op = interpolate(p, [0, 0.6, 1], [0, 1, 1]);
    return {
      cx: HERO_CX,
      cy: HERO_CY + ty,
      r: 32 * s * heroBreathe.value,
      opacity: op,
    };
  });

  // Hero text — moves with the core, fades with the entrance.
  const heroTextProps = useAnimatedProps(() => {
    const p = heroProgress.value;
    const ty = interpolate(p, [0, 0.8, 1], [-180, 0, 0]);
    const op = interpolate(p, [0, 0.6, 1], [0, 1, 1]);
    return {
      x: HERO_CX,
      y: HERO_CY + 4 + ty,
      opacity: op,
    };
  });

  // Ripple ring — continuous loop after entrance.
  const rippleProps = useAnimatedProps(() => {
    const v = ripple.value;
    return {
      cx: HERO_CX,
      cy: HERO_CY,
      r: interpolate(v, [0, 1], [32, 62]),
      opacity: interpolate(v, [0, 1], [0.5, 0]),
    };
  });

  // ── Legend fade (outside SVG) ────────────────────────────────────────
  const legendStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      master.value,
      [LEGEND_DELAY, LEGEND_DELAY + LEGEND_DURATION],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginVertical: 20,
        padding: 16,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(124,58,237,0.05)",
      }}
    >
      <Svg
        // Expanded viewBox: the orbital entrance animation starts each
        // planet at startRadius ≈ 180px from the hero (175, 140),
        // which extends well outside the old 350×280 bounds. Expanding
        // -40 -40 to 430×360 shows the full arc without clipping;
        // preserveAspectRatio (default xMidYMid meet) scales the whole
        // viewBox uniformly so the landed composition stays centered.
        viewBox="-40 -40 430 360"
        width="100%"
        height={340}
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

        {/* Connection lines — hero → first 4 placed planets. Lengths
            are hardcoded per slot so strokeDasharray can interpolate
            without measuring at runtime. */}
        {placed.slice(0, 4).map((_, i) => (
          <LineDraw
            key={`line-${i}`}
            index={i}
            master={master}
            reduceMotion={reduceMotion}
            x2={SLOTS[i].x}
            y2={SLOTS[i].y}
            length={LINE_LENGTHS[i]}
          />
        ))}

        {/* Ripple ring — behind the hero core. Rendered only when
            planets have been placed so the first reveal isn't ruined. */}
        <AnimatedCircle
          animatedProps={rippleProps}
          fill="none"
          stroke="#7C3AED"
          strokeWidth={1.5}
        />

        {/* Hero halo */}
        <AnimatedCircle animatedProps={haloProps} fill="url(#heroHalo)" />

        {/* Hero core */}
        <AnimatedCircle
          animatedProps={coreProps}
          fill="#7C3AED"
          onPress={onTapHero}
        />

        {/* Hero text — uppercase, no truncation. Old 10-char truncate
            left labels like "commute frict..." mid-word; relying on
            the hero name being short in practice + letting long ones
            overflow the core is the lesser evil visually. */}
        <AnimatedText
          animatedProps={heroTextProps}
          textAnchor="middle"
          fontSize={11}
          fontWeight="700"
          fill="#FFFFFF"
        >
          {(hero.name ?? "").toUpperCase()}
        </AnimatedText>

        {/* Planets — halo + core + label. Each handled by a small
            sub-component so each planet owns its own useAnimatedProps
            hook (required: hooks can't be called in a loop body
            directly but can be per-instance inside a child). */}
        {placed.map((p, i) => (
          <Fragment key={p.id}>
            <Planet
              index={i}
              slot={SLOTS[i]}
              tone={p.tone}
              progress={planetProgresses[i]}
              planetBreathe={planetBreathe}
              master={master}
              name={p.name}
              onPress={onTapPlanet ? () => onTapPlanet(p.id) : undefined}
            />
          </Fragment>
        ))}
      </Svg>

      {/* Legend — outside the SVG so it can use RN Animated.View */}
      <Animated.View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 20,
            marginTop: 8,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: "rgba(148,163,184,0.25)",
          },
          legendStyle,
        ]}
      >
        <LegendDot color="#F87171" label="Challenging" glow />
        <LegendDot color="#94a3b8" label="Neutral" />
        <LegendDot color="#34D399" label="Positive" glow />
      </Animated.View>
    </View>
  );
}

/**
 * One planet = halo circle + core circle + label text. Each animated
 * from the same `progress` shared value via polar math. The core
 * additionally multiplies its radius with `planetBreathe` so all 5
 * planets share a single breathing loop.
 */
function Planet({
  index,
  slot,
  tone,
  progress,
  planetBreathe,
  master,
  name,
  onPress,
}: {
  index: number;
  slot: Slot;
  tone: SentimentTone;
  progress: SharedValue<number>;
  planetBreathe: SharedValue<number>;
  master: SharedValue<number>;
  name: string;
  onPress?: () => void;
}) {
  const labelDelay = LABEL_DELAYS[index];
  const isTop = index === 4; // planet E: label above instead of below
  const labelFontSize = index <= 1 ? 11 : 10;
  const labelColor = index <= 1 ? LABEL_FULL : LABEL_DIM;

  // Shared per-frame polar math.
  const haloProps = useAnimatedProps(() => {
    const p = progress.value;
    const angle = interpolate(p, [0, 1], [slot.startAngle, slot.endAngle]);
    const radius = interpolate(p, [0, 1], [slot.startRadius, slot.endRadius]);
    const rad = (angle * Math.PI) / 180;
    const cx = HERO_CX + radius * Math.cos(rad);
    const cy = HERO_CY + radius * Math.sin(rad);
    const op = interpolate(p, [0, 0.12, 1], [0, 0.8, 0.8]);
    return { cx, cy, r: slot.halo, opacity: op };
  });

  const coreProps = useAnimatedProps(() => {
    const p = progress.value;
    const angle = interpolate(p, [0, 1], [slot.startAngle, slot.endAngle]);
    const radius = interpolate(p, [0, 1], [slot.startRadius, slot.endRadius]);
    const rad = (angle * Math.PI) / 180;
    const cx = HERO_CX + radius * Math.cos(rad);
    const cy = HERO_CY + radius * Math.sin(rad);
    const op = interpolate(p, [0, 0.12, 1], [0, 1, 1]);
    return { cx, cy, r: slot.core * planetBreathe.value, opacity: op };
  });

  const labelProps = useAnimatedProps(() => {
    const p = progress.value;
    const angle = interpolate(p, [0, 1], [slot.startAngle, slot.endAngle]);
    const radius = interpolate(p, [0, 1], [slot.startRadius, slot.endRadius]);
    const rad = (angle * Math.PI) / 180;
    const cx = HERO_CX + radius * Math.cos(rad);
    const cy = HERO_CY + radius * Math.sin(rad);
    const labelY = isTop ? cy - slot.halo - 8 : cy + slot.halo + 16;
    // Fade controlled by master clock — doesn't start until delay.
    const op = interpolate(
      master.value,
      [labelDelay, labelDelay + LABEL_DURATION],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { x: cx, y: labelY, opacity: op };
  });

  return (
    <>
      <AnimatedCircle
        animatedProps={haloProps}
        fill={`url(#halo-${tone})`}
      />
      <AnimatedCircle
        animatedProps={coreProps}
        fill={TONE_CORE[tone]}
        onPress={onPress}
      />
      <AnimatedText
        animatedProps={labelProps}
        textAnchor="middle"
        fontSize={labelFontSize}
        fontWeight="600"
        fill={labelColor}
      >
        {(name ?? "").toUpperCase()}
      </AnimatedText>
    </>
  );
}

/**
 * Connection line, hero → planet slot. Uses the master clock to draw
 * itself at its scheduled delay: stroke-dashoffset interpolates from
 * `length` down to 0 over LINE_DURATION, and opacity fades 0 → 0.3
 * over the same window.
 */
function LineDraw({
  index,
  master,
  reduceMotion,
  x2,
  y2,
  length,
}: {
  index: number;
  master: SharedValue<number>;
  reduceMotion: boolean;
  x2: number;
  y2: number;
  length: number;
}) {
  const delay = LINE_DELAYS[index];

  const animatedProps = useAnimatedProps(() => {
    // In reduce-motion, master snaps to 8000 so the clamp leaves the
    // line drawn + opaque at 0.3. No special branch needed.
    const offset = interpolate(
      master.value,
      [delay, delay + LINE_DURATION],
      [length, 0],
      Extrapolation.CLAMP
    );
    const op = interpolate(
      master.value,
      [delay, delay + LINE_DURATION],
      [0, 0.3],
      Extrapolation.CLAMP
    );
    return { strokeDashoffset: offset, strokeOpacity: op };
  });

  // Silence unused-param lint — the prop is here for parity with
  // future reduce-motion-specific behavior (e.g. skipping the draw
  // entirely instead of letting master clamp it).
  void reduceMotion;

  return (
    <AnimatedLine
      animatedProps={animatedProps}
      x1={HERO_CX}
      y1={HERO_CY}
      x2={x2}
      y2={y2}
      stroke="#7C3AED"
      strokeWidth={1}
      strokeDasharray={length}
    />
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
