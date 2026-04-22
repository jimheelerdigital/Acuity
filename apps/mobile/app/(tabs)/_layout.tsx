import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

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

function RecordCenterButton({ isDark }: { isDark: boolean }) {
  const router = useRouter();
  const [pressed, setPressed] = useState(false);

  return (
    <View
      pointerEvents="box-none"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 4,
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
          position: "absolute",
          top: -26,
          zIndex: 10,
          elevation: 10,
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: "#7C3AED",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 4,
          borderColor: isDark ? "#0B0B12" : "#FFFFFF",
          shadowColor: "#7C3AED",
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: 14,
          shadowOpacity: isDark ? 0.6 : 0.45,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        }}
      >
        <Ionicons name="mic" size={28} color="#FFFFFF" />
      </Pressable>
      <Text
        style={{
          marginTop: 36,
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
