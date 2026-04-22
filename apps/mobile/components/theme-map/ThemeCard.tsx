import { Pressable, Text, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Polyline,
  Stop,
} from "react-native-svg";

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
 * Theme card with 36px sparkline. Header + mention count + dot,
 * middle sparkline, footer with first-mentioned-days-ago + trend.
 * Entrance animation intentionally omitted on mobile (matches the
 * constellation's static-for-now stance).
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

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 14,
        borderWidth: 1,
        borderColor: pressed ? "#7C3AED" : "rgba(255,255,255,0.08)",
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 8,
        marginHorizontal: 20,
      })}
      className="bg-white dark:bg-[#1E1E2E]"
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{ fontSize: 15, fontWeight: "600" }}
          className="text-zinc-900 dark:text-zinc-50"
          numberOfLines={1}
        >
          {name}
        </Text>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
        >
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
            style={{ fontSize: 12 }}
            className="text-zinc-400 dark:text-zinc-500"
          >
            {mentionCount}
          </Text>
        </View>
      </View>

      <Sparkline data={sparkline} color={fill} />

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 6,
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
          {trendDescription}
        </Text>
      </View>
    </Pressable>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) {
    return <View style={{ height: 36, marginTop: 8 }} />;
  }
  const w = 300;
  const h = 36;
  const max = Math.max(...data, 1);
  const stepX = data.length > 1 ? w / (data.length - 1) : w;

  const pts = data.map((v, i) => ({
    x: i * stepX,
    y: h - (v / max) * (h - 4) - 2,
  }));

  const line = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const fill = `${pts.map((p) => `${p.x},${p.y}`).join(" ")} ${w},${h} 0,${h}`;

  return (
    <Svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      width="100%"
      height={36}
      style={{ marginTop: 8 }}
    >
      <Defs>
        <LinearGradient id="tm-spark" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Polyline points={fill} fill="url(#tm-spark)" stroke="none" />
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
