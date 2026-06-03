import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/contexts/theme-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import { trackOnboardingEvent } from "@/lib/onboarding-events";

/**
 * Pre-auth AI subprocessor disclosure. Lands between /commitment and
 * /record so the user sees the named subprocessors BEFORE their first
 * audio upload to /api/mobile/try-recording (which goes through
 * OpenAI Whisper + Anthropic Claude).
 *
 * Apple Guideline 5.1.1(i) and 5.1.2(i): users must be informed of
 * AI subprocessors before voice data leaves the device. The post-
 * auth onboarding shell shows the same disclosure as its step 1,
 * but pre-auth users hitting this funnel via Meta-ad deep link must
 * also see it before record.
 *
 * Single CTA — Continue. No decline path here (the pre-auth funnel
 * has no account to delete; user just closes the app to decline).
 * The full consent / decline / delete flow lives in the post-auth
 * shell after sign-in.
 */
export default function DisclosureScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  // The pre-auth funnel forces light mode for atmospheric consistency
  // with the rest of /onboarding-new/* — same pattern other screens
  // in this directory use.
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const onContinue = () => {
    void trackOnboardingEvent("funnel_disclosure_continued");
    router.push("/onboarding-new/record" as never);
  };

  const openPrivacy = () => {
    Linking.openURL("https://acuity.app/privacy").catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: `${tokens.primary}22`,
              marginBottom: 28,
            }}
          >
            <Ionicons name="lock-closed" size={26} color={tokens.primary} />
          </View>

          <Text
            style={{
              fontFamily: "Manrope_800ExtraBold",
              fontSize: 30,
              letterSpacing: -0.6,
              color: tokens.text,
              textAlign: "center",
              lineHeight: 36,
            }}
          >
            How Acuity processes your voice
          </Text>

          <Text
            style={{
              marginTop: 16,
              fontFamily: "Manrope_400Regular",
              fontSize: 16,
              lineHeight: 24,
              color: tokens.textSec,
              textAlign: "center",
            }}
          >
            Your recording will be sent to{" "}
            <Text style={{ fontWeight: "700", color: tokens.text }}>
              OpenAI (Whisper)
            </Text>{" "}
            for transcription and{" "}
            <Text style={{ fontWeight: "700", color: tokens.text }}>
              Anthropic (Claude)
            </Text>{" "}
            for themes and reflections.
          </Text>

          <View
            style={{
              marginTop: 20,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: tokens.line,
              backgroundColor: tokens.bgInset,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text
              style={{
                fontFamily: "Manrope_500Medium",
                fontSize: 14,
                lineHeight: 21,
                color: tokens.textSec,
              }}
            >
              Recordings are encrypted in transit, never sold, and
              never used to train AI models. Full details in our{" "}
              <Text
                onPress={openPrivacy}
                style={{
                  fontWeight: "700",
                  color: tokens.text,
                  textDecorationLine: "underline",
                }}
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </View>

          <Pressable
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            style={({ pressed }) => [
              {
                marginTop: 36,
                borderRadius: 999,
                backgroundColor: tokens.primary,
                paddingVertical: 16,
                alignItems: "center",
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontFamily: "Manrope_700Bold",
                fontSize: 16,
                letterSpacing: -0.2,
              }}
            >
              Continue
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
