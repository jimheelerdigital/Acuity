import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/theme-context";

/**
 * Custom tab bar — 5 slots all rendered by ONE code path so the labels
 * are guaranteed to share a baseline. The raised purple mic button is
 * an absolute overlay positioned above the center slot, and has zero
 * contribution to the tab row's layout.
 *
 * Why a full custom tab bar:
 *   Two previous attempts tried to mimic React Navigation's default
 *   BottomTabItem layout from inside a `tabBarButton` override. Under
 *   Fabric / New Architecture the default item's label lands at a
 *   slightly different y-position than a hand-rolled stack that uses
 *   flex-center layout, so the "Home" label drifted below the others.
 *   The only path that's mathematically guaranteed to align all five
 *   labels is to render every slot with the SAME component, same
 *   flex structure, same icon height, same gap, same label style.
 *   That's what CustomTabBar does below.
 *
 * Layout inside each slot (identical for all 5):
 *   - flex: 1, alignItems: center, justifyContent: center, gap: 3
 *   - icon: 22×22
 *   - label: 11pt, marginTop implicit via gap
 *
 * The mic button sits OUTSIDE every slot — it's an absolute overlay
 * anchored at horizontal center, vertical position raised above the
 * tab bar's top edge. Tapping it routes to Home.
 */

const BRAND_PURPLE = "#7C3AED";
const BRAND_PURPLE_DARK = "#A78BFA";
const RECORD_FILL_ACTIVE = "#7C3AED";
const RECORD_FILL_INACTIVE = "#5D449B";

export default function TabsLayout() {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} isDark={isDark} />}
    >
      <Tabs.Screen name="goals" options={{ title: "Goals" }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks" }} />
      <Tabs.Screen name="record-placeholder" options={{ title: "Home" }} />
      <Tabs.Screen name="insights" options={{ title: "Insights" }} />
      <Tabs.Screen name="entries" options={{ title: "Entries" }} />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

type TabKey = "goals" | "tasks" | "record-placeholder" | "insights" | "entries";

const TAB_META: Record<
  TabKey,
  { label: string; iconOn: string; iconOff: string }
> = {
  goals: { label: "Goals", iconOn: "trophy", iconOff: "trophy-outline" },
  tasks: {
    label: "Tasks",
    iconOn: "checkmark-done",
    iconOff: "checkmark-done-outline",
  },
  "record-placeholder": {
    // Center slot. Icon is rendered invisibly (transparent 22x22 spacer);
    // the visible mic button is overlaid above the tab bar. Label "Home"
    // renders identically to siblings so it shares their baseline.
    label: "Home",
    iconOn: "mic",
    iconOff: "mic-outline",
  },
  insights: { label: "Insights", iconOn: "bulb", iconOff: "bulb-outline" },
  entries: { label: "Entries", iconOn: "journal", iconOff: "journal-outline" },
};

const TAB_ORDER: TabKey[] = [
  "goals",
  "tasks",
  "record-placeholder",
  "insights",
  "entries",
];

function CustomTabBar({
  state,
  navigation,
  isDark,
}: BottomTabBarProps & { isDark: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const tabBarBg = isDark ? "#0B0B12" : "#FFFFFF";
  const tabBarBorder = isDark ? "rgba(255,255,255,0.08)" : "#E4E4E7";
  const activeTint = isDark ? BRAND_PURPLE_DARK : BRAND_PURPLE;
  const inactiveTint = isDark
    ? "rgba(255,255,255,0.62)"
    : "rgba(39,39,42,0.62)";

  // Figure out which slot is currently focused for tint purposes.
  // state.routes contains EVERY screen registered in the Tabs group,
  // including the hidden ones (index, profile). We filter to the five
  // that actually appear in the bar.
  const focusedName = state.routes[state.index]?.name;
  // "Home" button is active when the user is on the index (Home)
  // route, which renders when the active segment is "index".
  const isOnHome = focusedName === "index";

  // Tab bar vertical metrics. Content area is 52pt tall; the inset
  // pad below is either the device's safe-area bottom (e.g. 34 on
  // iPhones with home indicators) or a static 16pt floor so bars
  // look consistent on older devices.
  const bottomPad = Math.max(insets.bottom, 16);
  const contentHeight = 52;
  const totalHeight = contentHeight + bottomPad;

  return (
    <View
      style={{
        height: totalHeight,
        paddingBottom: bottomPad,
        backgroundColor: tabBarBg,
        borderTopWidth: 1,
        borderTopColor: tabBarBorder,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          height: contentHeight,
        }}
      >
        {TAB_ORDER.map((tabKey) => {
          const isCenter = tabKey === "record-placeholder";
          const active =
            (tabKey === "record-placeholder" && isOnHome) ||
            focusedName === tabKey;
          const meta = TAB_META[tabKey];
          const tint = active ? activeTint : inactiveTint;
          return (
            <Pressable
              key={tabKey}
              accessibilityRole="tab"
              accessibilityLabel={
                isCenter
                  ? "Open Home to record a brain dump"
                  : meta.label
              }
              onPress={() => {
                if (isCenter) {
                  // Medium impact on the record button — primary
                  // action of the app, deserves tactile weight.
                  Haptics.impactAsync(
                    Haptics.ImpactFeedbackStyle.Medium
                  ).catch(() => {});
                  router.navigate("/(tabs)");
                  return;
                }
                Haptics.selectionAsync().catch(() => {});
                navigation.navigate(tabKey);
              }}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isCenter ? (
                  // The center tab's "icon" is a transparent spacer.
                  // The visible mic lives in the overlay below.
                  <View style={{ width: 22, height: 22 }} />
                ) : (
                  <Ionicons
                    name={(active ? meta.iconOn : meta.iconOff) as never}
                    size={22}
                    color={tint}
                  />
                )}
              </View>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "500",
                  color: tint,
                }}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Raised mic button overlay. Positioned absolutely so it has
          zero influence on the tab row's flex layout. `left: 50%` +
          `marginLeft: -32` horizontally centers a 64pt-wide circle.
          `top: -26` raises it 26pt above the tab bar's top edge. */}
      <RecordOverlayButton
        isDark={isDark}
        active={isOnHome}
        onPress={() => router.navigate("/(tabs)")}
      />
    </View>
  );
}

function RecordOverlayButton({
  isDark,
  active,
  onPress,
}: {
  isDark: boolean;
  active: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const targetColorValue = pressed || active ? 1 : 0;
  const colorAnim = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(colorAnim, {
      toValue: targetColorValue,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [targetColorValue, colorAnim]);

  const backgroundColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [RECORD_FILL_INACTIVE, RECORD_FILL_ACTIVE],
  });

  // `top: -36` raises the button so its bottom edge sits at y=28 in
  // the tab content area — leaving a 5pt gap above the "Home" label
  // (label occupies y=33-44 in the 52pt content area with a 22pt icon
  // slot + 3pt gap + 11pt label centered). The prior `top: -26` had
  // the button bottom at y=38, eating the top of the label.
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: "50%",
        top: -36,
        marginLeft: -32,
        width: 64,
        height: 64,
        zIndex: 10,
      }}
    >
      <Animated.View
        style={{
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
          onPress={onPress}
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
    </View>
  );
}
