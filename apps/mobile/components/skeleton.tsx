import { useEffect } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";

/**
 * Mobile skeleton primitive. Pulse opacity 0.4 ↔ 1.0 driven by a
 * Reanimated shared value so the animation runs on the UI thread
 * (no JS-bridge cost on long-rendering screens). Card-shaped loading
 * stand-ins should compose this for individual lines / blocks.
 *
 * Use inside tab loading states + screen-level Suspense fallbacks
 * to replace the centered spinner pattern that's dotted around the
 * codebase. Goal: when content takes >100ms to load, the user sees
 * a layout that resolves into real data, not a spinner that pops
 * out and is replaced by a different layout.
 */
export function Skeleton({
  style,
  height = 14,
  width,
  radius = 6,
}: {
  style?: ViewStyle;
  height?: number;
  width?: number | string;
  radius?: number;
}) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => {
      cancelAnimation(opacity);
    };
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          height,
          width: (width ?? "100%") as ViewStyle["width"],
          borderRadius: radius,
          backgroundColor: "rgba(161,161,170,0.18)",
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/**
 * Card-shaped wrapper matching the mobile card pattern (rounded-2xl
 * border + dark-mode-friendly bg). Keep skeleton compositions inside
 * one of these so the loading layout occupies the same slot the
 * loaded layout will land in.
 */
export function SkeletonCard({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(161,161,170,0.15)",
          backgroundColor: "rgba(255,255,255,0.02)",
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
