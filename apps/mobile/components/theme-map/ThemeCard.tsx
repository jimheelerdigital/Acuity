import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";

type Sentiment = "positive" | "neutral" | "challenging";

const SENTIMENT_HEX: Record<Sentiment, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#7C3AED",
};

const SENTIMENT_DOT: Record<Sentiment, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#94a3b8",
};

/**
 * Theme card row. Two columns: name + metadata on the left, compact
 * last-7-days sparkline on the right constrained to ~30% row width.
 * The old full-width sparkline overflowed the screen edge on narrow
 * viewports; capping it + right-aligning fixes the cutoff.
 */
export function ThemeCard({
  name,
  mentionCount,
  sentiment,
  sparkline,
  firstMentionedDaysAgo,
  trendDescription,
  onPress,
}: {
  name: string;
  mentionCount: number;
  sentiment: Sentiment;
  sparkline: number[];
  firstMentionedDaysAgo: number;
  trendDescription: string;
  onPress?: () => void;
}) {
  const fill = SENTIMENT_HEX[sentiment];
  const dot = SENTIMENT_DOT[sentiment];
  const trimmed = sparkline.slice(-7);

  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 8,
        marginHorizontal: 20,
      }}
      className="bg-white dark:bg-[#1E1E2E]"
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        {/* Left — name + metadata */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: dot,
                shadowColor: dot,
                shadowOpacity: sentiment === "neutral" ? 0 : 0.6,
                shadowRadius: 4,
              }}
            />
            <Text
              style={{
                fontSize: 15,
                fontWeight: "600",
                letterSpacing: 0.5,
                flexShrink: 1,
              }}
              className="text-zinc-900 dark:text-zinc-50 uppercase"
              numberOfLines={1}
            >
              {name}
            </Text>
            <Text
              style={{ fontSize: 12 }}
              className="text-zinc-400 dark:text-zinc-500"
            >
              {mentionCount}
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
            }}
          >
            <Text
              style={{ fontSize: 11 }}
              className="text-zinc-400 dark:text-zinc-500"
            >
              First {firstMentionedDaysAgo}d ago
            </Text>
            <Text
              style={{ fontSize: 11 }}
              className="text-zinc-400 dark:text-zinc-500"
            >
              ·
            </Text>
            <Text
              style={{ fontSize: 11, flexShrink: 1 }}
              className="text-zinc-400 dark:text-zinc-500"
              numberOfLines={1}
            >
              {trendDescription}
            </Text>
          </View>
        </View>

        {/* Right — compact sparkline, hard-capped in width */}
        <View style={{ width: "30%", maxWidth: 120, minWidth: 60 }}>
          <Sparkline data={trimmed} color={fill} />
        </View>
      </View>
    </Pressable>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const h = 28;
  if (data.length === 0) return <View style={{ height: h }} />;
  if (data.length === 1) {
    const w = 80;
    return (
      <Svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        width="100%"
        height={h}
      >
        <Circle cx={w / 2} cy={h / 2} r={3} fill={color} />
      </Svg>
    );
  }

  const w = 80;
  const max = Math.max(...data, 1);
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => ({
    x: i * stepX,
    y: h - (v / max) * (h - 4) - 2,
  }));
  const line = pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <Svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      width="100%"
      height={h}
    >
      <Polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
