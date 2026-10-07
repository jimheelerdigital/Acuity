import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { GradientCheckbox } from "@/components/acuity/GradientCheckbox";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import {
  ART9_CONSENT_TEXT,
  ART9_WORDING_VERSION,
  recordConsent,
} from "@/lib/consent";

import { useOnboarding } from "./context";

/**
 * Step 5 — AI processing + Article 9 explicit consent.
 *
 * Serves two requirements at once:
 *
 *  1. App Store Review Guidelines 5.1.1(i) / 5.1.2(i) (build-40
 *     rejection): explicit in-app consent before any voice data leaves
 *     the device for third-party AI processing (OpenAI / Anthropic).
 *
 *  2. UK/EU GDPR Art. 9(2)(a) (v1.4 GDPR slice): voice entries may
 *     contain special-category data (health, beliefs, sexuality), which
 *     needs SEPARATE, EXPLICIT consent — a dedicated, affirmative,
 *     unticked confirmation, not consent inferred from the act of
 *     recording. The checkbox below is that affirmative act; ticking it
 *     writes an append-only ConsentRecord we can later evidence.
 *
 * Decline path stays narrow (Alert: [Try again | Delete account]) — the
 * "free tier with no AI" degraded mode is still a backlog item. Users
 * who decline never reach the recorder, so no AI calls fire and no
 * special-category content is processed.
 *
 * Placement (after mic permission, before the practice recording): the
 * user's mental model is "OS permission → AI + special-category consent
 * → first recording attempt".
 */
export function Step5AiConsent() {
  const { tokens } = useTheme();
  const { setCanContinue, setCapturedData } = useOnboarding();
  const { deleteAccount, signOut } = useAuth();
  const [accepted, setAccepted] = useState(false);
  // Write the ConsentRecord exactly once per grant. Fail-soft: a network
  // error must not trap the user in onboarding — the captured
  // aiProcessingConsent flag still persists through the normal flow, and
  // we reconcile the ledger on the next consent touchpoint.
  const recordedRef = useRef(false);

  useEffect(() => {
    setCanContinue(accepted);
    setCapturedData({ aiProcessingConsent: accepted });
    if (accepted && !recordedRef.current) {
      recordedRef.current = true;
      void recordConsent({
        consentType: "special_category_processing",
        granted: true,
        consentText: ART9_CONSENT_TEXT,
        wordingVersion: ART9_WORDING_VERSION,
      }).catch((err) => {
        // Allow a retry on a later tick if the write failed.
        recordedRef.current = false;
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn("[art9-consent] record failed:", err);
        }
      });
    }
  }, [accepted, setCanContinue, setCapturedData]);

  const handleDecline = () => {
    Alert.alert(
      "AI processing required",
      "Ripple's debriefs, themes, and weekly reports all depend on AI processing your transcripts. Without consent we can't deliver the core product. Would you like to reconsider, or delete your account?",
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

  // 2026-10-07, per Keenan (Mark Raeburn couldn't get past this screen:
  // with large iPhone text the tick box scrolled off the top): "make this
  // screen much easier and smaller font... just have them check an easy box
  // and make it extremely simple". One short line, the full legal detail
  // behind "Read the details", and a big tick-box row right above Continue.
  // Still an affirmative, unticked box (GDPR Art. 9 explicit consent) and
  // still names OpenAI + Anthropic (App Store 5.1.2). Text is capped at 1.3x
  // so large accessibility sizes can't push the box off screen.
  const [showDetails, setShowDetails] = useState(false);
  const cap = 1.3;

  return (
    <View className="flex-1">
      <Text
        className="text-2xl font-semibold tracking-tight"
        style={{ color: tokens.text }}
        maxFontSizeMultiplier={cap}
      >
        Quick privacy check
      </Text>
      <Text
        className="mt-2 text-sm leading-relaxed"
        style={{ color: tokens.textSec }}
        maxFontSizeMultiplier={cap}
      >
        Ripple uses AI (OpenAI and Anthropic) to turn what you say into
        notes, to-dos and patterns. Encrypted, never sold, never used to
        train AI.
      </Text>

      <Pressable
        onPress={() => setShowDetails((v) => !v)}
        className="mt-2 flex-row items-center gap-1 self-start py-1"
        accessibilityRole="button"
      >
        <Text className="text-xs font-medium" style={{ color: tokens.textTer }} maxFontSizeMultiplier={cap}>
          {showDetails ? "Hide the details" : "Read the details"}
        </Text>
        <Ionicons name={showDetails ? "chevron-up" : "chevron-down"} size={12} color={tokens.textTer} />
      </Pressable>

      {showDetails && (
        <View className="mt-1 rounded-xl border p-3" style={{ borderColor: tokens.line, backgroundColor: tokens.bgInset }}>
          <Text className="text-xs leading-relaxed" style={{ color: tokens.textTer }} maxFontSizeMultiplier={cap}>
            Your voice recordings go to OpenAI (Whisper) for transcription and
            to Anthropic (Claude) for themes, tasks and your weekly report.
            Because you speak freely, entries may include sensitive personal
            information (health, beliefs, relationships), which UK and EU law
            treats as a special category needing your explicit consent.
          </Text>
          <Text className="mt-2 text-xs leading-relaxed" style={{ color: tokens.textTer }} maxFontSizeMultiplier={cap}>
            {ART9_CONSENT_TEXT}
          </Text>
          <Text className="mt-2 text-xs leading-relaxed" style={{ color: tokens.textTer }} maxFontSizeMultiplier={cap}>
            You choose what to say, and you can withdraw consent anytime in
            Profile &rarr; Privacy.
          </Text>
        </View>
      )}

      <View className="mt-auto pt-4">
        <Pressable
          onPress={() => setAccepted((v) => !v)}
          className="flex-row items-center gap-3 rounded-xl border p-4"
          style={{ borderColor: accepted ? tokens.good : tokens.line, backgroundColor: tokens.bgInset }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          accessibilityLabel="I agree to Ripple's AI processing of my entries, including any sensitive details I share"
        >
          <GradientCheckbox
            checked={accepted}
            onPress={() => setAccepted((v) => !v)}
            size={26}
            accessibilityLabel="I agree to Ripple's AI processing of my entries, including any sensitive details I share"
          />
          <Text className="flex-1 text-sm font-medium" style={{ color: tokens.text }} maxFontSizeMultiplier={cap}>
            I agree to AI processing of my entries, including any sensitive
            details I share.
          </Text>
        </Pressable>

        <Pressable onPress={handleDecline} className="py-3 items-center">
          <Text className="text-xs" style={{ color: tokens.textTer }} maxFontSizeMultiplier={cap}>
            I don&rsquo;t agree
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
