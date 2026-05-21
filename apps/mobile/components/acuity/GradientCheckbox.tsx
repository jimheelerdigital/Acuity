import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/contexts/theme-context";

/**
 * GradientCheckbox — shared task/goal checkbox primitive (Slice Q8).
 *
 * Visual layer only. The `checked` and `onPress` props drive the
 * existing parent handlers — the toggle behavior is not modified by
 * this component. Visual swap from the prior solid-violet square:
 *
 *   - Unchecked: round (full radius), thin neutral ring at
 *     tokens.lineStrong. No fill.
 *   - Checked: round, palette gradient fill (gradMix.colors), white
 *     check glyph.
 *
 * Animation (per motion gallery #5 task-check):
 *   - Background gradient fades in via opacity 0 → 1.
 *   - Ring fades out in lockstep.
 *   - Check glyph scales 0 → 1.2 → 1 over the full 380ms duration —
 *     cubic-bezier(0.16, 0.9, 0.3, 1).
 *
 * Drives one shared value (`progress` 0..1) and three animated
 * styles. Cheap; renders fine in a long task list.
 *
 * `muted` is preserved for parity with the legacy Checkbox (snoozed
 * tab in Tasks) — when true, the unchecked ring renders dashed.
 */

const CHECK_DURATION_MS = 380;
const SPRING_EASING = Easing.bezier(0.16, 0.9, 0.3, 1);

export interface GradientCheckboxProps {
  checked: boolean;
  onPress: () => void;
  /** Size in pt. Default 22 to match the prior local Checkbox. */
  size?: number;
  /** Dashed ring style (snoozed tab). Default false. */
  muted?: boolean;
  accessibilityLabel?: string;
}

export function GradientCheckbox({
  checked,
  onPress,
  size = 22,
  muted = false,
  accessibilityLabel,
}: GradientCheckboxProps) {
  const { tokens } = useTheme();
  const progress = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(checked ? 1 : 0, {
      duration: CHECK_DURATION_MS,
      easing: SPRING_EASING,
    });
  }, [checked, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));

  const checkIconStyle = useAnimatedStyle(() => ({
    // 0 → 1.2 → 1 scale arc per motion gallery; opacity gates the
    // icon entirely under 20% progress so the bare gradient shows
    // briefly before the check sprouts.
    transform: [
      { scale: interpolate(progress.value, [0, 0.6, 1], [0, 1.2, 1]) },
    ],
    opacity: progress.value > 0.2 ? 1 : 0,
  }));

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={
        accessibilityLabel ?? (checked ? "Mark incomplete" : "Mark complete")
      }
      style={{
        width: size,
        height: size,
        marginTop: 1,
        position: "relative",
      }}
    >
      {/* Unchecked ring — absolute-positioned so it overlays the
          (eventually-faded-in) fill. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.5,
            borderStyle: muted ? "dashed" : "solid",
            borderColor: tokens.lineStrong,
          },
          ringStyle,
        ]}
      />
      {/* Checked fill — gradient disc. Sits beneath the ring; ring
          fades out and fill fades in via the same progress. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: "hidden",
          },
          fillStyle,
        ]}
      >
        <LinearGradient
          colors={tokens.gradMix.colors}
          locations={tokens.gradMix.locations}
          start={tokens.gradMix.start}
          end={tokens.gradMix.end}
          style={{ flex: 1 }}
        />
      </Animated.View>
      {/* Check glyph — scaled with the bounce arc. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: size,
            height: size,
            alignItems: "center",
            justifyContent: "center",
          },
          checkIconStyle,
        ]}
      >
        <Ionicons
          name="checkmark"
          size={Math.round(size * 0.64)}
          color="#ffffff"
        />
      </Animated.View>
    </Pressable>
  );
}
