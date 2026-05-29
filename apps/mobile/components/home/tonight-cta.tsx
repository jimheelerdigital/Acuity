import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * TonightCTA — gradient primary card with mic icon, full-bleed
 * gradPrimary background, glow shadow (one of the four sanctioned
 * glow surfaces per design § "Glow rule"). Tap routes to /record.
 *
 * The eyebrow label is optional (e.g. "Tonight · 9:30pm" if we ever
 * surface the user's reminder time here). When omitted, the card is
 * a quieter "tap to record" prompt — matches current Home's
 * intention without the time annotation.
 */

interface TonightCTAProps {
  /** Eyebrow above the title (e.g. "Tonight · 9:30pm"). Optional. */
  eyebrow?: string;
  /** Main title. Default sets a punchy "Tap to record" call. */
  title?: string;
  /** Helper line below the title (a prompt question). */
  helper?: string;
  onPress: () => void;
}

export function TonightCTA({
  eyebrow,
  title = "Record what's on your mind",
  helper,
  onPress,
}: TonightCTAProps) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        borderRadius: tokens.radius.xl,
        overflow: "hidden",
        // Glow per design — outer shadow approximates `0 0 16px primary/0.30`.
        // RN doesn't render shadow under Android consistently, so elevation
        // covers Android with a softer fallback.
        shadowColor: tokens.glowPrimary.color,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: tokens.glowPrimary.radius,
        shadowOpacity: Platform.OS === "ios" ? tokens.glowPrimary.opacity : 0,
        elevation: 6,
      }}
    >
      <LinearGradient
        colors={tokens.gradPrimary.colors}
        locations={tokens.gradPrimary.locations}
        start={tokens.gradPrimary.start}
        end={tokens.gradPrimary.end}
        style={{
          padding: 20,
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          {eyebrow && (
            <Text
              style={{
                fontFamily: tokens.fontMono,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.4,
                color: "#ffffffbf",
                textTransform: "uppercase",
              }}
            >
              {eyebrow}
            </Text>
          )}
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 19,
              fontWeight: "700",
              letterSpacing: -0.4,
              color: "#ffffff",
              lineHeight: 23,
            }}
          >
            {title}
          </Text>
          {helper && (
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 12,
                color: "#ffffffcc",
              }}
            >
              {helper}
            </Text>
          )}
        </View>

        {/* Mic puck — translucent overlay disk on the gradient. */}
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#ffffff38",
            borderWidth: 1,
            borderColor: "#ffffff4d",
          }}
        >
          <Ionicons name="mic" size={24} color="#ffffff" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}
