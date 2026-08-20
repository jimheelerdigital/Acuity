import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/contexts/theme-context";
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

const MAX_MS = 120_000; // existing recorder max — 120s, per app.json copy
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
        await recording.prepareToRecordAsync({
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        });
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
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 28 }}>
        <Animated.View style={listeningStyle}>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 13,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: tokens.textTer,
              marginBottom: 20,
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
            color: tokens.text,
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
            color: tokens.textSec,
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
            color: tokens.textTer,
            marginTop: 16,
          }}
        >
          {V10_RECORDING_GUIDANCE}
        </Text>

        <View style={{ flex: 1, justifyContent: "center" }}>
          <Waveform level={level} tokens={tokens} />

          <Text
            style={{
              fontFamily: tokens.fontMono ?? tokens.fontSans,
              fontSize: 30,
              color: tokens.text,
              textAlign: "center",
              marginTop: 24,
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
                color: tokens.textSec,
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
                fontFamily: tokens.fontSans,
                fontSize: 14,
                color: tokens.bad,
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
                style={{
                  borderWidth: 1,
                  borderColor: active ? tokens.primary : tokens.line,
                  backgroundColor: active ? tokens.cardBgTint : "transparent",
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                }}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 14,
                    color: active ? tokens.text : tokens.textSec,
                  }}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => void handleStop()}
          disabled={stopping}
          accessibilityRole="button"
          accessibilityLabel="Stop recording"
          style={({ pressed }) => ({
            backgroundColor: tokens.primary,
            opacity: stopping ? 0.7 : 1,
            borderRadius: 999,
            paddingVertical: 20,
            alignItems: "center",
            transform: [{ scale: pressed ? 0.99 : 1 }],
          })}
        >
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 18,
              color: "#ffffff",
            }}
          >
            {stopping ? "Saving…" : "Stop"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/**
 * Waveform driven by REAL microphone metering — never a decorative
 * animation. Spec §1 bans invented feedback, and a fake waveform that moves
 * while the mic is muted is exactly that: it would tell her she's being
 * heard when she isn't.
 */
function Waveform({
  level,
  tokens,
}: {
  level: number;
  tokens: ReturnType<typeof makeAcuityTokens>;
}) {
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
              backgroundColor: tokens.primary,
              opacity: 0.35 + envelope * 0.65,
            }}
          />
        );
      })}
    </View>
  );
}
