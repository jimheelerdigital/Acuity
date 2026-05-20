import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { LayoutChangeEvent, Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/contexts/theme-context";

/**
 * SegmentedTabs — pill-shaped horizontal tab strip with a gradient
 * indicator that slides between segments on selection.
 *
 * Motion: indicator translates between segments in `durBase` (280ms)
 * via easeStandard. Per the "Motion language" spec — no fade, no
 * scale, just the slide. Active segment text flips from textSec to
 * #ffffff in lockstep.
 *
 * Width is measured per-segment via onLayout so the indicator
 * matches the actual rendered widths (label lengths vary). One
 * extra render on mount; stable after.
 *
 * Use cases (per design):
 *   - Insights tabs (Theme Map | Matrix | Trends)
 *   - Tasks tabs (Today | Upcoming | Done)
 *   - Goals tabs (Active | Done | Dormant)
 */

const EASE_STANDARD = Easing.bezier(0.32, 0.72, 0, 1);
const DUR_BASE_MS = 280;

export interface SegmentedTabsProps<TId extends string = string> {
  tabs: { id: TId; label: string }[];
  activeId: TId;
  onChange: (id: TId) => void;
}

export function SegmentedTabs<TId extends string>({
  tabs,
  activeId,
  onChange,
}: SegmentedTabsProps<TId>) {
  const { tokens } = useTheme();
  const [layouts, setLayouts] = useState<Record<string, { x: number; w: number }>>(
    {}
  );

  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);

  useEffect(() => {
    const layout = layouts[activeId];
    if (!layout) return;
    indicatorX.value = withTiming(layout.x, {
      duration: DUR_BASE_MS,
      easing: EASE_STANDARD,
    });
    indicatorW.value = withTiming(layout.w, {
      duration: DUR_BASE_MS,
      easing: EASE_STANDARD,
    });
  }, [activeId, layouts, indicatorX, indicatorW]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }));

  const handleLayout = (id: string) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      if (prev[id]?.x === x && prev[id]?.w === width) return prev;
      return { ...prev, [id]: { x, w: width } };
    });
  };

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: tokens.bgInset,
        borderRadius: tokens.radius.pill,
        padding: 3,
        position: "relative",
      }}
    >
      {/* Sliding gradient indicator */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 3,
            borderRadius: tokens.radius.pill,
            overflow: "hidden",
          },
          indicatorStyle,
        ]}
      >
        <LinearGradient
          colors={tokens.gradMix.colors}
          start={tokens.gradMix.start}
          end={tokens.gradMix.end}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <Pressable
            key={tab.id}
            onLayout={handleLayout(tab.id)}
            onPress={() => onChange(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={{
              flex: 1,
              paddingVertical: 8,
              paddingHorizontal: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 13,
                fontWeight: "600",
                letterSpacing: -0.1,
                color: isActive ? "#ffffff" : tokens.textTer,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
