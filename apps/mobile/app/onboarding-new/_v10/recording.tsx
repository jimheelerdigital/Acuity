import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Rect } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/contexts/theme-context";

import { CoralScreen, FunnelCta, FunnelProgress, coralChipStyle } from "./_ui";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import {
  V10_BRANCHES,
  V10_RECORDING_CHIPS,
  V10_RECORDING_GUIDANCE,
  V10_RECORDING_PROMPT,
  V10_SOFT_FLOOR_AT_MS,
  V10_SOFT_FLOOR_LINE,
  type V10Branch,
  type V10ChipKey,
} from "@/lib/onboarding-v10/branches";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { getV10Branch } from "@/lib/onboarding-v10/state";
import { SPEECH_RECORDING_OPTIONS } from "@/lib/audio-recording-options";
import { V10_MAX_RECORDING_MS as MAX_MS } from "@/lib/onboarding-v10/limits";

/**
 * Screen 3 — Recording (light).
 *
 * Opens ALREADY RECORDING, with a 1s "Listening…" fade-in so it isn't a
 * jump-scare (spec §4). Permission was granted on Screen 2, so there is no
 * second gate here — that is what makes this the second of two product taps.
 *
 * ── Waveform + elapsed, NOT live transcript ──────────────────────────
 * Spec line 123 and open decision #3: ship live partial transcript only if
 * the pipeline genuinely streams; never simulate. Verified 2026-08-20 — it
 * does not. `transcribeAudio` (lib/pipeline.ts) is a single-shot
 * `openai.audio.transcriptions.create()` awaiting the full result, and the
 * client uploads one complete file to /api/mobile/try-recording. There is no
 * partial-text channel to render. So: waveform + elapsed, as decided.
 *
 * ── No countdown, no minimum ─────────────────────────────────────────
 * The ~20s line appears and then STAYS. It is reassurance that enough has
 * been said, not a threshold being crossed — the spec is explicit that there
 * is no floor. Nothing about the UI should imply a target length.
 */

// 🔒 Capped centrally — see V10_MAX_RECORDING_MS. Do not inline a number here.
const TICK_MS = 100;

export default function V10Recording() {
  const { palette } = useTheme();
  // Light from Screen 3 onward (spec §1).
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const [branch, setBranch] = useState<V10Branch>("open");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [activeChip, setActiveChip] = useState<V10ChipKey | null>(null);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const startedAtRef = useRef<number>(0);
  const retryCountRef = useRef(0);

  const listeningOpacity = useSharedValue(0);
  const listeningStyle = useAnimatedStyle(() => ({
    opacity: listeningOpacity.value,
  }));

  // ── Start recording immediately on mount ───────────────────────────
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const b = (await getV10Branch()) ?? "open";
      if (!cancelled) setBranch(b);

      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });

        const recording = new Audio.Recording();
        // Same 64 kbps mono spec as every other recorder in the app —
        // speech for Whisper, not music. See lib/audio-recording-options.
        await recording.prepareToRecordAsync(SPEECH_RECORDING_OPTIONS);
        // Same normalization the legacy recorder uses: metering is dBFS,
        // roughly -60 (silence) to 0 (peak).
        recording.setOnRecordingStatusUpdate((status) => {
          if (!status.isRecording) return;
          const db = status.metering ?? -60;
          setLevel(Math.max(0, Math.min(1, (db + 60) / 60)));
        });
        recording.setProgressUpdateInterval(TICK_MS);

        await recording.startAsync();
        if (cancelled) {
          void recording.stopAndUnloadAsync().catch(() => {});
          return;
        }

        recordingRef.current = recording;
        startedAtRef.current = Date.now();
        listeningOpacity.value = withTiming(1, { duration: 1000 });
        trackV10("v10_recording_started", { input: "voice", branch: b });
      } catch {
        if (!cancelled) {
          setError("Ripple couldn't start recording. Try again in a moment.");
        }
      }
    })();

    return () => {
      cancelled = true;
      // Stop cleanly if the screen is torn down mid-recording so the mic is
      // released and no orphan file is left behind.
      const r = recordingRef.current;
      recordingRef.current = null;
      if (r) void r.stopAndUnloadAsync().catch(() => {});
    };
  }, [listeningOpacity]);

  // ── Elapsed clock ──────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (!recordingRef.current || startedAtRef.current === 0) return;
      const ms = Date.now() - startedAtRef.current;
      setElapsedMs(ms);
      if (ms >= MAX_MS) void handleStop();
    }, TICK_MS);
    return () => clearInterval(id);
    // handleStop is stable enough for this interval's purpose; re-creating
    // the timer on every render would reset the cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording || stopping) return;
    setStopping(true);
    recordingRef.current = null;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const durationS = Math.round((Date.now() - startedAtRef.current) / 1000);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) throw new Error("no recording uri");

      trackV10("v10_recording_completed", {
        duration_s: durationS,
        input: activeChip ? `voice:${activeChip}` : "voice",
        retry_count: retryCountRef.current,
        branch,
      });

      // Screen 4 owns the upload + waiting UI. Handing off the URI rather
      // than uploading here means a processing failure can retry WITHOUT
      // re-recording, which spec §4 requires.
      router.push({
        pathname: "/onboarding-new/processing",
        params: { uri, durationS: String(durationS) },
      });
    } catch {
      retryCountRef.current += 1;
      setStopping(false);
      setError("That didn't save. Tap stop again and Ripple will retry.");
    }
  }, [activeChip, branch, stopping]);

  const seconds = Math.floor(elapsedMs / 1000);
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const pastSoftFloor = elapsedMs >= V10_SOFT_FLOOR_AT_MS;

  // Chips swap the TOP PROMPT only — recording never pauses (spec §4).
  const topPrompt = activeChip
    ? V10_RECORDING_CHIPS.find((c) => c.key === activeChip)!.label
    : V10_RECORDING_PROMPT;

  return (
    <CoralScreen tokens={tokens}>
      <SafeAreaView style={{ flex: 1 }}>
      <FunnelProgress step={3} total={5} tokens={tokens} />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 }}>
        <Animated.View style={listeningStyle}>
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 12,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: "#ffffff",
              opacity: 0.82,
              marginBottom: 16,
            }}
          >
            Listening…
          </Text>
        </Animated.View>

        <Text
          accessibilityRole="header"
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 24,
            lineHeight: 32,
            color: "#ffffff",
          }}
        >
          {topPrompt}
        </Text>

        {/* Branch sub-prompt sits under the top prompt. */}
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 15,
            lineHeight: 22,
            color: "#ffffff",
            opacity: 0.9,
            marginTop: 8,
          }}
        >
          {V10_BRANCHES[branch].support}
        </Text>

        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 14,
            lineHeight: 21,
            color: "#ffffff",
            opacity: 0.82,
            marginTop: 16,
          }}
        >
          {V10_RECORDING_GUIDANCE}
        </Text>

        <View style={{ flex: 1, justifyContent: "center" }}>
          {/* Orb — coral core + mic, scaled by REAL mic level (never a
              decorative loop). The ring is a soft white bloom on the coral. */}
          <View style={{ alignItems: "center", marginBottom: 4 }}>
            <View
              style={{
                width: 150,
                height: 150,
                borderRadius: 75,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.14)",
                shadowColor: "#ffffff",
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 26,
                shadowOpacity: 0.5,
                transform: [{ scale: 1 + Math.min(level, 1) * 0.06 }],
              }}
            >
              <LinearGradient
                colors={[tokens.primaryHi, tokens.primaryLo]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={{
                  width: 98,
                  height: 98,
                  borderRadius: 49,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Svg width={34} height={34} viewBox="0 0 24 24" fill="none">
                  <Rect x={9} y={3} width={6} height={12} rx={3} stroke="#ffffff" strokeWidth={1.8} />
                  <Path
                    d="M6 11a6 6 0 0 0 12 0M12 17v4"
                    stroke="#ffffff"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                  />
                </Svg>
              </LinearGradient>
            </View>
          </View>

          <Waveform level={level} />

          <Text
            style={{
              fontFamily: tokens.fontMono ?? tokens.fontSans,
              fontSize: 30,
              color: "#ffffff",
              textAlign: "center",
              marginTop: 20,
            }}
          >
            {mmss}
          </Text>

          {/* Appears at ~20s and STAYS. Not a threshold — reassurance. */}
          {pastSoftFloor && (
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 14,
                lineHeight: 21,
                color: "#ffffff",
                opacity: 0.9,
                textAlign: "center",
                marginTop: 12,
                paddingHorizontal: 16,
              }}
            >
              {V10_SOFT_FLOOR_LINE}
            </Text>
          )}

          {error && (
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 14,
                color: "#ffffff",
                textAlign: "center",
                marginTop: 16,
              }}
            >
              {error}
            </Text>
          )}
        </View>

        {/* Optional prompts. Tapping one swaps the heading; nothing pauses. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {V10_RECORDING_CHIPS.map((chip) => {
            const active = activeChip === chip.key;
            return (
              <Pressable
                key={chip.key}
                onPress={() => {
                  setActiveChip(active ? null : chip.key);
                  trackV10("v10_chip_tapped", { chip: chip.key, branch });
                }}
                accessibilityRole="button"
                style={coralChipStyle({ selected: active })}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 14,
                    fontWeight: active ? "700" : "500",
                    color: active ? tokens.primaryLo : "#ffffff",
                  }}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <FunnelCta
          label="Stop"
          busyLabel="Saving…"
          busy={stopping}
          onPress={() => void handleStop()}
          tokens={tokens}
          size="lg"
          onCoral
          accessibilityLabel="Stop recording"
        />
      </View>
      </SafeAreaView>
    </CoralScreen>
  );
}

/**
 * Waveform driven by REAL microphone metering — never a decorative
 * animation. Spec §1 bans invented feedback, and a fake waveform that moves
 * while the mic is muted is exactly that: it would tell her she's being
 * heard when she isn't.
 */
function Waveform({ level }: { level: number }) {
  const BARS = 24;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        height: 96,
        gap: 4,
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: BARS }).map((_, i) => {
        // Centre bars react most, edges least — a simple envelope so the
        // shape reads as a voice rather than a bar chart.
        const distance = Math.abs(i - (BARS - 1) / 2) / ((BARS - 1) / 2);
        const envelope = 1 - distance * 0.75;
        const h = 6 + level * envelope * 84;
        return (
          <View
            key={i}
            style={{
              width: 3,
              height: h,
              borderRadius: 2,
              backgroundColor: "#ffffff",
              opacity: 0.4 + envelope * 0.55,
            }}
          />
        );
      })}
    </View>
  );
}
