import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/contexts/theme-context";
import { WELCOME_CORAL } from "@/lib/welcome/look";

/**
 * The welcome-flow tour card (approved design, 2026-10-12): the same coral
 * card, white type and continuous progress bar as the welcome screens, so
 * the tour reads as the last step of one flow rather than a second tour.
 * Rendered by TourProvider in welcome mode.
 */
export function WelcomeTourCard({
  label,
  title,
  body,
  cta,
  progress,
  isLast,
  onNext,
  onSkip,
}: {
  label: string;
  title: string;
  body: string;
  cta: string;
  progress: number;
  isLast: boolean;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { tokens } = useTheme();
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <View
      style={{
        width: 340,
        maxWidth: "100%",
        borderRadius: 24,
        overflow: "hidden",
        shadowColor: "#280a00",
        shadowOpacity: 0.35,
        shadowRadius: 25,
        shadowOffset: { width: 0, height: 20 },
      }}
    >
      <LinearGradient
        colors={[WELCOME_CORAL.top, WELCOME_CORAL.card]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={{ padding: 18 }}
      >
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
          style={{ height: 4, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.28)", overflow: "hidden" }}
        >
          <View style={{ width: `${pct}%`, height: "100%", backgroundColor: "#ffffff" }} />
        </View>
        <Text
          style={{
            marginTop: 14,
            fontFamily: tokens.fontSans,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.9)",
          }}
        >
          {label}
        </Text>
        <Text style={{ marginTop: 4, fontFamily: "Manrope_800ExtraBold", fontSize: 22, lineHeight: 26, color: "#ffffff" }}>
          {title}
        </Text>
        <Text style={{ marginTop: 6, fontFamily: tokens.fontSans, fontSize: 15, lineHeight: 21, color: "#ffffff" }}>
          {body}
        </Text>
        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          {isLast ? (
            <View />
          ) : (
            <Pressable
              onPress={onSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip tour"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }}
            >
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, color: "rgba(255,255,255,0.85)" }}>
                Skip tour
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel={isLast ? "Finish" : "Next"}
            style={({ pressed }) => ({
              minHeight: 46,
              paddingHorizontal: 22,
              borderRadius: 999,
              backgroundColor: "#ffffff",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontFamily: tokens.fontSans, fontSize: 16, fontWeight: "700", color: WELCOME_CORAL.ink }}>
              {cta}
            </Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}
