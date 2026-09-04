import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";

import { useTheme } from "@/contexts/theme-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import {
  V10_BRANCHES,
  V10_START_CTA,
  V10_UNIVERSAL_LINE,
  type V10Branch,
} from "@/lib/onboarding-v10/branches";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { getV10Branch } from "@/lib/onboarding-v10/state";
import { submitTryDebriefText } from "@/lib/try-session";

/**
 * Screen 2 — Mirror + Start (dark; the CTA is the first light element).
 *
 * Tap 2 of the two product taps to active recording (spec §3). The sequence
 * on tap is: AI-disclosure sheet → native mic permission → Screen 3, which
 * opens ALREADY RECORDING. Native permission dialogs are excluded from the
 * tap count by the spec but are still measured.
 *
 * The mirror line is the branch chosen on Screen 1, read from durable
 * storage rather than route params so a cold start between screens still
 * personalizes correctly. Missing branch degrades to `open`, whose copy
 * assumes nothing — showing someone the overload line they never chose
 * would be putting words in their mouth.
 *
 * ⚠️ MIC-DENIED PATH IS INCOMPLETE — see `MicDeniedPanel` below. The spec
 * wants an inline typed debrief; the backend cannot accept one yet.
 */
export default function V10Mirror() {
  const { palette } = useTheme();
  // Dark per spec §1 (screens 1-2 dark, 3+ light), regardless of the user's
  // saved appearance preference.
  const tokens = makeAcuityTokens({ dark: true, accent: palette });

  const [branch, setBranch] = useState<V10Branch>("open");
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const b = (await getV10Branch()) ?? "open";
      if (cancelled) return;
      setBranch(b);
      trackV10("v10_mirror_viewed", { branch: b });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onStart = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    trackV10("v10_start_tapped", { branch });
    // Disclosure BEFORE the OS prompt: the user should know where the audio
    // goes before the system asks for the microphone, not after.
    setShowDisclosure(true);
  };

  const onDisclosureAccepted = async () => {
    setShowDisclosure(false);
    setRequesting(true);
    try {
      // Same expo-av path the existing recorder uses. Check first — on iOS a
      // second request after a denial does NOT re-prompt, it silently
      // returns denied, so asking blindly would look like a no-op.
      const existing = await Audio.getPermissionsAsync();
      const result = existing.granted
        ? existing
        : await Audio.requestPermissionsAsync();

      trackV10("v10_mic_result", {
        result: result.granted ? "granted" : "denied",
        branch,
      });

      if (result.granted) {
        // Screen 3 opens already recording (spec §4).
        router.push("/onboarding-new/record");
        return;
      }
      setMicDenied(true);
    } catch {
      // Treat an errored permission check as denied rather than crashing —
      // the user still needs a way forward.
      trackV10("v10_mic_result", { result: "denied", branch, error: true });
      setMicDenied(true);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 56,
          paddingBottom: 40,
          justifyContent: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Branch line — large, the "mirror" moment. */}
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 28,
            lineHeight: 38,
            color: tokens.text,
            marginBottom: 28,
          }}
        >
          {V10_BRANCHES[branch].mirror}
        </Text>

        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 17,
            lineHeight: 26,
            color: tokens.textSec,
            marginBottom: 40,
          }}
        >
          {V10_UNIVERSAL_LINE}
        </Text>

        {micDenied ? (
          <MicDeniedPanel
            tokens={tokens}
            branch={branch}
            onRetry={() => {
              setMicDenied(false);
              void onDisclosureAccepted();
            }}
          />
        ) : (
          /* The CTA is the first light element on a dark screen — spec §4. */
          <Pressable
            onPress={onStart}
            disabled={requesting}
            accessibilityRole="button"
            accessibilityLabel={V10_START_CTA}
            style={({ pressed }) => ({
              backgroundColor: tokens.primary,
              opacity: requesting ? 0.7 : 1,
              borderRadius: 999,
              paddingVertical: 18,
              alignItems: "center",
              transform: [{ scale: pressed ? 0.99 : 1 }],
            })}
          >
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 17,
                // No on-primary token in the palette; #ffffff is the CTA label
                // convention across onboarding-new (10 call sites).
                color: "#ffffff",
              }}
            >
              {V10_START_CTA}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <AiDisclosureSheet
        visible={showDisclosure}
        tokens={tokens}
        onAccept={() => void onDisclosureAccepted()}
        onDismiss={() => setShowDisclosure(false)}
      />
    </SafeAreaView>
  );
}

/**
 * AI-disclosure sheet. Names the processors explicitly — spec §4 requires
 * OpenAI Whisper and Anthropic Claude by name, and the same disclosure is
 * what the existing flow shows (app/onboarding-new/disclosure.tsx), so the
 * App Review posture is unchanged.
 */
function AiDisclosureSheet({
  visible,
  tokens,
  onAccept,
  onDismiss,
}: {
  visible: boolean;
  tokens: ReturnType<typeof makeAcuityTokens>;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: tokens.cardBg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 28,
            paddingBottom: 40,
          }}
        >
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 20,
              color: tokens.text,
              marginBottom: 12,
            }}
          >
            Before you start
          </Text>

          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 16,
              lineHeight: 24,
              color: tokens.textSec,
            }}
          >
            Your debrief will be sent to{" "}
            <Text style={{ fontWeight: "700", color: tokens.text }}>
              OpenAI (Whisper)
            </Text>{" "}
            for transcription and{" "}
            <Text style={{ fontWeight: "700", color: tokens.text }}>
              Anthropic (Claude)
            </Text>{" "}
            for themes and reflections.
          </Text>

          <Pressable
            onPress={onAccept}
            accessibilityRole="button"
            style={({ pressed }) => ({
              marginTop: 28,
              backgroundColor: tokens.primary,
              borderRadius: 999,
              paddingVertical: 16,
              alignItems: "center",
              transform: [{ scale: pressed ? 0.99 : 1 }],
            })}
          >
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 16,
                // No on-primary token in the palette; #ffffff is the CTA label
                // convention across onboarding-new (10 call sites).
                color: "#ffffff",
              }}
            >
              Got it
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Mic-denied state — spec §4: "stay here, reveal typed debrief field inline.
 * Never Settings-only."
 *
 * Both halves are now honored. The typed field posts to
 * /api/mobile/try-debrief-text, which skips Whisper (the text IS the
 * transcript) and feeds the same extraction pipeline, so a denied microphone
 * still completes a real debrief and reaches the same reveal.
 *
 * Before that endpoint existed this was a dead end — every intake path
 * required audio — which is why the field was withheld rather than shipped
 * as a submit button that always errored.
 */
function MicDeniedPanel({
  tokens,
  branch,
  onRetry,
}: {
  tokens: ReturnType<typeof makeAcuityTokens>;
  branch: V10Branch;
  onRetry: () => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = text.trim().length >= 10 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    trackV10("v10_recording_started", { input: "typed", branch });
    try {
      await submitTryDebriefText(text.trim());
      trackV10("v10_recording_completed", {
        duration_s: 0,
        input: "typed",
        retry_count: 0,
        branch,
      });
      // Straight to the reveal — there is nothing to upload or transcribe,
      // so the processing screen would show stages that already happened.
      router.replace("/onboarding-new/reveal");
    } catch {
      setSubmitting(false);
      setError("That didn't send. Your words are still here — try again.");
    }
  };

  return (
    <View>
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 16,
          lineHeight: 24,
          color: tokens.textSec,
          marginBottom: 16,
        }}
      >
        No microphone, no problem — type it instead. Or turn the mic on and
        say it out loud.
      </Text>

      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        editable={!submitting}
        placeholder="What's taking up the most space in your head?"
        placeholderTextColor={tokens.textQuiet}
        maxLength={10_000}
        style={{
          minHeight: 140,
          borderWidth: 1,
          borderColor: tokens.line,
          backgroundColor: tokens.bgInset,
          borderRadius: 14,
          padding: 14,
          fontFamily: tokens.fontSans,
          fontSize: 16,
          lineHeight: 24,
          color: tokens.text,
          textAlignVertical: "top",
        }}
      />

      {error && (
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 14,
            color: tokens.bad,
            marginTop: 10,
          }}
        >
          {error}
        </Text>
      )}

      <Pressable
        onPress={() => void submit()}
        disabled={!canSubmit}
        accessibilityRole="button"
        style={({ pressed }) => ({
          marginTop: 16,
          backgroundColor: tokens.primary,
          opacity: canSubmit ? 1 : 0.5,
          borderRadius: 999,
          paddingVertical: 18,
          alignItems: "center",
          transform: [{ scale: pressed ? 0.99 : 1 }],
        })}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text
            style={{ fontFamily: tokens.fontDisplay, fontSize: 17, color: "#ffffff" }}
          >
            Send my debrief
          </Text>
        )}
      </Pressable>

      <Pressable onPress={onRetry} accessibilityRole="button" style={{ marginTop: 14 }}>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 15,
            color: tokens.textSec,
            textAlign: "center",
          }}
        >
          Use the microphone instead
        </Text>
      </Pressable>
    </View>
  );
}
