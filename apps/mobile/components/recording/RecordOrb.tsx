import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Platform, Pressable, View } from "react-native";
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
 * Composition: layered radial-gradient sphere (approximated with two
 * concentric LinearGradient discs — RN doesn't ship a true radial
 * gradient, and react-native-radial-gradient adds a dep we agreed
 * to skip back in Q3 planning), wrapped in a halo View that scales
 * + fades with amplitude.
 *
 * Animation mapping (from the design's motion spec):
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

  const orbStyle = useAnimatedStyle(() => {
    // Active drives reactive 0..1 → scale 1.0..1.18.
    // Idle drives breath 0..1 → scale 1.0..1.05 (subtler than reactive).
    const reactiveScale = 1 + reactive.value * 0.18;
    const idleScale = 1 + idleBreath.value * 0.05;
    return { transform: [{ scale: reactiveScale * idleScale }] };
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

      {/* Orb body — gradient disc with inset highlight ring. */}
      <Animated.View
        style={[
          {
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
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
        {/* Top-left highlight — approximates the design's inset
            `1 0 0 / 0.4` rim. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: SIZE * 0.12,
            left: SIZE * 0.18,
            width: SIZE * 0.36,
            height: SIZE * 0.22,
            borderRadius: SIZE * 0.18,
            backgroundColor: "#ffffff40",
            opacity: 0.6,
            transform: [{ rotate: "-22deg" }],
          }}
        />
      </Animated.View>
    </Pressable>
  );
}
