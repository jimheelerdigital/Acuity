import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { WELCOME_CORAL } from "@/lib/welcome/look";

/**
 * The welcome-flow tour card: same brand coral and white type as the
 * welcome screens, so the tour reads as the last step of one flow.
 * Rendered by TourProvider in welcome mode.
 *
 * Layout (build 161, per Jimmy): its own segmented progress (one segment
 * per stop, so it starts at 1 of 5 rather than half full), "Skip tour" as a
 * quiet link top-right, and the bottom row is the pair you'd expect —
 * Back on the left, Next on the right.
 *
 * ⚠️ Every Pressable uses an OBJECT style. On RN 0.81.5 in this app a
 * `({pressed}) => ({...})` style silently doesn't apply (see FunnelCta in
 * app/onboarding-new/_v10/_ui.tsx) — build 158 shipped invisible buttons
 * because of it.
 */
export function WelcomeTourCard({
  label,
  title,
  body,
  cta,
  stop,
  stops,
  isFirst,
  isLast,
  onNext,
  onBack,
  onSkip,
}: {
  label: string;
  title: string;
  body: string;
  cta: string;
  /** 0-based index of this card. */
  stop: number;
  /** Number of tour stops (the final "all set" card fills every segment). */
  stops: number;
  isFirst: boolean;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const { tokens } = useTheme();
  const filled = isLast ? stops : stop + 1;
  return (
    <View
      style={{
        width: 340,
        maxWidth: "100%",
        borderRadius: 24,
        overflow: "hidden",
        shadowColor: "#280a00",
        shadowOpacity: 0.3,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 16 },
      }}
    >
      <LinearGradient
        colors={[WELCOME_CORAL.top, WELCOME_CORAL.mid, WELCOME_CORAL.bottom]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ padding: 18 }}
      >
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: stops, now: filled }}
          style={{ flexDirection: "row", gap: 6 }}
        >
          {Array.from({ length: stops }, (_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: i < filled ? "#ffffff" : "rgba(255,255,255,0.35)",
              }}
            />
          ))}
        </View>

        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text
            style={{
              flex: 1,
              fontFamily: tokens.fontSans,
              fontSize: 12,
              fontWeight: "700",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#ffffff",
            }}
          >
            {label}
          </Text>
          {!isLast ? (
            <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip tour" hitSlop={10}>
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, fontWeight: "600", color: "#ffffff", textDecorationLine: "underline" }}>
                Skip tour
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={{ marginTop: 6, fontFamily: "Manrope_800ExtraBold", fontSize: 22, lineHeight: 26, color: "#ffffff" }}>
          {title}
        </Text>
        <Text style={{ marginTop: 6, fontFamily: tokens.fontSans, fontSize: 15, lineHeight: 21, color: "#ffffff" }}>
          {body}
        </Text>

        <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
          {!isFirst ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{
                minHeight: 46,
                paddingHorizontal: 16,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: "rgba(255,255,255,0.8)",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <Ionicons name="chevron-back" size={16} color="#ffffff" />
              <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 16, color: "#ffffff" }}>Back</Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel={isLast ? "Finish" : "Next"}
            style={{
              minHeight: 46,
              paddingHorizontal: 22,
              borderRadius: 999,
              backgroundColor: "#ffffff",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 16, color: WELCOME_CORAL.ink }}>{cta}</Text>
            {!isLast ? <Ionicons name="chevron-forward" size={16} color={WELCOME_CORAL.ink} /> : null}
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}
