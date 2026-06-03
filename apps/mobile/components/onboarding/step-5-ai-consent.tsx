import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";

import { useOnboarding } from "./context";

/**
 * Step 5 — AI processing consent. Required by App Store Review
 * Guidelines 5.1.1(i) and 5.1.2(i) (build-40 rejection).
 *
 * Apple requires explicit in-app user consent before any voice data
 * leaves the device for third-party AI processing. The Privacy Policy
 * already names Anthropic + OpenAI as subprocessors (see
 * apps/web/src/app/privacy/page.tsx §3), but a privacy-policy mention
 * alone isn't sufficient — we need an explicit "I consent" action.
 *
 * Decline path is intentionally narrow for v1.1: Alert dialog with
 * [Try again | Delete account]. The "free-tier with no AI" degraded
 * mode is a v1.2 backlog item — it requires User.aiProcessingConsent
 * column + server-side pipeline gating + multiple UI states. For
 * launch, gating decline to "delete-or-retry" is sufficient because
 * Apple's reject reason is the consent-gate's EXISTENCE, not the
 * post-decline UX. Users who decline never complete onboarding, so
 * they never reach the recording surface, so no AI calls fire.
 *
 * Placement (after mic permission, before practice recording): the
 * practice recording at the next step is local-only, but for UX
 * clarity the consent lands here so the user's mental model is "OS
 * permission → AI processing consent → first recording attempt".
 */
export function Step5AiConsent() {
  const { tokens } = useTheme();
  const { setCanContinue, setCapturedData } = useOnboarding();
  const { deleteAccount, signOut } = useAuth();
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setCanContinue(accepted);
    setCapturedData({ aiProcessingConsent: accepted });
  }, [accepted, setCanContinue, setCapturedData]);

  const handleDecline = () => {
    Alert.alert(
      "AI processing required",
      "Acuity's debriefs, themes, and weekly reports all depend on AI processing your transcripts. Without consent we can't deliver the core product. Would you like to reconsider, or delete your account?",
      [
        {
          text: "Try again",
          style: "default",
          onPress: () => setAccepted(false),
        },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            const result = await deleteAccount();
            if (!result.ok) {
              // If delete fails (network etc.), sign out so the user
              // isn't left in a half-state. They can retry from a
              // clean session.
              Alert.alert(
                "Couldn't delete",
                result.error ?? "Please try again or contact support.",
                [
                  {
                    text: "Sign out",
                    onPress: () => void signOut(),
                  },
                  { text: "OK", style: "cancel" },
                ]
              );
            }
            // On success, deleteAccount() clears local session — the
            // AuthGate in _layout.tsx routes to /(auth)/sign-in.
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1">
      <Text
        className="text-3xl font-semibold tracking-tight"
        style={{ color: tokens.text }}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        How Acuity processes your voice
      </Text>
      <Text
        className="mt-3 text-base leading-relaxed"
        style={{ color: tokens.textSec }}
      >
        Acuity sends your voice recordings to{" "}
        <Text className="font-semibold" style={{ color: tokens.text }}>
          OpenAI (Whisper)
        </Text>{" "}
        for transcription and{" "}
        <Text className="font-semibold" style={{ color: tokens.text }}>
          Anthropic (Claude)
        </Text>{" "}
        for themes, tasks, and your weekly narrative. Recordings are
        encrypted in transit, never sold, and never used to train AI
        models.
      </Text>

      <View
        className="mt-6 rounded-xl border p-4"
        style={{ borderColor: tokens.line, backgroundColor: tokens.bgInset }}
      >
        <Text
          className="text-sm leading-relaxed"
          style={{ color: tokens.textSec }}
        >
          Your transcripts are{" "}
          <Text className="font-semibold" style={{ color: tokens.text }}>
            not used to train AI models
          </Text>
          . Both providers offer privacy protections at least
          equivalent to ours. Full details in our{" "}
          <Text
            className="font-semibold underline"
            style={{ color: tokens.text }}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </View>

      {accepted && (
        <View className="mt-6 flex-row gap-2 items-center">
          <Ionicons name="checkmark-circle" size={20} color={tokens.good} />
          <Text className="text-sm" style={{ color: tokens.good }}>
            Consent recorded. Tap Continue to proceed.
          </Text>
        </View>
      )}

      <View className="mt-auto pt-6 gap-3">
        <Pressable
          onPress={() => setAccepted(true)}
          className="rounded-full px-4 py-3.5 items-center"
          style={{
            backgroundColor: accepted ? tokens.bgInset : tokens.primary,
          }}
        >
          <Text
            className="text-sm font-semibold"
            style={{ color: accepted ? tokens.textSec : "#FFFFFF" }}
          >
            {accepted ? "Consent given ✓" : "I consent"}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleDecline}
          className="rounded-full px-4 py-3.5 items-center border"
          style={{ borderColor: tokens.line }}
        >
          <Text
            className="text-sm font-medium"
            style={{ color: tokens.textSec }}
          >
            I don&rsquo;t consent
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
