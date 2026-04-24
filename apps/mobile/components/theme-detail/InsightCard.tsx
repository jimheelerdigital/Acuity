import { Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/**
 * "What Acuity notices" card — soft purple gradient background,
 * uppercase accent label, readable body copy. Mirrors the web
 * violet-50/violet-950 treatment but tuned for dark mode only on
 * mobile.
 */
export function InsightCard({ text }: { text: string }) {
  return (
    <View
      style={{
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(124,58,237,0.25)",
      }}
    >
      <Svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0 }}
      >
        <Defs>
          <LinearGradient id="insight-bg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#2E1A5B" stopOpacity={0.6} />
            <Stop offset="100%" stopColor="#1A1230" stopOpacity={0.4} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#insight-bg)" />
      </Svg>

      <View style={{ padding: 20 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: "#C4B5FD",
            marginBottom: 10,
          }}
        >
          What Acuity notices
        </Text>
        <Text
          style={{
            fontSize: 15,
            lineHeight: 23,
            color: "#E4E4E7",
          }}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}
