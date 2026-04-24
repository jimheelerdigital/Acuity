import { Pressable, Text, View } from "react-native";

import { formatRelativeDate, MOOD_LABELS } from "@acuity/shared";

/**
 * One mention row as a dark rounded card. Timestamp and mood sit on
 * top, two-line entry snippet below. Full row is the tap target.
 */
export function MentionCard({
  summary,
  mood,
  createdAt,
  onPress,
}: {
  summary: string | null;
  mood: string | null;
  createdAt: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: "rgba(30,30,46,0.7)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{ fontSize: 12, color: "rgba(161,161,170,0.8)", fontWeight: "500" }}
        >
          {formatRelativeDate(createdAt)}
        </Text>
        {mood ? (
          <Text
            style={{ fontSize: 12, color: "rgba(161,161,170,0.8)" }}
          >
            {MOOD_LABELS[mood] ?? mood}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          marginTop: 6,
          fontSize: 14,
          lineHeight: 20,
          color: "#E4E4E7",
        }}
        numberOfLines={3}
      >
        {summary ?? "(no summary)"}
      </Text>
    </Pressable>
  );
}
