import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * Glass-blur callout that appears in-place when a planet is tapped on
 * the orbital Theme Map. Matches the design's insight-card glass
 * treatment (screen-thememap.jsx lines 204-233): BlurView with
 * theme-aware tint + 0.5pt lineStrong border, padded body, sparkle-
 * icon-style row, etc.
 *
 * Content:
 *   - Header row: hue-dot + theme name
 *   - Stat row: mention count + sentiment band
 *   - Top 3 co-occurrence chips
 *   - Latest entry excerpt (italic, soft)
 *   - "See full detail" CTA → /insights/theme/[id]
 *
 * Backdrop tap dismisses; inner card swallows taps.
 */

export interface PlanetCalloutData {
  themeId: string;
  themeName: string;
  hue: number;
  mentionCount: number;
  sentimentBand: "positive" | "neutral" | "challenging";
  coOccurrences: Array<{ themeName: string; count: number }>;
  excerpt: string | null;
}

interface Props {
  data: PlanetCalloutData;
  onDismiss: () => void;
}

const SENTIMENT_LABEL: Record<PlanetCalloutData["sentimentBand"], string> = {
  positive: "Mostly positive",
  neutral: "Steady",
  challenging: "Mostly challenging",
};

export function PlanetCallout({ data, onDismiss }: Props) {
  const { tokens, resolved } = useTheme();
  const router = useRouter();

  const sentimentTint =
    data.sentimentBand === "positive"
      ? tokens.good
      : data.sentimentBand === "challenging"
        ? tokens.bad
        : tokens.textTer;

  const handleSeeDetail = () => {
    onDismiss();
    router.push(`/insights/theme/${encodeURIComponent(data.themeId)}`);
  };

  return (
    <Pressable
      onPress={onDismiss}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
      }}
    >
      <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 340 }}>
        <BlurView
          intensity={50}
          tint={resolved === "dark" ? "dark" : "light"}
          style={{
            borderRadius: 22,
            overflow: "hidden",
            borderWidth: 0.5,
            borderColor: tokens.lineStrong,
          }}
        >
          <View
            style={{
              padding: 18,
              backgroundColor:
                resolved === "dark"
                  ? "rgba(22, 18, 38, 0.7)"
                  : "rgba(255, 255, 255, 0.78)",
            }}
          >
            {/* Header — hue dot + theme name */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: `hsl(${data.hue}, 65%, 60%)`,
                }}
              />
              <Text
                style={{
                  flex: 1,
                  fontFamily: tokens.fontDisplay,
                  fontSize: 18,
                  fontWeight: "700",
                  letterSpacing: -0.3,
                  color: tokens.text,
                }}
                numberOfLines={1}
              >
                {data.themeName}
              </Text>
            </View>

            {/* Stat row */}
            <View
              style={{
                flexDirection: "row",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: tokens.fontMono,
                    fontSize: 9,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    color: tokens.textTer,
                  }}
                >
                  Mentions
                </Text>
                <Text
                  style={{
                    fontFamily: tokens.fontDisplay,
                    fontSize: 22,
                    fontWeight: "700",
                    letterSpacing: -0.4,
                    color: tokens.text,
                    marginTop: 2,
                  }}
                >
                  {data.mentionCount}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: tokens.fontMono,
                    fontSize: 9,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    color: tokens.textTer,
                  }}
                >
                  Sentiment
                </Text>
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 13,
                    fontWeight: "600",
                    color: sentimentTint,
                    marginTop: 4,
                  }}
                  numberOfLines={1}
                >
                  {SENTIMENT_LABEL[data.sentimentBand]}
                </Text>
              </View>
            </View>

            {/* Co-occurrences */}
            {data.coOccurrences.length > 0 && (
              <View style={{ marginBottom: 14 }}>
                <Text
                  style={{
                    fontFamily: tokens.fontMono,
                    fontSize: 9,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    color: tokens.textTer,
                    marginBottom: 6,
                  }}
                >
                  Often with
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  {data.coOccurrences.slice(0, 3).map((c) => (
                    <View
                      key={c.themeName}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 999,
                        borderWidth: 0.5,
                        borderColor: tokens.line,
                        backgroundColor:
                          resolved === "dark"
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(0,0,0,0.03)",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: tokens.fontSans,
                          fontSize: 11,
                          fontWeight: "600",
                          color: tokens.textSec,
                        }}
                      >
                        {c.themeName}
                        <Text style={{ color: tokens.textTer }}>
                          {" · "}
                          {c.count}
                        </Text>
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Latest excerpt */}
            {data.excerpt && (
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 12,
                  fontStyle: "italic",
                  lineHeight: 18,
                  color: tokens.textSec,
                  marginBottom: 14,
                }}
                numberOfLines={3}
              >
                &ldquo;{data.excerpt}&rdquo;
              </Text>
            )}

            {/* See full detail CTA */}
            <Pressable
              onPress={handleSeeDetail}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 0.5,
                borderColor: tokens.lineStrong,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: tokens.text,
                }}
              >
                See full detail
              </Text>
            </Pressable>
          </View>
        </BlurView>
      </Pressable>
    </Pressable>
  );
}
