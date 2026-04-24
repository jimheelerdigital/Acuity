import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * 5-slot tab bar with a raised center Record button:
 *
 *   Goals | Tasks | [🎙️ Home] | Insights | Entries
 *
 * Center position is the big purple mic button. Tapping it navigates
 * to the Home route (where the full Record-your-brain-dump card lives).
 *
 * Profile moved out of the tab bar. Accessed via a settings icon in
 * the Home header (app/(tabs)/index.tsx).
 *
 * ⚠ Fabric/bridgeless compatibility notes (do not regress):
 *
 *   - ALL geometry on the center button uses inline style objects, not
 *     StyleSheet.create references. NativeWind's CssInterop wraps core
 *     RN components and in some Fabric configurations filters styles
 *     referenced through a StyleSheet registry; inline literals pass
 *     through untouched.
 *   - The Pressable uses useState + onPressIn/onPressOut for pressed
 *     state. The function-style form (`style={({pressed}) => [...]}`)
 *     is Fabric-fragile — the callback is deferred to first press, so
 *     initial paint can render with no styles.
 *   - The raised circle uses `position: "absolute"` + `top: -26`, NOT
 *     `marginTop: -26` on a flex-stretched slot. Yoga 2 (Fabric's
 *     layout engine) does not reliably honor negative margins on
 *     flex: 1 stretch children.
 *   - The record-placeholder screen explicitly nulls tabBarIcon and
 *     tabBarLabel so React Navigation's default icon/label render
 *     can't surface alongside the custom button under Fabric view
 *     flattening.
 */

const BRAND_PURPLE = "#7C3AED";
const BRAND_PURPLE_DARK = "#A78BFA";

export default function TabsLayout() {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const tabBarBg = isDark ? "#0B0B12" : "#FFFFFF";
  const tabBarBorder = isDark ? "rgba(255,255,255,0.08)" : "#E4E4E7";
  const activeTint = isDark ? BRAND_PURPLE_DARK : BRAND_PURPLE;
  const inactiveTint = isDark
    ? "rgba(255,255,255,0.62)"
    : "rgba(39,39,42,0.62)";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
        tabBarStyle: {
          backgroundColor: tabBarBg,
          borderTopColor: tabBarBorder,
          borderTopWidth: 1,
          height: 88,
          paddingTop: 8,
          paddingBottom: 28,
          overflow: "visible",
        },
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
        // Force every slot's active/inactive background to transparent.
        // Under Fabric on iOS, the default "transparent" from React
        // Navigation's BottomTabItem has been observed to paint a faint
        // grey box in the slot — most visible behind the absolutely-
        // positioned record circle. Setting these explicitly stops it.
        tabBarActiveBackgroundColor: "transparent",
        tabBarInactiveBackgroundColor: "transparent",
      }}
    >
      <Tabs.Screen
        name="goals"
        options={{
          title: "Goals",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "trophy" : "trophy-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "checkmark-done" : "checkmark-done-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="record-placeholder"
        options={{
          title: "",
          tabBarIcon: () => null,
          tabBarLabel: () => null,
          tabBarItemStyle: {
            overflow: "visible",
            backgroundColor: "transparent",
          },
          tabBarButton: (props) => (
            <RecordCenterButton isDark={isDark} {...props} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "bulb" : "bulb-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="entries"
        options={{
          title: "Entries",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "journal" : "journal-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      {/* index = Home route. Hidden from the bar because the center
          button navigates here; exposing it twice would be confusing. */}
      <Tabs.Screen name="index" options={{ href: null }} />
      {/* Profile moved to the Home header. Route stays live for links. */}
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

// Active + inactive record-button fills. The inactive state is a
// desaturated/darker purple — NOT a translucent version of the active
// color. Previous fix used opacity, which painted the tab bar through
// the button (translucent); this pair of solid colors reads as
// "muted but solid" at alpha 1.0.
const RECORD_FILL_ACTIVE = "#7C3AED"; // full accent
const RECORD_FILL_INACTIVE = "#5D449B"; // ~40% less saturation, ~20% less brightness

/**
 * Tab-bar record button. Active (user is on Home) → full accent
 * purple. Inactive (any other tab) → muted solid purple. Pressed
 * briefly punches back to active for tactile feedback. 200ms ease
 * between states. Opacity stays 1.0 — no translucency.
 */
function RecordCenterButton({ isDark }: { isDark: boolean }) {
  const router = useRouter();
  const segments = useSegments();
  const [pressed, setPressed] = useState(false);

  // Segments from (tabs). "index" is Home (though expo-router may
  // render it as "" when it's the default route); when the user is
  // on any other tab, the second-to-last segment is the tab name.
  // We treat Home as "last segment empty or equals (tabs) itself."
  // Cast to string because expo-router narrows the segment union to
  // known route names and "index"/"(tabs)" may or may not appear in
  // that union depending on route registration timing.
  const lastSegment = segments[segments.length - 1] as string | undefined;
  const isOnHome =
    segments.length < 2 ||
    lastSegment === "index" ||
    lastSegment === "(tabs)";
  const targetColorValue = pressed || isOnHome ? 1 : 0;
  const colorAnim = useRef(new Animated.Value(isOnHome ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(colorAnim, {
      toValue: targetColorValue,
      duration: 200,
      useNativeDriver: false, // backgroundColor interpolation requires JS driver
    }).start();
  }, [targetColorValue, colorAnim]);

  const backgroundColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [RECORD_FILL_INACTIVE, RECORD_FILL_ACTIVE],
  });

  return (
    <View
      pointerEvents="box-none"
      // Mirror React Navigation's BottomTabItem layout exactly —
      // flex: 1, center both axes, icon-sized block above label —
      // so the "Home" label lands on the same baseline as Goals /
      // Tasks / Insights / Entries. The raised circle is absolutely
      // positioned and doesn't affect the flow at all.
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: -26,
          zIndex: 10,
          elevation: 10,
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor,
          borderWidth: 4,
          borderColor: isDark ? "#0B0B12" : "#FFFFFF",
          shadowColor: "#7C3AED",
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: 14,
          shadowOpacity: isDark ? 0.6 : 0.45,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: pressed ? 0.94 : 1 }],
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Home to record a brain dump"
          onPress={() => router.navigate("/(tabs)")}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          hitSlop={12}
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="mic" size={28} color="#FFFFFF" />
        </Pressable>
      </Animated.View>
      {/* Invisible icon-sized spacer — matches the 22px Ionicons that
          the sibling tabs render. React Navigation's default item
          lays icon + label as a vertical stack in a centered block;
          this keeps our label's vertical position locked to that same
          stack geometry (22 icon + ~3 gap + 14 label centered in the
          52pt content area). */}
      <View style={{ width: 22, height: 22 }} />
      <Text
        style={{
          marginTop: 3,
          fontSize: 11,
          fontWeight: "500",
          color: isDark ? "rgba(255,255,255,0.62)" : "rgba(39,39,42,0.62)",
        }}
      >
        Home
      </Text>
    </View>
  );
}
