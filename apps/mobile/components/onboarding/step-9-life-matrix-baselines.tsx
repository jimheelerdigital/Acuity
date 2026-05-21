import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  Text,
  View,
} from "react-native";
import {
  G,
  Line,
  Polygon as SvgPolygon,
  Svg,
  Circle as SvgCircle,
} from "react-native-svg";

import { DEFAULT_LIFE_AREAS, type LifeArea } from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";

import { useOnboarding } from "./context";

/**
 * Step 9 (Phase C, 2026-05-21) — Life Matrix baseline carousel.
 *
 * Replaces the legacy top-3 ranking picker. Walks the user through
 * 10 axes one at a time, each with a 0-100 slider, an 88pt gradient
 * hero number, and a mini-radar that fills in as axes are scored.
 *
 * In-step nav: own Back arrow + own Continue pill at the bottom.
 * Shell footer is hidden via setHideShellChrome(true). On axis 10's
 * Continue tap, the step writes the full lifeAreaBaselines payload
 * via setCapturedData and calls goNext() to advance the outer flow.
 *
 * Skipped axes are OMITTED from the payload (not sent as null/0).
 * Server defaults missing keys to 50 (neutral) when writing the
 * LifeMapArea rows — see /api/onboarding/update.
 *
 * Layout target (iPhone 16e, 375pt × 812pt):
 *   - 24pt horizontal page padding → 327pt content area
 *   - In-step header row (back arrow + axis pips + skip pill): ~40pt
 *   - Eyebrow + title block: ~100pt (eyebrow 12pt, title 32pt × 2 lines)
 *   - Hint copy: ~22pt
 *   - 88pt hero number (centered)
 *   - Slider track + thumb + tick labels: ~80pt
 *   - Mini-matrix card with sibling text: ~140pt
 *   - Continue pill: ~56pt
 *   Vertical sum ~626pt against ~691pt content area → ~65pt breathing
 *   room across the gaps. Fits without scroll.
 */

const AXIS_HINT: Record<LifeArea, string> = {
  CAREER: "Work, ambition, performance, projects.",
  MONEY: "Income, savings, financial stability, stress.",
  ROMANCE: "Partner, dating, intimacy, romantic life.",
  FAMILY: "Parents, siblings, kids, family dynamics.",
  FRIENDS: "Friendships, community, social belonging.",
  PHYSICAL_HEALTH: "Body, energy, sleep, fitness, illness.",
  MENTAL_HEALTH: "Mood, anxiety, emotional wellbeing, stress.",
  GROWTH: "Learning, identity, skills, becoming.",
  FUN: "Hobbies, play, joy, leisure.",
  PURPOSE: "Meaning, values, what you're building toward.",
};

const DEFAULT_VALUE = 50;
const MIN_VALUE = 0;
const MAX_VALUE = 100;

type BaselinesMap = Partial<Record<LifeArea, number>>;

export function Step9LifeMatrixBaselines() {
  const { tokens } = useTheme();
  const {
    step,
    setCanContinue,
    setCapturedData,
    getCapturedData,
    setHideShellChrome,
    goNext,
  } = useOnboarding();

  // Rehydrate prior baselines from earlier captured state. Back-nav
  // into this step from a later one restores all scored axes.
  const prior = getCapturedData(step) as
    | { lifeAreaBaselines?: BaselinesMap }
    | null;
  const initialBaselines: BaselinesMap = prior?.lifeAreaBaselines ?? {};

  const [axisIndex, setAxisIndex] = useState(0);
  const [baselines, setBaselines] = useState<BaselinesMap>(initialBaselines);
  // Live slider value for the CURRENT axis. Separate from `baselines`
  // so the user can scrub without committing until they tap Continue
  // (or Skip, which drops the live value entirely).
  const [sliderValue, setSliderValue] = useState<number>(
    () => initialBaselines[DEFAULT_LIFE_AREAS[0].enum] ?? DEFAULT_VALUE
  );

  // Take over chrome on mount; restore on unmount so back-nav out of
  // this step (or completion) returns control to the shell's footer.
  useEffect(() => {
    setHideShellChrome(true);
    setCanContinue(true);
    return () => {
      setHideShellChrome(false);
    };
  }, [setHideShellChrome, setCanContinue]);

  const currentAxisConfig = DEFAULT_LIFE_AREAS[axisIndex];
  const totalAxes = DEFAULT_LIFE_AREAS.length;
  const isLastAxis = axisIndex === totalAxes - 1;
  const scoredCount = Object.keys(baselines).length + (isLastAxis ? 0 : 0);
  // Snap slider to the prior value (or default) whenever axisIndex
  // changes. Lets back-nav within the carousel feel deterministic.
  useEffect(() => {
    const enumKey = DEFAULT_LIFE_AREAS[axisIndex].enum;
    setSliderValue(baselines[enumKey] ?? DEFAULT_VALUE);
  }, [axisIndex, baselines]);

  // ─── Slider geometry ──────────────────────────────────────────────
  const [trackWidth, setTrackWidth] = useState(0);
  const setFromTouch = useCallback(
    (locationX: number) => {
      if (trackWidth <= 0) return;
      const t = Math.max(0, Math.min(1, locationX / trackWidth));
      const next = Math.round(MIN_VALUE + t * (MAX_VALUE - MIN_VALUE));
      setSliderValue(next);
    },
    [trackWidth]
  );
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) =>
          setFromTouch(e.nativeEvent.locationX),
        onPanResponderMove: (e: GestureResponderEvent) =>
          setFromTouch(e.nativeEvent.locationX),
      }),
    [setFromTouch]
  );

  // ─── Advance / skip / back ────────────────────────────────────────
  const commitAndAdvance = useCallback(
    (commit: boolean) => {
      const enumKey = currentAxisConfig.enum;
      const nextBaselines: BaselinesMap = commit
        ? { ...baselines, [enumKey]: sliderValue }
        : (() => {
            const copy = { ...baselines };
            delete copy[enumKey];
            return copy;
          })();
      setBaselines(nextBaselines);

      if (isLastAxis) {
        // Final axis — persist via setCapturedData and trigger the
        // shell's goNext. The shell will POST {lifeAreaBaselines:
        // nextBaselines} and advance to the next onboarding step.
        setCapturedData({ lifeAreaBaselines: nextBaselines });
        // Re-show chrome so the next step's shell footer renders.
        setHideShellChrome(false);
        goNext();
      } else {
        setAxisIndex((prev) => prev + 1);
      }
    },
    [
      baselines,
      currentAxisConfig.enum,
      goNext,
      isLastAxis,
      setCapturedData,
      setHideShellChrome,
      sliderValue,
    ]
  );

  const handleBack = useCallback(() => {
    if (axisIndex > 0) {
      setAxisIndex((prev) => prev - 1);
    }
    // On axis 1 (axisIndex 0), the in-step Back is a no-op — the
    // user takes the system back gesture to leave the step entirely.
    // (Could route to the previous onboarding step via the shell's
    // goBack, but the user has no Back affordance there today since
    // the shell footer is hidden. Acceptable: it matches the
    // "carousel" mental model — you advance through axes, then
    // commit. Going back to the previous onboarding step happens by
    // closing the carousel via system gesture.)
  }, [axisIndex]);

  // ─── Live mini-matrix data ────────────────────────────────────────
  const miniBaselines: BaselinesMap = useMemo(
    () => ({ ...baselines, [currentAxisConfig.enum]: sliderValue }),
    [baselines, currentAxisConfig.enum, sliderValue]
  );

  // ─── Render ──────────────────────────────────────────────────────
  const axisName = currentAxisConfig.name;
  const axisHint = AXIS_HINT[currentAxisConfig.enum];

  return (
    <View style={{ flex: 1 }}>
      {/* Top row — Back arrow, in-step axis pips, Skip pill */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingTop: 4,
          paddingBottom: 16,
        }}
      >
        <Pressable
          onPress={handleBack}
          disabled={axisIndex === 0}
          hitSlop={12}
          style={{
            opacity: axisIndex === 0 ? 0 : 1,
            padding: 6,
          }}
        >
          <Ionicons name="chevron-back" size={18} color={tokens.textSec} />
        </Pressable>
        {/* axis-progress pips: short bar for visited+current, dot for unvisited */}
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 6,
          }}
        >
          {DEFAULT_LIFE_AREAS.map((_, i) => {
            const visited = i < axisIndex;
            const current = i === axisIndex;
            return (
              <View
                key={i}
                style={{
                  height: 4,
                  width: current ? 24 : 14,
                  borderRadius: 2,
                  backgroundColor:
                    visited || current ? tokens.primary : tokens.bgInset,
                  opacity: visited && !current ? 0.6 : 1,
                }}
              />
            );
          })}
        </View>
        <Pressable
          onPress={() => commitAndAdvance(false)}
          hitSlop={8}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 13,
              fontWeight: "600",
              letterSpacing: -0.1,
              color: tokens.textSec,
            }}
          >
            Skip
          </Text>
        </Pressable>
      </View>

      {/* Eyebrow + title + hint */}
      <View style={{ alignItems: "center" }}>
        <Text
          style={{
            fontFamily: tokens.fontMono,
            fontSize: 10,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: tokens.textTer,
          }}
        >
          Life Matrix · {axisIndex + 1} of {totalAxes}
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 28,
            fontWeight: "700",
            letterSpacing: -0.6,
            lineHeight: 34,
            color: tokens.text,
            textAlign: "center",
            marginTop: 12,
          }}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          Where&rsquo;s your{" "}
          <Text style={{ color: tokens.primary }}>
            {axisName.toLowerCase()}
          </Text>
          {" "}right now?
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 14,
            lineHeight: 20,
            color: tokens.textSec,
            textAlign: "center",
            marginTop: 8,
            paddingHorizontal: 12,
          }}
        >
          {axisHint}
        </Text>
      </View>

      {/* 88pt hero number — gradient text via LinearGradient mask */}
      <View style={{ alignItems: "center", marginTop: 24 }}>
        <HeroNumber value={sliderValue} tokens={tokens} />
      </View>

      {/* Slider */}
      <View style={{ marginTop: 20, paddingHorizontal: 8 }}>
        <View
          style={{ height: 44, justifyContent: "center" }}
          onLayout={(e: LayoutChangeEvent) =>
            setTrackWidth(e.nativeEvent.layout.width)
          }
          {...panResponder.panHandlers}
        >
          {/* Empty track */}
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: tokens.bgInset,
            }}
          />
          {/* Filled track */}
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 19,
              height: 6,
              borderRadius: 3,
              width: `${sliderValue}%`,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={tokens.gradPrimary.colors}
              locations={tokens.gradPrimary.locations}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </View>
          {/* Thumb */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: `${sliderValue}%`,
              top: 4,
              marginLeft: -18,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: tokens.cardBg,
              borderWidth: 2,
              borderColor: tokens.primary,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: tokens.glowPrimary.color,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 6,
              elevation: 4,
            }}
          >
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: tokens.primary,
              }}
            />
          </View>
        </View>
        {/* Tick labels */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 10,
          }}
        >
          {(["Struggling", "Neutral", "Thriving"] as const).map((label) => (
            <Text
              key={label}
              style={{
                fontFamily: tokens.fontMono,
                fontSize: 10,
                letterSpacing: 1.0,
                textTransform: "uppercase",
                color: tokens.textTer,
              }}
            >
              {label}
            </Text>
          ))}
        </View>
      </View>

      {/* Mini-matrix card */}
      <View
        style={{
          marginTop: 24,
          padding: 14,
          borderRadius: tokens.radius.lg,
          borderWidth: 0.5,
          borderColor: tokens.line,
          backgroundColor: tokens.cardBg,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <MiniMatrix
          baselines={miniBaselines}
          currentEnum={currentAxisConfig.enum}
          tokens={tokens}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: tokens.textTer,
            }}
          >
            Your matrix, so far
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 16,
              fontWeight: "700",
              letterSpacing: -0.3,
              lineHeight: 20,
              color: tokens.text,
              marginTop: 4,
            }}
          >
            {scoredCount + (sliderValue > 0 ? 1 : 0)} of {totalAxes} axes
            scored
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 12,
              lineHeight: 16,
              color: tokens.textSec,
              marginTop: 4,
            }}
          >
            You can re-score anytime from Insights.
          </Text>
        </View>
      </View>

      {/* In-step Continue pill */}
      <View style={{ marginTop: "auto", paddingTop: 20 }}>
        <Pressable
          onPress={() => commitAndAdvance(true)}
          accessibilityRole="button"
          style={{
            borderRadius: tokens.radius.pill,
            overflow: "hidden",
            shadowColor: tokens.glowPrimary.color,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: tokens.glowPrimary.opacity,
            shadowRadius: tokens.glowPrimary.radius,
            elevation: 4,
          }}
        >
          <LinearGradient
            colors={tokens.gradPrimary.colors}
            locations={tokens.gradPrimary.locations}
            start={tokens.gradPrimary.start}
            end={tokens.gradPrimary.end}
            style={{
              paddingVertical: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 16,
                fontWeight: "700",
                letterSpacing: -0.2,
                color: "#FFFFFF",
              }}
            >
              {isLastAxis ? "Finish baselines" : "Continue"}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// HeroNumber — 88pt gradient-tinted display number. expo-linear-gradient
// doesn't natively mask text, so we use a two-pass: render the number
// once in palette primary at full opacity (the main appearance), and
// overlay a secondary-tinted copy at lower opacity for the gradient
// effect. Cheap, no extra deps, looks faithful enough to the design.
// ────────────────────────────────────────────────────────────────────
function HeroNumber({
  value,
  tokens,
}: {
  value: number;
  tokens: ReturnType<typeof useTheme>["tokens"];
}) {
  return (
    <View
      style={{
        position: "relative",
        height: 96,
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: tokens.fontDisplay,
          fontSize: 88,
          fontWeight: "800",
          letterSpacing: -3,
          lineHeight: 96,
          color: tokens.primary,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Text>
      <Text
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          fontFamily: tokens.fontDisplay,
          fontSize: 88,
          fontWeight: "800",
          letterSpacing: -3,
          lineHeight: 96,
          color: tokens.secondary,
          opacity: 0.35,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// MiniMatrix — abridged radar for the onboarding step's bottom card.
// Intentionally simpler than apps/mobile/components/life-map-radar.tsx
// (no labels, no score numerals, no tap handling, no trend overlay).
// At 130×120pt, label scaffolding would be unreadable and would crowd
// the bottom card. Just the abstract shape + per-axis dot.
//
// Geometry: 10 axes at 36° spacing starting at -90° (12 o'clock).
// maxR = 50pt inside a 130pt × 120pt viewBox. Polygon connects only
// the populated axes (matches Phase D polish 2 honesty); current axis
// dot is slightly larger + palette-secondary to distinguish it from
// the locked-in palette-primary dots.
// ────────────────────────────────────────────────────────────────────
function MiniMatrix({
  baselines,
  currentEnum,
  tokens,
}: {
  baselines: BaselinesMap;
  currentEnum: LifeArea;
  tokens: ReturnType<typeof useTheme>["tokens"];
}) {
  const size = 130;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.38;
  const angleStep = (2 * Math.PI) / DEFAULT_LIFE_AREAS.length;
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, radius: number) => {
    const angle = startAngle + index * angleStep;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  };

  // Populated vertices only (Phase D polish 2 honesty)
  const populated = DEFAULT_LIFE_AREAS.map((config, i) => {
    const v = baselines[config.enum];
    return v != null && v > 0
      ? { config, i, value: v }
      : null;
  }).filter((x): x is { config: typeof DEFAULT_LIFE_AREAS[number]; i: number; value: number } => x !== null);

  const polyPoints =
    populated.length >= 2
      ? populated
          .map((p) => {
            const pt = getPoint(p.i, (p.value / 100) * maxR);
            return `${pt.x},${pt.y}`;
          })
          .join(" ")
      : null;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Outer ring — faint polygon boundary at 100% radius */}
      <SvgPolygon
        points={DEFAULT_LIFE_AREAS.map((_, i) => {
          const p = getPoint(i, maxR);
          return `${p.x},${p.y}`;
        }).join(" ")}
        fill="none"
        stroke={tokens.line}
        strokeWidth={0.5}
      />
      {/* Spokes — faint */}
      {DEFAULT_LIFE_AREAS.map((_, i) => {
        const p = getPoint(i, maxR);
        return (
          <Line
            key={`spoke-${i}`}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke={tokens.line}
            strokeWidth={0.35}
            strokeOpacity={0.6}
          />
        );
      })}
      {/* Filled polygon across populated axes */}
      {polyPoints && (
        <SvgPolygon
          points={polyPoints}
          fill={tokens.primary}
          fillOpacity={0.18}
          stroke={tokens.primary}
          strokeWidth={1.2}
        />
      )}
      {/* Vertex dots — populated axes only. Current axis dot is
          larger + palette-secondary so the user sees the live edit. */}
      {populated.map((p) => {
        const isCurrent = p.config.enum === currentEnum;
        const pt = getPoint(p.i, (p.value / 100) * maxR);
        return (
          <G key={`dot-${p.config.enum}`}>
            {isCurrent && (
              <SvgCircle
                cx={pt.x}
                cy={pt.y}
                r={5}
                fill={tokens.secondary}
                fillOpacity={0.3}
              />
            )}
            <SvgCircle
              cx={pt.x}
              cy={pt.y}
              r={isCurrent ? 3 : 2}
              fill={isCurrent ? tokens.secondary : tokens.primary}
              stroke={tokens.bg}
              strokeWidth={1}
            />
          </G>
        );
      })}
    </Svg>
  );
}
