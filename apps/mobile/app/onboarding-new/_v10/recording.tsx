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
import { startSpeechRecording } from "@/lib/start-speech-recording";
import { RecordOrb, RecordWaveform } from "@/components/recording";
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
  const mountedRef = useRef(true);
  const branchRef = useRef<V10Branch>("open");
  const [starting, setStarting] = useState(false);
  // Drives the orb's live/idle morph + the waveform scroll (same
  // components as the main recorder).
  const [isRecording, setIsRecording] = useState(false);
  // Loudest metering seen this take (dBFS). Digital silence (-160) for a
  // whole take means the mic never connected — don't upload nothing.
  const peakDbRef = useRef(-Infinity);

  const beginRecording = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      // Shared starter (lib/start-speech-recording): waits for the app to
      // be active after the mic prompt closes, awaits the audio mode,
      // retries once. This screen opens right after the permission alert,
      // which is exactly when a bare start failed (1.9.1 fix).
      const recording = await startSpeechRecording({
        source: "onboarding_v10",
        progressIntervalMs: TICK_MS,
        // Same normalization the legacy recorder uses: metering is dBFS,
        // roughly -60 (silence) to 0 (peak).
        onStatus: (status) => {
          if (!status.isRecording) return;
          if (typeof status.metering === "number") {
            peakDbRef.current = Math.max(peakDbRef.current, status.metering);
          }
          const db = status.metering ?? -60;
          setLevel(Math.max(0, Math.min(1, (db + 60) / 60)));
        },
      });
      if (!mountedRef.current) {
        void recording.stopAndUnloadAsync().catch(() => {});
        return;
      }
      recordingRef.current = recording;
      peakDbRef.current = -Infinity;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setIsRecording(true);
      listeningOpacity.value = withTiming(1, { duration: 1000 });
      trackV10("v10_recording_started", { input: "voice", branch: branchRef.current });
    } catch (err) {
      // Record the native reason (this used to be swallowed, so the cause of
      // the 2026-10-15 failures couldn't be read from the data).
      trackV10("v10_recording_start_failed", {
        branch: branchRef.current,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
        code:
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: unknown }).code)
            : null,
      });
      if (mountedRef.current) {
        // Not a dead end: the main button becomes "Try again".
        setError("Ripple couldn't start recording. Tap Try again.");
      }
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  }, [listeningOpacity]);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      const b = (await getV10Branch()) ?? "open";
      branchRef.current = b;
      if (mountedRef.current) setBranch(b);
      await beginRecording();
    })();

    return () => {
      mountedRef.current = false;
      // Stop cleanly if the screen is torn down mid-recording so the mic is
      // released and no orphan file is left behind.
      const r = recordingRef.current;
      recordingRef.current = null;
      if (r) void r.stopAndUnloadAsync().catch(() => {});
    };
  }, [beginRecording]);

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

    setIsRecording(false);
    setLevel(0);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) throw new Error("no recording uri");

      // Whole take was digital silence: the mic never connected. Uploading
      // would only come back "too short or unclear" — restart instead.
      if (peakDbRef.current !== -Infinity && peakDbRef.current <= -120) {
        trackV10("v10_recording_silent", { duration_s: durationS, branch });
        setStopping(false);
        void beginRecording().then(() =>
          setError("Ripple didn't pick up any sound, so we restarted. Check your mic isn't blocked, then talk."),
        );
        return;
      }

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
  }, [activeChip, branch, stopping, beginRecording]);

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
              fontFamily: tokens.fontSans,
              fontWeight: "700",
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
          {/* Same voice-reactive orb + scrolling waveform as the main
              recorder (1.9.1, Jimmy: the funnel must match the real
              recording). The orb breathes when idle and pulses with the
              REAL mic level; the waveform scrolls a history of real
              levels. Tapping the orb stops, like the main recorder. */}
          <View style={{ alignItems: "center", marginBottom: 8 }}>
            <RecordOrb
              amplitude={level}
              active={isRecording}
              onPress={() => void handleStop()}
              onCoral
            />
          </View>

          <RecordWaveform levels={[level]} active={isRecording} height={72} onCoral />

          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 30,
              color: "#ffffff",
              textAlign: "center",
              marginTop: 20,
              fontVariant: ["tabular-nums"],
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

        {/* If the start failed, the main button retries instead of being a
            Stop with nothing to stop. */}
        {error && !recordingRef.current && !stopping ? (
          <FunnelCta
            label="Try again"
            busyLabel="Starting…"
            busy={starting}
            onPress={() => void beginRecording()}
            tokens={tokens}
            size="lg"
            onCoral
            accessibilityLabel="Try recording again"
          />
        ) : (
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
        )}
      </View>
      </SafeAreaView>
    </CoralScreen>
  );
}
