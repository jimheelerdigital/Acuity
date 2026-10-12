import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { WELCOME_CORAL } from "@/lib/welcome/look";

/**
 * The welcome-flow tour card: the same brand coral, white type and
 * continuous progress bar as the welcome screens, so the tour reads as the
 * last step of one flow. Rendered by TourProvider in welcome mode.
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
  progress,
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
  progress: number;
  isFirst: boolean;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
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
          accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
          style={{ height: 4, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.35)", overflow: "hidden" }}
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
            color: "#ffffff",
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
        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
          {!isFirst ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                borderWidth: 1.5,
                borderColor: "rgba(255,255,255,0.7)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="chevron-back" size={20} color="#ffffff" />
            </Pressable>
          ) : null}
          {!isLast ? (
            <Pressable
              onPress={onSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip tour"
              hitSlop={8}
              style={{ minHeight: 46, justifyContent: "center", paddingHorizontal: 6 }}
            >
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, fontWeight: "600", color: "#ffffff" }}>Skip</Text>
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
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 16, color: WELCOME_CORAL.ink }}>{cta}</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}
