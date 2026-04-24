import { Pressable, Text, View } from "react-native";

import { formatRelativeDate } from "@acuity/shared";

type Sentiment = "positive" | "neutral" | "challenging";

const DOT: Record<Sentiment, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#94A3B8",
};

const BADGE_BG: Record<Sentiment, string> = {
  positive: "rgba(52,211,153,0.15)",
  challenging: "rgba(248,113,113,0.15)",
  neutral: "rgba(148,163,184,0.15)",
};

const BADGE_FG: Record<Sentiment, string> = {
  positive: "#34D399",
  challenging: "#FCA5A5",
  neutral: "#CBD5E1",
};

/**
 * Clean theme row — sentiment dot, name, pill badge with count, and
 * a muted single-line metadata strip. No sparkline (the visualization
 * above carries the temporal story; repeating it inline as a 7-day
 * squiggle adds noise, not signal).
 *
 * Tap target is the whole row. Dividers between rows are drawn by
 * the parent list via thin negative-space gaps, not hard borders.
 */
export function ThemeListRow({
  name,
  mentionCount,
  sentiment,
  firstMentionedAt,
  lastMentionedAt,
  onPress,
}: {
  name: string;
  mentionCount: number;
  sentiment: Sentiment;
  firstMentionedAt: string;
  lastMentionedAt: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 16,
        paddingHorizontal: 18,
        paddingVertical: 14,
        marginHorizontal: 20,
        marginBottom: 6,
        backgroundColor: "rgba(30,30,46,0.6)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.04)",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: DOT[sentiment],
              shadowColor: DOT[sentiment],
              shadowOpacity: sentiment === "neutral" ? 0 : 0.6,
              shadowRadius: 3,
            }}
          />
          <Text
            style={{
              fontSize: 15,
              fontWeight: "600",
              color: "#FAFAFA",
              letterSpacing: 0,
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            {sentenceCase(name)}
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: BADGE_BG[sentiment],
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: BADGE_FG[sentiment],
              letterSpacing: 0.2,
            }}
          >
            {mentionCount}
          </Text>
        </View>
      </View>

      <Text
        style={{
          fontSize: 11,
          color: "rgba(161,161,170,0.7)",
          marginTop: 6,
          marginLeft: 18,
        }}
        numberOfLines={1}
      >
        First seen {formatRelativeDate(firstMentionedAt)} · Recent:{" "}
        {formatRelativeDate(lastMentionedAt)}
      </Text>
    </Pressable>
  );
}

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
