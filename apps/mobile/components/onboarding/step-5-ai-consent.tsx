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
        Before your first entry
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
      <Text
        className="mt-3 text-base leading-relaxed"
        style={{ color: tokens.textSec }}
      >
        Because you&rsquo;re speaking freely, your entries may include
        sensitive personal information &mdash; things like your health,
        your beliefs, or your relationships. UK and EU data-protection
        law treats that as a special category that needs your explicit
        consent.
      </Text>

      <Pressable
        onPress={() => setAccepted((v) => !v)}
        className="mt-6 flex-row gap-3 rounded-xl border p-4"
        style={{ borderColor: tokens.line, backgroundColor: tokens.bgInset }}
      >
        <GradientCheckbox
          checked={accepted}
          onPress={() => setAccepted((v) => !v)}
          accessibilityLabel="I explicitly consent to Acuity transcribing and analysing voice entries that may contain special-category information"
        />
        <Text
          className="flex-1 text-sm leading-relaxed"
          style={{ color: tokens.textSec }}
        >
          I understand my voice entries may contain special-category
          information (such as health, religious or political beliefs,
          or sexuality), and I explicitly consent to Acuity transcribing
          and analysing that content to provide the service. I can
          withdraw this consent at any time by deleting entries or my
          account.
        </Text>
      </Pressable>

      <Text className="mt-3 text-xs leading-relaxed" style={{ color: tokens.textTer }}>
        You choose what to say. You can use Acuity without sharing
        sensitive details, and you can withdraw consent anytime in
        Profile &rarr; Privacy.
      </Text>

      {accepted && (
        <View className="mt-4 flex-row gap-2 items-center">
          <Ionicons name="checkmark-circle" size={20} color={tokens.good} />
          <Text className="text-sm" style={{ color: tokens.good }}>
            Consent recorded. Tap Continue to proceed.
          </Text>
        </View>
      )}

      <View className="mt-auto pt-6">
        <Pressable onPress={handleDecline} className="py-3 items-center">
          <Text className="text-sm font-medium" style={{ color: tokens.textTer }}>
            I don&rsquo;t consent
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
