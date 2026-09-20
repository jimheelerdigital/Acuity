import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GoalsPane } from "@/components/growth/goals-pane";
import { HabitsPane } from "@/components/growth/habits-pane";
import { useTheme } from "@/contexts/theme-context";
import { isHabitsEnabled } from "@/lib/feature-flags";

/**
 * Growth — the combined forward-looking surface. When habits are enabled, a
 * top segmented control flips between Habits (default, at the forefront) and
 * Goals; both panes are preserved in full. When habits are OFF (current
 * production), this renders exactly the Goals surface it always was, titled
 * "Goals" with no toggle — so nothing changes for users until habits ship.
 *
 * The route stays /(tabs)/goals so existing deep links keep working; a
 * `?pane=goals` param lands directly on the Goals pane.
 */

type Pane = "habits" | "goals";

export default function GrowthTab() {
  const { tokens } = useTheme();
  const habitsOn = isHabitsEnabled();
  const params = useLocalSearchParams<{ pane?: string }>();
  const [pane, setPane] = useState<Pane>(
    params.pane === "goals" ? "goals" : "habits"
  );

  // A deep link can arrive while the tab is already mounted (e.g. goal
  // suggestions). Honor a later ?pane without stomping a manual flip on
  // re-renders that don't carry the param.
  useEffect(() => {
    if (params.pane === "goals") setPane("goals");
    else if (params.pane === "habits") setPane("habits");
  }, [params.pane]);

  const showHabits = habitsOn && pane === "habits";

  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1"
      style={{ backgroundColor: tokens.bg }}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <Text
          className="text-4xl font-bold"
          style={{ color: tokens.text, marginBottom: habitsOn ? 14 : 4 }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {habitsOn ? "Growth" : "Goals"}
        </Text>

        {habitsOn ? (
          <SegmentedToggle value={pane} onChange={setPane} />
        ) : null}
      </View>

      {showHabits ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <HabitsPane />
        </ScrollView>
      ) : (
        <GoalsPane />
      )}
    </SafeAreaView>
  );
}

function SegmentedToggle({
  value,
  onChange,
}: {
  value: Pane;
  onChange: (p: Pane) => void;
}) {
  const { tokens } = useTheme();
  const segments: { key: Pane; label: string }[] = [
    { key: "habits", label: "Habits" },
    { key: "goals", label: "Goals" },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: tokens.cardBg,
        borderWidth: 1,
        borderColor: tokens.cardBorder,
        borderRadius: 12,
        padding: 4,
        gap: 4,
      }}
    >
      {segments.map((seg) => {
        const active = seg.key === value;
        return (
          <Pressable
            key={seg.key}
            onPress={() => onChange(seg.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={seg.label}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 9,
              alignItems: "center",
              backgroundColor: active ? tokens.primary : "transparent",
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 15,
                color: active ? "#ffffff" : tokens.textSec,
              }}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
