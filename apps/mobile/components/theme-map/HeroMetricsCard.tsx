import { Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

type SentimentTone = "positive" | "challenging" | "neutral";

const TONE_DOT: Record<SentimentTone, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#94A3B8",
};

/**
 * Hero metrics card — three columns on a full-width rounded card with
 * a subtle purple-tinted dark gradient. Big numeric values with small
 * uppercase labels beneath. Top Theme column includes a sentiment dot.
 *
 * Gradient is rendered as an absolutely-positioned SVG under the
 * content so the card reads as a single rounded surface on both iOS
 * and Android (react-native has no native linear-gradient prop).
 */
export function HeroMetricsCard({
  themeCount,
  mentionCount,
  topTheme,
  topSentiment,
}: {
  themeCount: number;
  mentionCount: number;
  topTheme: string | null;
  topSentiment: SentimentTone | null;
}) {
  const topTruncated = useTopTheme(topTheme);

  return (
    <View
      style={{
        marginHorizontal: 20,
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <Svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0 }}
      >
        <Defs>
          <LinearGradient id="hero-bg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#1E1B4B" stopOpacity={0.95} />
            <Stop offset="60%" stopColor="#17172A" stopOpacity={1} />
            <Stop offset="100%" stopColor="#13131F" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero-bg)" />
      </Svg>

      <View
        style={{
          flexDirection: "row",
          paddingVertical: 24,
          paddingHorizontal: 16,
        }}
      >
        <Cell value={themeCount.toString()} label="Themes" />
        <Divider />
        <Cell value={mentionCount.toString()} label="Mentions" />
        <Divider />
        <TopThemeCell
          value={topTruncated.display}
          fullLength={topTruncated.full}
          sentiment={topSentiment}
        />
      </View>
    </View>
  );
}

function Cell({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 4 }}>
      <Text
        style={{
          fontSize: 36,
          fontWeight: "700",
          letterSpacing: -1.2,
          color: "#FAFAFA",
          lineHeight: 40,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 10,
          letterSpacing: 1.2,
          marginTop: 6,
          textTransform: "uppercase",
          color: "rgba(228,228,231,0.55)",
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function TopThemeCell({
  value,
  fullLength,
  sentiment,
}: {
  value: string;
  fullLength: number;
  sentiment: SentimentTone | null;
}) {
  // Scale the font when the top-theme name is long so a "commute
  // friction" doesn't get reduced to "commute…" while the Themes /
  // Mentions cells show 36pt numbers. Keep the visual weight.
  const fontSize = fullLength <= 6 ? 28 : fullLength <= 10 ? 22 : 18;

  return (
    <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          maxWidth: "100%",
        }}
      >
        {sentiment ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: TONE_DOT[sentiment],
              shadowColor: TONE_DOT[sentiment],
              shadowOpacity: 0.8,
              shadowRadius: 4,
            }}
          />
        ) : null}
        <Text
          style={{
            fontSize,
            fontWeight: "700",
            color: "#FAFAFA",
            letterSpacing: -0.3,
            flexShrink: 1,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 10,
          letterSpacing: 1.2,
          marginTop: 6,
          textTransform: "uppercase",
          color: "rgba(228,228,231,0.55)",
          fontWeight: "600",
        }}
      >
        Top theme
      </Text>
    </View>
  );
}

function Divider() {
  return (
    <View
      style={{
        width: 1,
        marginVertical: 8,
        backgroundColor: "rgba(255,255,255,0.08)",
      }}
    />
  );
}

function useTopTheme(raw: string | null): { display: string; full: number } {
  if (!raw) return { display: "—", full: 1 };
  const trimmed = raw.trim();
  return { display: sentenceCase(trimmed), full: trimmed.length };
}

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
