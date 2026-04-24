import { Pressable, ScrollView, Text, View } from "react-native";

export type TimeWindow = "week" | "month" | "3months" | "6months" | "all";

const CHIPS: { key: TimeWindow; label: string }[] = [
  { key: "week", label: "Last week" },
  { key: "month", label: "Last month" },
  { key: "3months", label: "3 months" },
  { key: "6months", label: "6 months" },
  { key: "all", label: "All time" },
];

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
      contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
      style={{ paddingVertical: 4 }}
    >
      {CHIPS.map((c) => {
        const active = c.key === value;
        return (
          <Pressable
            key={c.key}
            onPress={() => onChange(c.key)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: active
                ? "rgba(124,58,237,0.13)"
                : "transparent",
              borderWidth: 1,
              borderColor: active ? "#7C3AED" : "rgba(148,163,184,0.25)",
            }}
          >
            <View style={active ? { transform: [{ scale: 1 }] } : undefined}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: active ? "#C4B5FD" : "rgba(148,163,184,0.85)",
                }}
              >
                {c.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
