import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * 5-slot tab bar with a raised center Record button:
 *
 *   Goals | Tasks | [🎙️ Home] | Insights | Entries
 *
 * Center position is the big purple mic button. Tapping it navigates
 * to the Home route (where the full Record-your-brain-dump card
 * lives) — NOT the /record modal directly. Recording is initiated
 * from Home, so the mic tab is just a shortcut there.
 *
 * Profile moved out of the tab bar. Accessed via a settings icon in
 * the Home header (app/(tabs)/index.tsx).
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
          tabBarButton: () => <RecordCenterButton isDark={isDark} />,
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

/**
 * Raised purple circle. 64px, -25px margin-top so it floats above the
 * bar. 4px ring matching bar bg gives the "scooped out" visual
 * without an actual clip-path on the tab bar (RN doesn't cleanly
 * support that). Shadow for elevation.
 *
 * onPress routes to Home. Home has the Record-your-brain-dump card
 * as its primary action; the user's next tap opens the /record modal.
 */
function RecordCenterButton({ isDark }: { isDark: boolean }) {
  const router = useRouter();
  const size = 64;
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "flex-start",
        marginTop: -25,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Home to record a brain dump"
        onPress={() => router.navigate("/(tabs)")}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          // Hard-coded color (not theme-conditional) so the record
          // CTA is always visually identifiable — Acuity's brand-primary
          // action. Mic icon always white on this background; setting
          // both values explicitly closes a light-mode bug where the
          // inherited color was rendering white-on-white on iOS.
          backgroundColor: "#7C3AED",
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: pressed ? 0.94 : 1 }],
          shadowColor: "#7C3AED",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.6 : 0.45,
          shadowRadius: 14,
          elevation: 10,
          borderWidth: 4,
          borderColor: isDark ? "#0B0B12" : "#FFFFFF",
        })}
      >
        <Ionicons name="mic" size={28} color="#FFFFFF" />
      </Pressable>
      <Text
        // Label below the raised circle so users know this tab is
        // "Home" (recording entry point) rather than a mystery icon.
        style={{
          marginTop: 6,
          fontSize: 11,
          fontWeight: "500",
          color: isDark ? "#71717A" : "#A1A1AA",
        }}
      >
        Home
      </Text>
    </View>
  );
}
