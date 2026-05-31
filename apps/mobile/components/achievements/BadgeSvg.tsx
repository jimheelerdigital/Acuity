/**
 * Renders a badge SVG by slug + state. SVG XML is inlined into the JS
 * bundle via lib/badge-xml.ts so there's no runtime asset fetch.
 *
 * The badge SVGs are 200×200 viewBox + transparent background so the
 * caller controls visual size by passing `size`. Locked-state SVGs
 * include their own dimmed silhouette + lock visual; callers don't
 * need to layer anything on top.
 */

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
  if (!xml) return null;
  return <SvgXml xml={xml} width={size} height={size} />;
}
