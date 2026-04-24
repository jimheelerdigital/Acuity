import { Text, View } from "react-native";

/**
 * Small horizontal legend under the bubble cluster — colored dot +
 * label for each sentiment band. Understated so it reads as a key,
 * not a hero row.
 */
export function SentimentLegend() {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 20,
        marginHorizontal: 20,
        marginTop: 4,
        paddingVertical: 10,
      }}
    >
      <Item color="#F87171" label="Challenging" />
      <Item color="#94A3B8" label="Neutral" />
      <Item color="#34D399" label="Positive" />
    </View>
  );
}

function Item({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.6,
          shadowRadius: 3,
        }}
      />
      <Text
        style={{
          fontSize: 11,
          color: "rgba(228,228,231,0.7)",
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
