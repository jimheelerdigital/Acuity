import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { forwardRef, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { Animated, Pressable, Text, View } from "react-native";
import { AttachStep } from "react-native-spotlight-tour";

import { TOUR_STEP_INDEX } from "@/components/tour/steps";
import { TourTarget } from "@/components/tour/TourTarget";
import { useSafeAreaInsets } from "react-native-safe-area-context";


// v1.3.x first-login tour step copy. Order numbers match the
// orchestrator's expected sequence (1: mic → 2: dashboard → 3-6:
// tabs → 7: avatar/settings). Centralizing here keeps the wrapping
// JSX clean.
// Tour step content + indices now live in @/components/tour/steps and
// are rendered by TourProvider; here we only attach targets by index.

import { useTheme } from "@/contexts/theme-context";
import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * Custom tab bar — 5 slots all rendered by ONE code path so the labels
 * are guaranteed to share a baseline. The raised mic button is an
 * absolute overlay positioned above the center slot, and has zero
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

export default function TabsLayout() {
  const { tokens, resolved } = useTheme();
  const isDark = resolved === "dark";

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <CustomTabBar {...props} isDark={isDark} tokens={tokens} />
      )}
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
  tokens,
}: BottomTabBarProps & { isDark: boolean; tokens: AcuityTokens }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const tabBarBg = tokens.bg;
  const tabBarBorder = tokens.line;
  const activeTint = tokens.primary;
  const inactiveTint = tokens.textSec;

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
          // Tour anchor: steps 3-6 spotlight the bottom-tab item for that
          // section (the tour navigates to the page, then highlights its
          // tab so users learn where it lives). The center/mic slot has
          // its own AttachStep on the raised button below.
          const tourIndex =
            tabKey === "entries"
              ? TOUR_STEP_INDEX.entries
              : tabKey === "tasks"
                ? TOUR_STEP_INDEX.tasks
                : tabKey === "insights"
                  ? TOUR_STEP_INDEX.insights
                  : tabKey === "goals"
                    ? TOUR_STEP_INDEX.goals
                    : null;
          const slotJsx = (
            <Pressable
              key={tabKey}
              accessibilityRole="tab"
              accessibilityLabel={
                isCenter
                  ? "Open Home to record an entry"
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
          if (tourIndex == null) return slotJsx;
          // AttachStep adds its own wrapper View (default alignSelf:
          // flex-start, no flex) — without fill + flex:1 the tab slots
          // collapse and pack left ("GoalsTasks"). fill = stretch height;
          // flex:1 = equal width in the row.
          return (
            <AttachStep key={tabKey} index={tourIndex} fill style={{ flex: 1 }}>
              <TourTarget style={{ flex: 1 }}>{slotJsx}</TourTarget>
            </AttachStep>
          );
        })}
      </View>

      {/* Raised mic button overlay. The ABSOLUTE positioning now lives
          on the AttachStep wrapper (below), not RecordOverlayButton —
          spotlight measures its own wrapper via measureInWindow, so the
          positioned, sized wrapper is what gets the spotlight cutout.
          (Build-68 bug: AttachStep wrapped the absolutely-positioned
          button, so the in-flow 0×0 wrapper measured the wrong rect and
          the mic cutout landed in the wrong place.) RecordOverlayButton
          now renders a relative 64×64 button that fills the wrapper. */}
      <AttachStep
        index={TOUR_STEP_INDEX.mic}
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
        <RecordOverlayButton
          tokens={tokens}
          active={isOnHome}
          onPress={() => router.navigate("/(tabs)")}
          onLongPress={() => {
            // Product change (Option A): long-press starts a new entry
            // directly (skips Home), with a heavy haptic to signal it
            // does more than navigate. Single tap keeps the old behavior
            // (navigate to Home).
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(
              () => {}
            );
            router.push("/record");
          }}
        />
      </AttachStep>
    </View>
  );
}

const RecordOverlayButton = forwardRef<
  View,
  {
    tokens: AcuityTokens;
    active: boolean;
    onPress: () => void;
    onLongPress?: () => void;
  }
>(function RecordOverlayButton({ tokens, active, onPress, onLongPress }, ref) {
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

  // Q11a (2026-05-21): replaced four hardcoded BRAND_PURPLE constants
  // with palette tokens. Animation pattern preserved — interpolate
  // between primaryLo (idle/inactive) and primary (active/pressed)
  // so the button "lights up" on focus.
  const backgroundColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [tokens.primaryLo, tokens.primary],
  });

  // `top: -36` raises the button so its bottom edge sits at y=28 in
  // the tab content area — leaving a 5pt gap above the "Home" label
  // (label occupies y=33-44 in the 52pt content area with a 22pt icon
  // slot + 3pt gap + 11pt label centered). The prior `top: -26` had
  // the button bottom at y=38, eating the top of the label.
  //
  // v1.3.x: forwarded ref so react-native-copilot can measure this
  // outer View when the first-login tour highlights the mic.
  return (
    <View
      ref={ref}
      collapsable={false}
      pointerEvents="box-none"
      style={{
        // Positioning moved to the AttachStep wrapper so the spotlight
        // measures the right rect; this View just fills the 64×64 wrapper.
        width: 64,
        height: 64,
      }}
    >
      <Animated.View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor,
          borderWidth: 4,
          borderColor: tokens.bg,
          shadowColor: tokens.glowPrimary.color,
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: tokens.glowPrimary.radius,
          shadowOpacity: tokens.glowPrimary.opacity,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: pressed ? 0.94 : 1 }],
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record an entry. Long-press to start now, or tap to open Home."
          onPress={onPress}
          onLongPress={onLongPress}
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
});
