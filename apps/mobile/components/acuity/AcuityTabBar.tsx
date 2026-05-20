import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * AcuityTabBar — floating bottom tab bar with center mic FAB.
 *
 * Five-tab layout per design: home / entries / [center mic FAB] /
 * goals / insights. The tasks tab slot is occupied by the FAB so its
 * label is hidden (the FAB itself routes to record). Tasks remain
 * a navigable destination via the Home screen's "Surfaced today"
 * list rows.
 *
 * Composition: BlurView pill with a 0.5px hairline border, lifted
 * off the bottom edge with a vertical-gradient backdrop above the
 * scroll content (avoids the white-show-through that pure
 * translucent backgrounds give when content scrolls past).
 *
 * Glow on FAB is one of the four sanctioned uses (per design spec
 * § "Glow rule"). Implemented via `shadowColor` + soft offset —
 * RN's shadow approximates the design's `0 0 16px primary/0.30`.
 */

export type AcuityTabId = "home" | "entries" | "goals" | "insights";

interface TabSpec {
  id: AcuityTabId;
  label: string;
  iconActive: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
}

const TABS: TabSpec[] = [
  { id: "home", label: "Home", iconInactive: "home-outline", iconActive: "home" },
  {
    id: "entries",
    label: "Entries",
    iconInactive: "reader-outline",
    iconActive: "reader",
  },
  // [center mic FAB slot — index 2 — absorbed by the FAB above]
  { id: "goals", label: "Goals", iconInactive: "locate-outline", iconActive: "locate" },
  {
    id: "insights",
    label: "Insights",
    iconInactive: "stats-chart-outline",
    iconActive: "stats-chart",
  },
];

export interface AcuityTabBarProps {
  active: AcuityTabId;
  onTabPress: (id: AcuityTabId) => void;
  onMicPress: () => void;
}

export function AcuityTabBar({ active, onTabPress, onMicPress }: AcuityTabBarProps) {
  const { tokens, resolved } = useTheme();
  const isDark = resolved === "dark";

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: 26,
        paddingTop: 14,
        zIndex: 40,
      }}
    >
      {/* Soft fade behind the pill so list content fading underneath
          reads as deliberate, not bleeding through. */}
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", `${tokens.bg}cc`, tokens.bg]}
        locations={[0, 0.7, 1]}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          top: 0,
        }}
      />

      <View style={{ marginHorizontal: 14, position: "relative" }}>
        <View
          style={{
            height: 60,
            borderRadius: 30,
            overflow: "hidden",
            borderWidth: 0.5,
            borderColor: tokens.lineStrong,
            shadowColor: tokens.shadowLift.color,
            shadowOffset: { width: 0, height: tokens.shadowLift.offsetY },
            shadowRadius: tokens.shadowLift.radius,
            shadowOpacity: tokens.shadowLift.opacity,
            elevation: 8,
          }}
        >
          <BlurView
            intensity={28}
            tint={isDark ? "dark" : "light"}
            style={{
              flexDirection: "row",
              alignItems: "center",
              flex: 1,
              paddingHorizontal: 4,
            }}
          >
            {/* Render tabs as 5 slots so the FAB has a visual anchor
                center. The 3rd slot is intentionally empty. */}
            <TabSlot
              tab={TABS[0]}
              active={active}
              onPress={onTabPress}
              tokens={tokens}
            />
            <TabSlot
              tab={TABS[1]}
              active={active}
              onPress={onTabPress}
              tokens={tokens}
            />
            <View style={{ flex: 1 }} />
            <TabSlot
              tab={TABS[2]}
              active={active}
              onPress={onTabPress}
              tokens={tokens}
            />
            <TabSlot
              tab={TABS[3]}
              active={active}
              onPress={onTabPress}
              tokens={tokens}
            />
          </BlurView>
        </View>

        {/* Mic FAB — sanctioned glow per design spec. */}
        <Pressable
          onPress={onMicPress}
          accessibilityRole="button"
          accessibilityLabel="Start recording"
          style={{
            position: "absolute",
            top: -16,
            left: "50%",
            marginLeft: -30,
            width: 60,
            height: 60,
            borderRadius: 30,
            overflow: "hidden",
            borderWidth: 0.5,
            borderColor: "#ffffff40",
            shadowColor: tokens.glowPrimary.color,
            shadowOffset: { width: 0, height: 8 },
            shadowRadius: tokens.glowPrimary.radius,
            shadowOpacity:
              Platform.OS === "ios" ? tokens.glowPrimary.opacity : 0,
            elevation: 12,
          }}
        >
          <LinearGradient
            colors={tokens.gradPrimary.colors}
            locations={tokens.gradPrimary.locations}
            start={tokens.gradPrimary.start}
            end={tokens.gradPrimary.end}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="mic" size={26} color="#ffffff" />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

function TabSlot({
  tab,
  active,
  onPress,
  tokens,
}: {
  tab: TabSpec;
  active: AcuityTabId;
  onPress: (id: AcuityTabId) => void;
  tokens: ReturnType<typeof useTheme>["tokens"];
}) {
  const isActive = tab.id === active;
  const color = isActive ? tokens.primary : tokens.textTer;
  return (
    <Pressable
      onPress={() => onPress(tab.id)}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <Ionicons name={isActive ? tab.iconActive : tab.iconInactive} size={22} color={color} />
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.1,
          color,
        }}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}
