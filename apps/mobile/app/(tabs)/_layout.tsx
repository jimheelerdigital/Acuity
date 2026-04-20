import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * Tab bar with a raised center Record button. The center position is
 * a "virtual" tab — tapping it navigates to the /record modal instead
 * of switching into a tab. Achieved by overriding `tabBarButton` on a
 * placeholder screen (`record-placeholder.tsx`) that never actually
 * renders because we intercept the press.
 *
 * Order (5 slots):
 *   Home | Tasks | [Record] | Insights | Profile
 *
 * Goals moved out of the bar (still a real screen, just `href:null`
 * so it doesn't occupy a slot). Kept in the tree because the goals
 * surface is still useful; add an entry point from Insights later if
 * we want it discoverable again.
 */
export default function TabsLayout() {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const tabBarBg = isDark ? "#0B0B12" : "#FFFFFF";
  const tabBarBorder = isDark ? "rgba(255,255,255,0.08)" : "#E4E4E7";
  const activeTint = isDark ? "#A78BFA" : "#7C3AED";
  const inactiveTint = isDark ? "#71717A" : "#A1A1AA";

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
        },
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: inactiveTint,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
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
          tabBarButton: (props) => (
            <RecordCenterButton
              isDark={isDark}
              accessibilityState={props.accessibilityState as { selected?: boolean } | undefined}
            />
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
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      {/* Hidden from the bar — real screen, still accessible via router.push("/(tabs)/goals") */}
      <Tabs.Screen name="goals" options={{ href: null }} />
    </Tabs>
  );
}

/**
 * Raised purple circle at the center of the tab bar. Slightly elevated
 * above the bar surface (marginTop negative) with shadow for lift.
 * Tapping opens the /record modal — skips the "record-placeholder"
 * tab screen entirely.
 */
function RecordCenterButton({
  isDark,
  accessibilityState,
}: {
  isDark: boolean;
  accessibilityState?: { selected?: boolean };
}) {
  const router = useRouter();
  const size = 62;
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        marginTop: -22,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        accessibilityLabel="Record a new brain dump"
        onPress={() => router.push("/record")}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#7C3AED",
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: pressed ? 0.94 : 1 }],
          shadowColor: "#7C3AED",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.6 : 0.4,
          shadowRadius: 12,
          elevation: 8,
          // Thin ring matching tab bar bg so the button reads as
          // "floating above" instead of "embedded in" the bar.
          borderWidth: 4,
          borderColor: isDark ? "#0B0B12" : "#FFFFFF",
        })}
      >
        <Ionicons name="mic" size={26} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}
