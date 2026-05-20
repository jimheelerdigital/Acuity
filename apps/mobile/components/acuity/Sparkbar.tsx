import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * Sparkbar — small bar chart for weekly cards.
 *
 * The last bar (today / most-recent) renders with a vertical primary
 * gradient; prior bars use a single neutral hairline color. This is
 * the "current vs context" emphasis pattern from the design canvas
 * — kept light so the bar doesn't pull attention away from the
 * surrounding stat number.
 *
 * Heights normalize against the max value with an 8% floor so
 * empty days are visible (a zero would collapse the bar into the
 * baseline). The floor is the design canvas's choice; matches.
 */

export interface SparkbarProps {
  /** 7 values (or any length; max scaling is uniform). */
  values: number[];
  /** Vertical bar gradient color override; defaults to active palette primary. */
  color?: string;
  /** Total height in pt. */
  height?: number;
  /** Gap between bars. */
  gap?: number;
}

export function Sparkbar({
  values,
  color,
  height = 28,
  gap = 3,
}: SparkbarProps) {
  const { tokens, resolved } = useTheme();
  const max = Math.max(...values, 1); // avoid /0 when all zero
  const top = color ?? tokens.primaryHi;
  const bottom = color ?? tokens.primary;
  const neutral = resolved === "dark" ? "#ffffff2e" : "#0000001a";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        height,
        gap,
      }}
    >
      {values.map((v, i) => {
        const isLast = i === values.length - 1;
        // 8% floor so zero days are still visible as a stub.
        const h = Math.max(0.08, v / max) * height;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: h,
              borderRadius: 3,
              backgroundColor: isLast ? "transparent" : neutral,
              overflow: "hidden",
            }}
          >
            {isLast && (
              <LinearGradient
                colors={[top, bottom]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{ flex: 1 }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
