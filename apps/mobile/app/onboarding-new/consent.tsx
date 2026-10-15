import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, Text, TextInput, View } from "react-native";
import { Audio } from "expo-av";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { ChevronDown, ChevronUp, Keyboard, Mic } from "lucide-react-native";

import { ART9_CONSENT_TEXT, ART9_WORDING_VERSION, recordConsent } from "@/lib/consent";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { goBack, trackV11 } from "@/lib/onboarding-v11/flow";
import { submitTryDebriefText } from "@/lib/try-session";

import { Body, Card, Checkbox, FunnelHeader, Heading, LightScreen, PROGRESS, PrimaryButton, TextButton, V11 } from "./_v11/ui";

/**
 * Miro #9 — microphone permission + an "I agree to AI transcription" box
 * with a SMALL summary that opens into the detail of what we collect and
 * what we don't, OR type instead.
 *
 * Consent comes BEFORE any audio is recorded: Apple rejected build 40 for
 * audio reaching AI before consent. The ledger row (Art. 9, ART9 wording)
 * is written when she agrees — the full ART9 text is on screen under the
 * box, so what we store is exactly what she saw.
 */
export default function V11Consent() {
  const [agreed, setAgreed] = useState(false);
  const [details, setDetails] = useState(false);
  const [mode, setMode] = useState<"talk" | "type">("talk");
  const [busy, setBusy] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackV11("consent", "viewed");
    trackV10("v10_mirror_viewed", { branch: "open", flow: "v11" });
  }, []);

  const recordAgreement = async () => {
    trackV11("consent", "answered", mode);
    // Fail soft: trapping her on a ledger write is worse than a missing row
    // the app can re-ask for (same call as the welcome flow).
    await recordConsent({
      consentType: "special_category_processing",
      granted: true,
      consentText: ART9_CONSENT_TEXT,
      wordingVersion: ART9_WORDING_VERSION,
    }).catch(() => {});
  };

  const startTalking = async () => {
    if (!agreed || busy) return;
    setBusy(true);
    try {
      await recordAgreement();
      trackV10("v10_start_tapped", { branch: "open", flow: "v11" });
      // Check first: after a denial iOS does not re-prompt, it silently
      // returns denied — asking blindly would look like a dead button.
      const existing = await Audio.getPermissionsAsync();
      const result = existing.granted ? existing : await Audio.requestPermissionsAsync();
      trackV10("v10_mic_result", { result: result.granted ? "granted" : "denied", branch: "open" });
      if (result.granted) {
        router.push("/onboarding-new/record");
        return;
      }
      setMicDenied(true);
      setMode("type");
    } catch {
      trackV10("v10_mic_result", { result: "denied", branch: "open", error: true });
      setMicDenied(true);
      setMode("type");
    } finally {
      setBusy(false);
    }
  };

  const sendTyped = async () => {
    if (!agreed || busy || text.trim().length < 10) return;
    setBusy(true);
    setError(null);
    try {
      await recordAgreement();
      trackV10("v10_recording_started", { input: "typed", branch: "open" });
      await submitTryDebriefText(text.trim());
      trackV10("v10_recording_completed", { duration_s: 0, input: "typed", retry_count: 0, branch: "open" });
      // Nothing to upload — processing just attaches it to her account and
      // runs the check-in + first-habit setup.
      router.push({ pathname: "/onboarding-new/processing", params: { typed: "1" } });
    } catch {
      setError("That didn't send. Your words are still here. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const footer =
    mode === "talk" ? (
      <>
        <PrimaryButton label="Start talking" icon="none" disabled={!agreed} busy={busy} onPress={() => void startTalking()} />
        <TextButton label="I'd rather type" onPress={() => setMode("type")} />
      </>
    ) : (
      <>
        <PrimaryButton
          label="Send my debrief"
          disabled={!agreed || text.trim().length < 10}
          busy={busy}
          onPress={() => void sendTyped()}
        />
        {micDenied ? (
          <TextButton label="Turn on the microphone in Settings" onPress={() => void Linking.openSettings()} />
        ) : (
          <TextButton label="I'd rather talk" onPress={() => setMode("talk")} />
        )}
      </>
    );

  return (
    <LightScreen>
      <FunnelHeader progress={PROGRESS.consent} onBack={goBack} />
      <Body footer={footer}>
        <Heading
          title={mode === "talk" ? "Now, say what's on your mind" : "Type what's on your mind"}
          sub={
            mode === "talk"
              ? "Talk like you would to a friend. Ramble, change subjects, stop whenever. Ripple sorts it out."
              : micDenied
                ? "No microphone, no problem. Type it instead, as messy as you like."
                : "As messy as you like. Ripple sorts it out."
          }
        />

        {/* The big mic / keyboard badge — tap it to start once agreed. */}
        {mode === "talk" ? (
          <Animated.View entering={FadeInDown.delay(80).duration(400)} style={{ alignItems: "center", marginBottom: 22 }}>
            <Pressable
              onPress={() => {
                if (!agreed) {
                  Alert.alert("One tick first", "Tick the box below so Ripple can transcribe and analyze your debrief.");
                  return;
                }
                void startTalking();
              }}
              accessibilityRole="button"
              accessibilityLabel="Start talking"
              style={{
                width: 104,
                height: 104,
                borderRadius: 52,
                backgroundColor: agreed ? V11.coral : V11.coralSoft,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: V11.coral,
                shadowOffset: { width: 0, height: 12 },
                shadowRadius: 22,
                shadowOpacity: agreed ? 0.4 : 0,
              }}
            >
              <Mic size={44} color={agreed ? "#ffffff" : V11.coral} strokeWidth={2} />
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(250)} style={{ marginBottom: 16 }}>
            <Card style={{ padding: 6 }}>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                editable={!busy}
                placeholder="What's taking up the most space in your head?"
                placeholderTextColor={V11.quiet}
                maxLength={10_000}
                style={{ minHeight: 150, padding: 12, fontSize: 17, lineHeight: 24, color: V11.ink, textAlignVertical: "top" }}
              />
            </Card>
            {error ? <Text style={{ marginTop: 10, fontSize: 14, color: "#C2412D" }}>{error}</Text> : null}
          </Animated.View>
        )}

        {/* Consent: small summary + the box, details on tap (Miro #9). */}
        <Card style={{ padding: 16 }}>
          <Pressable
            onPress={() => setAgreed((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            accessibilityLabel="I agree to AI transcription and analysis of my debriefs"
            style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}
          >
            <Checkbox on={agreed} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: V11.display, fontSize: 16, lineHeight: 22, color: V11.ink }}>
                I agree to AI transcription and analysis
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 17, color: V11.ter }}>{ART9_CONSENT_TEXT}</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              setDetails((v) => !v);
              trackV11("consent", "answered", details ? "details_closed" : "details_opened");
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: details }}
            style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4 }}
          >
            <Text style={{ fontFamily: V11.display, fontSize: 14, color: V11.coral }}>What we collect and what we don't</Text>
            {details ? <ChevronUp size={16} color={V11.coral} /> : <ChevronDown size={16} color={V11.coral} />}
          </Pressable>

          {details ? (
            <Animated.View entering={FadeIn.duration(220)} style={{ marginTop: 10, gap: 14 }}>
              <DetailGroup
                title="What we collect"
                lines={[
                  mode === "talk" ? "Your recording and its transcript." : "What you type.",
                  "The tasks, habits, themes and mood Ripple finds in it.",
                ]}
              />
              <DetailGroup
                title="Who processes it"
                lines={["OpenAI (Whisper) turns your voice into text.", "Anthropic (Claude) finds your tasks, themes and mood."]}
              />
              <DetailGroup
                title="What we don't do"
                lines={["We never sell your data.", "Your debriefs never train AI models.", "Delete any debrief, or your whole account, any time."]}
              />
            </Animated.View>
          ) : null}
        </Card>

        {mode === "talk" ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 }}>
            <Keyboard size={15} color={V11.ter} />
            <Text style={{ fontSize: 13, color: V11.ter }}>Somewhere you can't talk? You can type instead.</Text>
          </View>
        ) : null}
      </Body>
    </LightScreen>
  );
}

function DetailGroup({ title, lines }: { title: string; lines: string[] }) {
  return (
    <View>
      <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.8, color: V11.ter, marginBottom: 6 }}>{title.toUpperCase()}</Text>
      {lines.map((l) => (
        <View key={l} style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: V11.coral, marginTop: 8 }} />
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: V11.sec }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}
