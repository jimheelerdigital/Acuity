import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
 *
 * ⚠ Do not remove `overflow: "visible"` from tabBarStyle below. It's
 * the critical bit that lets the raised center circle paint *above*
 * the tab bar's top edge on iOS. Default overflow clips the top half
 * of the button and you get a "flat mic icon" regression — which has
 * been reported three times as "the center button is gone". See
 * PROGRESS.md 2026-04-21 for the fixed values.
 */

const BRAND_PURPLE = "#7C3AED"; // active tint + center-circle fill
const BRAND_PURPLE_DARK = "#A78BFA"; // active tint in dark mode
const CIRCLE_SIZE = 64; // diameter of the raised mic circle (px)
const RAISED_OFFSET = 26; // how far above the tab bar the circle floats (px)

export default function TabsLayout() {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const tabBarBg = isDark ? "#0B0B12" : "#FFFFFF";
  const tabBarBorder = isDark ? "rgba(255,255,255,0.08)" : "#E4E4E7";
  const activeTint = isDark ? BRAND_PURPLE_DARK : BRAND_PURPLE;
  // Inactive tint: previous zinc-500 (#71717A) was too close to the
  // background to read against the tab bar. Bump to 0.62 opacity
  // against black/near-black text color — readable but clearly
  // secondary to the active tint.
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
          // CRITICAL for the raised center button — without this iOS
          // clips the top ~25px of the circle and it reads as a flat mic.
          overflow: "visible",
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
 * Raised purple circle. CIRCLE_SIZE diameter, RAISED_OFFSET negative
 * margin-top so it protrudes above the tab bar. The border matches the
 * tab bar background so the circle appears "scooped out" of the bar
 * without needing a clip-path. Shadow for elevation.
 *
 * Stays BRAND_PURPLE whether the user is on Home or any other tab —
 * this is the primary action, not a navigation indicator.
 *
 * onPress routes to /(tabs) which resolves to `index.tsx` (Home).
 * Home has the Record-your-brain-dump card as its primary action;
 * the user's next tap opens the /record modal.
 */
function RecordCenterButton({ isDark }: { isDark: boolean }) {
  const router = useRouter();

  return (
    <View style={styles.slot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Home to record a brain dump"
        onPress={() => router.navigate("/(tabs)")}
        hitSlop={10}
        style={({ pressed }) => [
          styles.circle,
          {
            transform: [{ scale: pressed ? 0.94 : 1 }],
            shadowOpacity: isDark ? 0.6 : 0.45,
            borderColor: isDark ? "#0B0B12" : "#FFFFFF",
          },
        ]}
      >
        <Ionicons name="mic" size={28} color="#FFFFFF" />
      </Pressable>
      <Text
        style={[
          styles.label,
          { color: isDark ? "rgba(255,255,255,0.62)" : "rgba(39,39,42,0.62)" },
        ]}
      >
        Home
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    // Pulls the whole slot up so the circle's top edge clears the tab
    // bar. Relies on tabBarStyle.overflow === "visible" (see above).
    marginTop: -RAISED_OFFSET,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    // Hard-coded brand purple (not theme-conditional) so the record
    // CTA is always visually identifiable. Mic icon always white.
    backgroundColor: BRAND_PURPLE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: BRAND_PURPLE,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 10,
    borderWidth: 4,
  },
  label: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "500",
  },
});
