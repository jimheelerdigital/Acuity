import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";

import { HeroCard } from "@/components/acuity";
import { useTheme } from "@/contexts/theme-context";

/**
 * WeeklyInsightCard — secondary HeroCard that teases the next weekly
 * report. The full delivery moment ("gift unfolding") wasn't in the
 * design bundle (called out in Outstanding) — for now this routes to
 * the existing /insights/state-of-me detail screen where the report
 * lives.
 *
 * Layout: gradient sparkle puck + eyebrow + Pro pill + preview + when.
 * Trailing chevron. Tap fires `onPress` (parent navigates).
 *
 * The Pro pill is rendered only when `isPro` is true — for free
 * users we still show the teaser as a preview but hide the explicit
 * Pro chip so it doesn't read as paywall-gated until they tap.
 */

interface WeeklyInsightCardProps {
  preview: string;
  /** Optional context — e.g. "Unwraps Sun, 8am". */
  whenLabel?: string;
  isPro?: boolean;
  onPress: () => void;
}

export function WeeklyInsightCard({
  preview,
  whenLabel,
  isPro = false,
  onPress,
}: WeeklyInsightCardProps) {
  const { tokens } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <HeroCard variant="secondary" padding={18}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {/* Sparkle puck — gradient secondary fill */}
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={tokens.gradSecondary.colors}
              locations={tokens.gradSecondary.locations}
              start={tokens.gradSecondary.start}
              end={tokens.gradSecondary.end}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="sparkles" size={20} color="#ffffff" />
            </LinearGradient>
          </View>

          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: tokens.textTer,
                }}
              >
                Weekly insight
              </Text>
              {isPro && (
                <View
                  style={{
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <LinearGradient
                    colors={tokens.gradSecondary.colors}
                    start={tokens.gradSecondary.start}
                    end={tokens.gradSecondary.end}
                    style={{
                      paddingVertical: 2,
                      paddingHorizontal: 7,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: tokens.fontMono,
                        fontSize: 9,
                        fontWeight: "700",
                        letterSpacing: 0.5,
                        color: "#ffffff",
                      }}
                    >
                      PRO
                    </Text>
                  </LinearGradient>
                </View>
              )}
            </View>
            <Text
              numberOfLines={2}
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 16,
                fontWeight: "700",
                letterSpacing: -0.3,
                color: tokens.text,
                lineHeight: 20,
              }}
            >
              {preview}
            </Text>
            {whenLabel && (
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 12,
                  color: tokens.textTer,
                }}
              >
                {whenLabel}
              </Text>
            )}
          </View>

          <Ionicons
            name="chevron-forward"
            size={16}
            color={tokens.textTer}
          />
        </View>
      </HeroCard>
    </Pressable>
  );
}
