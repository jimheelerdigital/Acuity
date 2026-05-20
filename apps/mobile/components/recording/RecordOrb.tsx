import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Platform, Pressable } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/contexts/theme-context";

/**
 * RecordOrb — voice-reactive orb (motion #1 from the gallery).
 *
 * Composition: a gradient-filled disc with subtle organic edge motion.
 * The "marble" specular highlight from the first cut was removed in
 * the Q5 polish pass — it read as a glossy ball rather than the
 * breathing organic form the design intends. Edge variation comes
 * from independently-animated per-corner borderRadius oscillations
 * (4 slow sine waves at different periods, ±6% deviation around the
 * circle radius) — the orb stays roughly circular at any given frame
 * but the shape gently flexes over 3-5 second cycles.
 *
 * Amplitude mapping (motion #1, unchanged from Q5 first cut):
 *   - Scale       1.0 → 1.18 mapped to amplitude 0..1
 *   - Halo opacity 0.3 → 0.85
 *   - Halo scale  1.0 → 1.3
 *   - Smoothing   100ms withTiming per amplitude tick. The spec calls
 *                 for an 80ms EMA; with the existing 1 Hz expo-av
 *                 metering cadence the EMA degenerates to a
 *                 timing-tween between samples. Don't over-engineer.
 *   - Idle fallback: 2.6s soft sine breath (withRepeat reverse) when
 *                 `active` is false OR amplitude stays below 0.06 for
 *                 a sample.
 *
 * The orb is itself the tap target — preserves the existing tap-to-
 * toggle semantic (idle → start, recording → stop) without adding a
 * separate stop button (excluded from Q5 scope per directive).
 *
 * Glow per design § "Glow rule" — orbs are one of the four sanctioned
 * surfaces. The shadow approximates `0 8px 24px primary/0.55` on iOS;
 * Android falls back to elevation.
 */

const SIZE = 88;
const HALO_SIZE = SIZE + 32;
const EASE_BREATH = Easing.inOut(Easing.sin);
const AMPLITUDE_TIMING_MS = 100;
const IDLE_BREATH_MS = 2600;
const IDLE_THRESHOLD = 0.06;
// Organic edge motion: ±6% deviation from the perfect-circle radius
// (SIZE / 2 = 44px → variation up to ~5.3px per corner). Four
// independent oscillation periods so the corners drift out of phase;
// stays inside the "still roughly circular" envelope.
const BLOB_DEVIATION = SIZE * 0.06;
const BLOB_PERIODS_MS = [3400, 4100, 3800, 4500] as const;

export interface RecordOrbProps {
  /** Latest mic amplitude in [0, 1]. Pass the most recent levels[] tail. */
  amplitude: number;
  /** True when state === "recording". Drives the idle/active animation switch. */
  active: boolean;
  onPress: () => void;
  /** Accessibility label override (e.g. "Stop recording" when active). */
  accessibilityLabel?: string;
}

export function RecordOrb({
  amplitude,
  active,
  onPress,
  accessibilityLabel,
}: RecordOrbProps) {
  const { tokens } = useTheme();
  const reactive = useSharedValue(0);
  const idleBreath = useSharedValue(0);
  // Four independent corner oscillators. Each runs its own slow
  // withRepeat(withTiming, true) cycle so the orb's outline drifts
  // organically without ever looking synchronized.
  const blobTL = useSharedValue(0.5);
  const blobTR = useSharedValue(0.5);
  const blobBR = useSharedValue(0.5);
  const blobBL = useSharedValue(0.5);

  // Reactive amplitude track — driven by prop changes when active.
  useEffect(() => {
    const target =
      active && amplitude > IDLE_THRESHOLD
        ? Math.max(0, Math.min(1, amplitude))
        : 0;
    reactive.value = withTiming(target, {
      duration: AMPLITUDE_TIMING_MS,
      easing: Easing.out(Easing.quad),
    });
  }, [amplitude, active, reactive]);

  // Idle breath — runs continuously when not actively reacting to mic.
  useEffect(() => {
    cancelAnimation(idleBreath);
    if (!active || amplitude <= IDLE_THRESHOLD) {
      idleBreath.value = 0;
      idleBreath.value = withRepeat(
        withSequence(
          withTiming(1, {
            duration: IDLE_BREATH_MS / 2,
            easing: EASE_BREATH,
          }),
          withTiming(0, {
            duration: IDLE_BREATH_MS / 2,
            easing: EASE_BREATH,
          })
        ),
        -1,
        false
      );
    } else {
      idleBreath.value = 0;
    }
  }, [active, amplitude, idleBreath]);

  // Organic edge motion — always running, independent of active state.
  // Each corner oscillates between 0 and 1 over its own period. The
  // animated-style worklet maps 0..1 → SIZE/2 ± BLOB_DEVIATION.
  useEffect(() => {
    const start = (sv: typeof blobTL, period: number) => {
      cancelAnimation(sv);
      sv.value = withRepeat(
        withTiming(1 - sv.value, { duration: period, easing: EASE_BREATH }),
        -1,
        true
      );
    };
    start(blobTL, BLOB_PERIODS_MS[0]);
    start(blobTR, BLOB_PERIODS_MS[1]);
    start(blobBR, BLOB_PERIODS_MS[2]);
    start(blobBL, BLOB_PERIODS_MS[3]);
    return () => {
      cancelAnimation(blobTL);
      cancelAnimation(blobTR);
      cancelAnimation(blobBR);
      cancelAnimation(blobBL);
    };
  }, [blobTL, blobTR, blobBR, blobBL]);

  const orbStyle = useAnimatedStyle(() => {
    // Active drives reactive 0..1 → scale 1.0..1.18.
    // Idle drives breath 0..1 → scale 1.0..1.05 (subtler than reactive).
    const reactiveScale = 1 + reactive.value * 0.18;
    const idleScale = 1 + idleBreath.value * 0.05;
    // Map each corner's 0..1 → (SIZE/2 - dev)..(SIZE/2 + dev).
    const base = SIZE / 2;
    const radius = (v: number) => base + (v - 0.5) * 2 * BLOB_DEVIATION;
    return {
      transform: [{ scale: reactiveScale * idleScale }],
      borderTopLeftRadius: radius(blobTL.value),
      borderTopRightRadius: radius(blobTR.value),
      borderBottomRightRadius: radius(blobBR.value),
      borderBottomLeftRadius: radius(blobBL.value),
    };
  });

  const haloStyle = useAnimatedStyle(() => {
    const reactiveOpacity = 0.3 + reactive.value * 0.55;
    const reactiveScale = 1 + reactive.value * 0.3;
    const idleOpacity = 0.3 + idleBreath.value * 0.2;
    const idleScale = 1 + idleBreath.value * 0.1;
    const opacity =
      reactive.value > 0 ? reactiveOpacity : idleOpacity;
    const scale = reactive.value > 0 ? reactiveScale : idleScale;
    return { opacity, transform: [{ scale }] };
  });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (active ? "Stop recording" : "Start recording")
      }
      hitSlop={20}
      style={{
        width: HALO_SIZE,
        height: HALO_SIZE,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Halo — soft glow disc behind the orb. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: HALO_SIZE,
            height: HALO_SIZE,
            borderRadius: HALO_SIZE / 2,
            backgroundColor: `${tokens.primary}55`,
          },
          haloStyle,
        ]}
      />

      {/* Orb body — gradient disc with animated organic edge motion.
          borderRadius corners are driven by the orbStyle worklet; the
          specular highlight from the first cut was removed in the
          Q5 polish pass. */}
      <Animated.View
        style={[
          {
            width: SIZE,
            height: SIZE,
            overflow: "hidden",
            // Glow per design § "Glow rule" — orb is sanctioned.
            shadowColor: tokens.primary,
            shadowOffset: { width: 0, height: 8 },
            shadowRadius: 24,
            shadowOpacity: Platform.OS === "ios" ? 0.55 : 0,
            elevation: 10,
          },
          orbStyle,
        ]}
      >
        <LinearGradient
          colors={[tokens.primaryHi, tokens.primary, tokens.secondary]}
          locations={[0, 0.5, 1]}
          start={{ x: 0.35, y: 0.3 }}
          end={{ x: 0.7, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </Pressable>
  );
}
