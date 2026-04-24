import { Pressable, ScrollView, Text, View } from "react-native";

export type TimeWindow = "week" | "month" | "3months" | "6months" | "all";

const CHIPS: { key: TimeWindow; label: string }[] = [
  { key: "week", label: "Last week" },
  { key: "month", label: "Last month" },
  { key: "3months", label: "3 months" },
  { key: "6months", label: "6 months" },
  { key: "all", label: "All time" },
];

/**
 * Segmented-pill time selector. Dark track, selected option filled in
 * accent purple with a soft shadow. Inactive options are quiet — no
 * border, just muted text on the dark track. Scrolls horizontally on
 * narrow screens; on wider viewports all five fit comfortably.
 */
export function TimeChips({
  value,
  onChange,
}: {
  value: TimeWindow;
  onChange: (next: TimeWindow) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20 }}
    >
      <View
        style={{
          flexDirection: "row",
          backgroundColor: "rgba(30,30,46,0.6)",
          borderRadius: 999,
          padding: 4,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
        }}
      >
        {CHIPS.map((c) => {
          const active = c.key === value;
          return (
            <Pressable
              key={c.key}
              onPress={() => onChange(c.key)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 999,
                backgroundColor: active ? "#7C3AED" : "transparent",
                shadowColor: active ? "#7C3AED" : "transparent",
                shadowOpacity: active ? 0.5 : 0,
                shadowRadius: active ? 10 : 0,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: active ? "600" : "500",
                  color: active ? "#FFFFFF" : "rgba(228,228,231,0.7)",
                  letterSpacing: 0.1,
                }}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
