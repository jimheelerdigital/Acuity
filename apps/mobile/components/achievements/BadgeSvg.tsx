/**
 * Renders a badge SVG by slug + state. SVG XML is inlined into the JS
 * bundle via lib/badge-xml.ts so there's no runtime asset fetch.
 *
 * The badge SVGs are 200×200 viewBox + transparent background so the
 * caller controls visual size by passing `size`. Locked-state SVGs
 * include their own dimmed silhouette + lock visual; callers don't
 * need to layer anything on top.
 */

import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";

import { getBadgeXml } from "@/lib/badge-xml";

export function BadgeSvg({
  slug,
  state = "earned",
  size = 96,
}: {
  slug: string;
  state?: "earned" | "locked";
  size?: number;
}) {
  const xml = getBadgeXml(slug, state);
  if (!xml) {
    // Fallback for achievements without a custom badge SVG (e.g.
    // guided_start) — a generic trophy so the celebration modal always
    // shows a badge instead of a blank space (build-68 missing-icon bug).
    return (
      <View
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name="trophy"
          size={Math.round(size * 0.66)}
          color={state === "locked" ? "#6B6B7B" : "#F5C451"}
        />
      </View>
    );
  }
  return <SvgXml xml={xml} width={size} height={size} />;
}
