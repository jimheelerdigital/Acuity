import { useRouter } from "expo-router";
import { Audio, InterruptionModeIOS } from "expo-av";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/contexts/theme-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { submitTryRecording } from "@/lib/try-session";

/**
 * Screen 10 — Recording. Slice 8 (2026-05-26) onboarding-v2.
 *
 * Real recording on real audio — distinct from web /start's no-
 * recording mandatory-paywall flow. Mobile's funnel is value-
 * before-paywall: the user records, sees their actual extraction,
 * then hits a soft paywall with an explicit escape hatch on
 * screen 14.
 *
 * Timing rules (per spec):
 *   - 15s minimum before the stop button activates. A sub-15
 *     recording is rarely meaningful for extraction; gating the
 *     stop affordance forces the user past that floor.
 *   - 60s "suggested target" — at 60s a subtle textTer "wrap it
 *     up" cue appears. Not interruptive; just a soft signal.
 *   - 90s hard auto-stop. Anything past 90s gets truncated; the
 *     extraction is just as good on a longer clip and we'd rather
 *     cap than ask for more upload than Whisper needs.
 *
 * Audio pipeline:
 *   - expo-av Audio.Recording with HIGH_QUALITY preset (AAC in
 *     MP4 container). Matches the existing apps/mobile/app/
 *     record.tsx production path — same MIME, same metering
 *     cadence, same interruption handling.
 *   - Metering callback updates the 32-bar level visualization on
 *     a 1Hz tick. Reanimated drives the height of each bar via a
 *     shared array of values.
 *   - On stop: submitTryRecording from lib/try-session uploads
 *     to /api/mobile/try-recording (slice 1 endpoint), persists
 *     the returned sessionToken in AsyncStorage for the slice 11
 *     claim step, then we push to /onboarding-new/processing.
 *
 * Permission denial routes to a graceful alert with a Settings
 * deep-link — no progression past the screen until permission is
 * granted. We don't fire funnel_recording_started until we
 * actually have the mic.
 */

const MIN_DURATION_SECONDS = 15;
const SUGGESTED_DURATION_SECONDS = 60;
const HARD_CAP_SECONDS = 90;
const LEVEL_BAR_COUNT = 32;
const TIMER_TICK_MS = 250;
const PURPLE = "#7C5CFC";

type RecordingState =
  | "idle"
  | "permission-denied"
  | "recording"
  | "uploading"
  | "error";

export default function RecordScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });

  const [state, setState] = useState<RecordingState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(
    () => new Array(LEVEL_BAR_COUNT).fill(0.05)
  );
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);

  // Mic-button breathing pulse while idle, removed while recording.
  const pulse = useSharedValue(1);

  // Configure audio session once on mount. Same recipe as the
  // existing record.tsx — DoNotMix lets phone calls / Siri pause
  // us cleanly instead of crashing.
  useEffect(() => {
    void Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    }).catch(() => {
      // Non-fatal on older iOS — recording still works.
    });
  }, []);

  // Pulse animation. Starts on mount, cancelled when recording begins.
  useEffect(() => {
    if (state === "recording" || state === "uploading") {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 200 });
      return;
    }
    pulse.value = 1;
    pulse.value = withRepeat(
      withTiming(1.06, {
        duration: 1500,
        easing: Easing.bezier(0.215, 0.61, 0.355, 1),
      }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Unmount cleanup — release the mic if we're still holding it.
  useEffect(() => {
    return () => {
      clearTimer();
      const rec = recordingRef.current;
      if (rec) {
        rec.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

    // Permission gate.
    const perm = await Audio.getPermissionsAsync();
    if (!perm.granted) {
      const req = await Audio.requestPermissionsAsync();
      if (!req.granted) {
        setState("permission-denied");
        return;
      }
    }

    try {
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recording.setProgressUpdateInterval(1000);
      recording.setOnRecordingStatusUpdate((status) => {
        if (!status.isRecording) return;
        const meteringDb = status.metering ?? -60;
        const normalized = Math.max(0, Math.min(1, (meteringDb + 60) / 60));
        setLevels((prev) => {
          const next = prev.slice(1);
          next.push(Math.max(0.05, normalized));
          return next;
        });
      });
      await recording.startAsync();
      recordingRef.current = recording;
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setState("recording");
      void trackOnboardingEvent("funnel_recording_started");

      // Timer tick — drives both the displayed elapsed seconds
      // and the 90s hard auto-stop check.
      timerRef.current = setInterval(() => {
        const startedAt = startedAtRef.current ?? Date.now();
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        setElapsedSeconds(seconds);
        if (seconds >= HARD_CAP_SECONDS) {
          // Detach setState from the interval before stop so the
          // post-stop state transition reads the final time.
          clearTimer();
          void stopAndUpload();
        }
      }, TIMER_TICK_MS);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't start recording."
      );
      setState("error");
    }
  }, []);

  const stopAndUpload = useCallback(async () => {
    clearTimer();
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;

    const finalElapsed = startedAtRef.current
      ? Math.floor((Date.now() - startedAtRef.current) / 1000)
      : elapsedSeconds;

    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // already unloaded — fine
    }

    const uri = recording.getURI();
    if (!uri) {
      setError("No audio was captured. Try again.");
      setState("error");
      return;
    }

    setState("uploading");
    try {
      await submitTryRecording(uri, "audio/mp4");
      void trackOnboardingEvent("funnel_recording_completed", {
        value: String(finalElapsed),
      });
      router.push("/onboarding-new/processing" as never);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't upload. Try again."
      );
      setState("error");
    }
    // elapsedSeconds is read but not used as a render trigger — the
    // local startedAtRef is the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSettings = () => {
    void Linking.openSettings();
  };

  // ── Render branches ────────────────────────────────────────────
  if (state === "permission-denied") {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.bg }}>
        <StatusBar style="dark" />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 28,
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 24,
                lineHeight: 30,
                fontWeight: "700",
                color: tokens.text,
                textAlign: "center",
                marginBottom: 16,
              }}
            >
              Microphone access needed
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 15,
                lineHeight: 22,
                color: tokens.textSec,
                textAlign: "center",
                marginBottom: 32,
              }}
            >
              Acuity records your voice locally and sends it for one-
              time analysis. Enable mic access in Settings to keep going.
            </Text>
            <Pressable
              onPress={openSettings}
              style={({ pressed }) => ({
                backgroundColor: PURPLE,
                borderRadius: tokens.radius.pill,
                paddingHorizontal: 24,
                paddingVertical: 14,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 15,
                  fontWeight: "600",
                  color: "#ffffff",
                }}
              >
                Open Settings
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setState("idle");
                setError(null);
              }}
              style={{ marginTop: 12, padding: 8 }}
            >
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 14,
                  color: tokens.textTer,
                }}
              >
                Try again
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const canStop = elapsedSeconds >= MIN_DURATION_SECONDS;
  const showWrapUp =
    state === "recording" && elapsedSeconds >= SUGGESTED_DURATION_SECONDS;
  const timerLabel = `${Math.floor(elapsedSeconds / 60)}:${String(
    elapsedSeconds % 60
  ).padStart(2, "0")}`;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View
          style={{
            flex: 1,
            paddingHorizontal: 28,
          }}
        >
          {/* Headline area — only renders when idle; recording mode
              swaps it for the timer + level bars to keep the eye
              on the recording state. */}
          {state === "idle" || state === "error" ? (
            <View style={{ paddingTop: 32 }}>
              <Text
                style={{
                  fontFamily: tokens.fontDisplay,
                  fontSize: 26,
                  lineHeight: 32,
                  fontWeight: "700",
                  letterSpacing: -0.3,
                  color: tokens.text,
                }}
              >
                Talk for 60 seconds about what&apos;s on your mind right now.
              </Text>
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 15,
                  lineHeight: 22,
                  color: tokens.textSec,
                  marginTop: 12,
                }}
              >
                No judgment. No structure. Just talk.
              </Text>
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 13,
                  lineHeight: 19,
                  color: tokens.textTer,
                  marginTop: 16,
                  fontStyle: "italic",
                }}
              >
                Most people start with &ldquo;Today I…&rdquo;
              </Text>
            </View>
          ) : (
            <View
              style={{
                paddingTop: 32,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 36,
                  fontWeight: "700",
                  color: tokens.text,
                  fontVariant: ["tabular-nums"],
                  letterSpacing: -0.5,
                }}
              >
                {timerLabel}
              </Text>
              {showWrapUp && (
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 13,
                    color: tokens.textTer,
                    marginTop: 4,
                  }}
                >
                  When you&apos;re ready, wrap it up.
                </Text>
              )}
              {/* Level bars */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  height: 48,
                  marginTop: 20,
                  gap: 2,
                }}
              >
                {levels.map((lvl, i) => (
                  <View
                    key={i}
                    style={{
                      width: 3,
                      height: Math.max(4, lvl * 48),
                      borderRadius: 2,
                      backgroundColor:
                        state === "recording" ? PURPLE : tokens.textTer,
                      opacity: state === "recording" ? 0.9 : 0.4,
                    }}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Mic button — fills the middle of the screen. */}
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {state === "uploading" ? (
              <View style={{ alignItems: "center" }}>
                <ActivityIndicator size="large" color={PURPLE} />
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 14,
                    color: tokens.textSec,
                    marginTop: 16,
                  }}
                >
                  Sending to the model…
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  if (state === "recording") {
                    if (canStop) void stopAndUpload();
                  } else {
                    void startRecording();
                  }
                }}
                disabled={state === "recording" && !canStop}
                accessibilityRole="button"
                accessibilityLabel={
                  state === "recording" ? "Stop recording" : "Start recording"
                }
                accessibilityState={{
                  disabled: state === "recording" && !canStop,
                }}
              >
                <Animated.View
                  style={[
                    pulseStyle,
                    {
                      width: 140,
                      height: 140,
                      borderRadius: 70,
                      backgroundColor: PURPLE,
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: PURPLE,
                      shadowOpacity:
                        state === "recording" || state === "idle" ? 0.4 : 0,
                      shadowRadius: 24,
                      shadowOffset: { width: 0, height: 8 },
                      opacity:
                        state === "recording" && !canStop ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontFamily: tokens.fontSans,
                      fontSize: 15,
                      fontWeight: "600",
                      color: "#ffffff",
                      textAlign: "center",
                    }}
                  >
                    {state === "recording"
                      ? canStop
                        ? "Stop"
                        : `${MIN_DURATION_SECONDS - elapsedSeconds}s`
                      : "Start"}
                  </Text>
                </Animated.View>
              </Pressable>
            )}
            {state === "recording" && !canStop && (
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  color: tokens.textTer,
                  textTransform: "uppercase",
                  marginTop: 16,
                }}
              >
                Keep going — {MIN_DURATION_SECONDS}s minimum
              </Text>
            )}
            {error && (
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 13,
                  color: tokens.bad,
                  textAlign: "center",
                  marginTop: 24,
                  paddingHorizontal: 12,
                }}
              >
                {error}
              </Text>
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
