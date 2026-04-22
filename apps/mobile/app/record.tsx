import { Ionicons } from "@expo/vector-icons";
import { Audio, InterruptionModeIOS } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useEntryPolling } from "@/hooks/use-entry-polling";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";

/**
 * Recording modal. One screen, one state machine. Consolidates the
 * prior app/record.tsx + app/(tabs)/index.tsx recording code.
 *
 * Flow:
 *   permission → idle → recording (with live level meter) →
 *   uploading → processing (polling) → done (nav to entry detail)
 *
 * Error branches:
 *   - permission denied: alert + back to tabs
 *   - 402 (paywall): alert + open /upgrade in SFSafari
 *   - 429 (rate limit): alert with retry-after
 *   - upload network failure: retry up to 3× with exponential
 *     backoff (2s, 4s, 8s), then surface an error UI with a retry
 *     button
 *   - audio interruption (phone call, Siri): Audio.setAudioModeAsync
 *     with allowsRecordingIOS:true routes non-recording interruptions
 *     to pause, but if interrupted mid-record we stop + upload what
 *     we have rather than losing the whole take
 *   - poll timeout: the server-side processing ran > 3min; we keep
 *     the entry id and surface a "still working — check dashboard"
 *     nudge rather than stranding the user on a spinner
 *
 * AppState handling: the polling hook already cancels on unmount
 * cleanly, and the foreground-refresh in auth-context picks up any
 * subscription status change after the user returns from Safari
 * (paywall flow). No per-screen AppState listener needed for
 * polling itself; expo-router keeps the screen mounted when the
 * app backgrounds.
 */

const MAX_SECONDS = 120; // matches /api/record server cap
const UPLOAD_RETRY_SCHEDULE_MS = [2000, 4000, 8000];

type State =
  | "idle"
  | "recording"
  | "uploading"
  | "processing" // async path; polling driven by useEntryPolling
  | "error"
  | "timeout";

type UploadResponse = {
  entryId: string;
  status?: string;
};

export default function RecordScreen() {
  const router = useRouter();
  // Context params — forwarded to /api/record so the extraction
  // pipeline knows what this entry is about.
  //   goalId        — set when opened from a goal detail / card
  //                   ("Record about this goal").
  //   dimensionKey  — lowercase key from DEFAULT_LIFE_AREAS; set when
  //                   opened from a dimension detail's "Record about
  //                   this" button. Persisted as Entry.dimensionContext.
  const params = useLocalSearchParams<{
    goalId?: string;
    dimensionKey?: string;
  }>();
  const goalId =
    typeof params.goalId === "string" && params.goalId.length > 0
      ? params.goalId
      : null;
  const dimensionKey =
    typeof params.dimensionKey === "string" && params.dimensionKey.length > 0
      ? params.dimensionKey
      : null;
  const [state, setState] = useState<State>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(18).fill(0.05));
  const [error, setError] = useState<string | null>(null);
  const [polledEntryId, setPolledEntryId] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);

  const poll = useEntryPolling(polledEntryId);

  // Bridge polling terminal states → nav or error surface.
  useEffect(() => {
    if (!polledEntryId) return;
    if (poll.status === "complete" || poll.status === "partial") {
      // Route to the entry detail screen. router.replace so a back
      // swipe from detail goes to the dashboard, not back to a
      // post-record spinner.
      router.replace(`/entry/${polledEntryId}`);
    } else if (poll.status === "failed") {
      setError(poll.entry?.errorMessage ?? "Processing failed.");
      setState("error");
    } else if (poll.status === "timeout") {
      setState("timeout");
    }
  }, [poll.status, poll.entry, polledEntryId, router]);

  // Set up audio mode on mount — routes non-recording interruptions
  // (incoming call, Siri, alarm) to pause rather than crash the
  // session. allowsRecordingIOS makes the OS grant foreground audio.
  useEffect(() => {
    Audio.requestPermissionsAsync();
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    }).catch(() => {
      // Some older iOS versions + Expo Go can reject the mode; not
      // fatal, recording will still start, just without clean
      // interruption handling.
    });
  }, []);

  // If the user backgrounds the app while polling, we just keep
  // polling — it resumes in the background for a short while before
  // iOS suspends the JS runtime. When they foreground, the poll
  // resumes naturally. If they backgrounded during recording, the
  // OS pauses the mic + reports an interruption; we stop cleanly.
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (next: AppStateStatus) => {
        const prev = appState.current;
        appState.current = next;
        if (
          prev === "active" &&
          (next === "background" || next === "inactive") &&
          state === "recording"
        ) {
          // Stop and upload whatever we have so far — losing a
          // backgrounded session would be worse than a short take.
          stopRecording().catch(() => {});
        }
      }
    );
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const cleanupTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Unmount: release mic if still held (e.g. user swipes the modal
  // down mid-recording). Otherwise the red recording indicator
  // persists until iOS reaps the process.
  useEffect(() => {
    return () => {
      cleanupTimer();
      const rec = recordingRef.current;
      if (rec) {
        rec.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    setPolledEntryId(null);
    const perm = await Audio.getPermissionsAsync();
    if (!perm.granted) {
      const req = await Audio.requestPermissionsAsync();
      if (!req.granted) {
        Alert.alert(
          "Microphone access required",
          "Enable Acuity's mic access in Settings → Acuity → Microphone, then tap record again.",
          [{ text: "OK", onPress: () => router.back() }]
        );
        return;
      }
    }

    try {
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      // Subscribe to metering updates for the level-bar visualization.
      recording.setOnRecordingStatusUpdate((status) => {
        if (!status.isRecording) return;
        const meteringDb = status.metering ?? -60;
        // Map -60..0 dB → 0..1. Apple's dB range is roughly -60 silent
        // to 0 peak; clamp + normalize.
        const normalized = Math.max(0, Math.min(1, (meteringDb + 60) / 60));
        setLevels((prev) => {
          const next = prev.slice(1);
          next.push(Math.max(0.05, normalized));
          return next;
        });
      });
      await recording.startAsync();
      recordingRef.current = recording;
      setElapsed(0);
      setState("recording");

      timerRef.current = setInterval(() => {
        setElapsed((s) => {
          if (s + 1 >= MAX_SECONDS) {
            // auto-stop; state transition happens in stopRecording
            stopRecording().catch(() => {});
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      console.warn("[record] prepare failed:", err);
      Alert.alert(
        "Recording unavailable",
        "Couldn't open the microphone. Try again or reload the app."
      );
    }
  };

  const stopRecording = async () => {
    cleanupTimer();
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // stop can throw if already unloaded — ignore
    }
    const uri = recording.getURI();
    if (!uri) {
      Alert.alert("Error", "No audio was captured.");
      setState("idle");
      return;
    }
    await upload(uri, elapsed);
  };

  const upload = useCallback(
    async (uri: string, duration: number) => {
      setState("uploading");

      const form = new FormData();
      // `audio/mp4` is the IANA-canonical MIME for AAC-in-MP4-container
      // files (which is what Expo's Audio.Recording produces on iOS
      // despite the .m4a extension). Explicitly setting it here aligns
      // the client with the server's normalizer in apps/web/src/lib/
      // audio.ts::normalizeAudioMimeType — even if iOS's native
      // FormData overrides with "audio/x-m4a" on some builds, the
      // server maps both to "audio/mp4" before Supabase ever sees it.
      form.append("audio", {
        uri,
        name: "recording.m4a",
        type: "audio/mp4",
      } as unknown as Blob);
      form.append("durationSeconds", String(duration));
      if (goalId) {
        form.append("goalId", goalId);
      }
      if (dimensionKey) {
        form.append("dimensionContext", dimensionKey);
      }

      let attempt = 0;
      const token = await getToken();

      while (attempt < UPLOAD_RETRY_SCHEDULE_MS.length + 1) {
        try {
          const res = await fetch(
            `${api.baseUrl()}/api/record`,
            {
              method: "POST",
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
              body: form,
            }
          );

          if (res.status === 402) {
            // Route to the full native paywall screen. It handles
            // the SFSafari handoff + "remind me later" dismissal.
            // Using replace so a swipe-down on the paywall modal
            // returns to the dashboard, not back here to the record
            // screen in a stuck state.
            router.replace("/paywall");
            return;
          }

          if (res.status === 429) {
            const body = (await res.json().catch(() => ({}))) as {
              retryAfter?: number;
            };
            const retry = Number(body.retryAfter ?? 60);
            Alert.alert(
              "Recording too frequently",
              `Try again in ${Math.ceil(retry / 60)} minute${retry > 60 ? "s" : ""}.`,
              [{ text: "OK", onPress: () => router.back() }]
            );
            return;
          }

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(
              (body as { error?: string }).error ?? `HTTP ${res.status}`
            );
          }

          const body = (await res.json()) as UploadResponse;

          // Async path — poll for completion.
          if (res.status === 202 && body.entryId) {
            setState("processing");
            setPolledEntryId(body.entryId);
            return;
          }

          // Sync path — the server returned an inline RecordResponse
          // with the extraction already done. Nav straight to detail.
          if (body.entryId) {
            router.replace(`/entry/${body.entryId}`);
            return;
          }

          throw new Error("Unexpected response shape");
        } catch (err) {
          attempt++;
          if (attempt > UPLOAD_RETRY_SCHEDULE_MS.length) {
            setError(err instanceof Error ? err.message : "Upload failed.");
            setState("error");
            return;
          }
          // Backoff then retry — mostly covers transient network
          // drops (dead zone while walking, wifi-cellular handoff).
          const wait = UPLOAD_RETRY_SCHEDULE_MS[attempt - 1];
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    },
    [router, goalId, dimensionKey]
  );

  const handlePress = () => {
    if (state === "idle") startRecording();
    else if (state === "recording") stopRecording();
    else if (state === "error") {
      setError(null);
      setState("idle");
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12]" edges={["bottom"]}>
      <View className="flex-1 items-center justify-center px-8">
        {state === "processing" ? (
          <ProcessingView
            phase={poll.phase}
            elapsedSeconds={poll.elapsedSeconds}
          />
        ) : state === "uploading" ? (
          <View className="items-center gap-4">
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text className="text-zinc-400 dark:text-zinc-500 text-sm">Uploading…</Text>
          </View>
        ) : state === "error" ? (
          <View className="items-center gap-4 px-4">
            <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
            <Text className="text-zinc-800 dark:text-zinc-100 text-lg font-semibold text-center">
              Upload failed.
            </Text>
            <Text className="text-zinc-400 dark:text-zinc-500 text-sm text-center">
              {error}
            </Text>
            <Pressable
              onPress={handlePress}
              className="mt-4 rounded-2xl bg-violet-600 px-6 py-3"
            >
              <Text className="text-sm font-semibold text-white">
                Try again
              </Text>
            </Pressable>
          </View>
        ) : state === "timeout" ? (
          <View className="items-center gap-4 px-4">
            <Text className="text-zinc-800 dark:text-zinc-100 text-lg font-semibold text-center">
              Still working on it.
            </Text>
            <Text className="text-zinc-400 dark:text-zinc-500 text-sm text-center">
              We saved your recording. Check your dashboard in a few minutes.
            </Text>
            <Pressable
              onPress={() => router.back()}
              className="mt-4 rounded-2xl bg-violet-600 px-6 py-3"
            >
              <Text className="text-sm font-semibold text-white">
                Back to dashboard
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="items-center gap-10">
            {/* Timer */}
            <View className="items-center gap-1">
              <Text className="text-zinc-800 dark:text-zinc-100 text-lg font-medium">
                {state === "recording" ? "Recording" : "Ready"}
              </Text>
              <Text className="text-zinc-600 dark:text-zinc-300 text-5xl font-mono tabular-nums">
                {formatTime(state === "recording" ? elapsed : 0)}
              </Text>
              {state === "idle" && (
                <Text className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">
                  Up to 2 minutes. Talk as long as you need.
                </Text>
              )}
            </View>

            {/* Level meter */}
            <LevelMeter
              levels={levels}
              active={state === "recording"}
            />

            {/* Record / stop button */}
            <Pressable
              onPress={handlePress}
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
            >
              <View
                className={`h-28 w-28 rounded-full items-center justify-center ${
                  state === "recording" ? "bg-red-600" : "bg-violet-600"
                }`}
                style={
                  state === "idle"
                    ? {
                        shadowColor: "#7C3AED",
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.5,
                        shadowRadius: 24,
                        elevation: 12,
                      }
                    : undefined
                }
              >
                {state === "recording" ? (
                  <View className="h-10 w-10 rounded-md bg-white dark:bg-[#1E1E2E]" />
                ) : (
                  <Ionicons name="mic" size={44} color="#fff" />
                )}
              </View>
            </Pressable>

            <Text className="text-zinc-500 dark:text-zinc-400 text-sm text-center">
              {state === "recording"
                ? "Tap to stop"
                : "Tap to start your brain dump"}
            </Text>

            {/* Progress bar when recording */}
            {state === "recording" && (
              <View className="w-48 h-1 rounded-full bg-zinc-800">
                <View
                  className="h-1 rounded-full bg-red-500"
                  style={{ width: `${(elapsed / MAX_SECONDS) * 100}%` }}
                />
              </View>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function LevelMeter({ levels, active }: { levels: number[]; active: boolean }) {
  return (
    <View className="flex-row items-end gap-1 h-16">
      {levels.map((lvl, i) => (
        <View
          key={i}
          className={`w-1.5 rounded-full ${active ? "bg-violet-500" : "bg-zinc-800"}`}
          style={{
            height: `${Math.max(6, lvl * 100)}%`,
            opacity: active ? 1 : 0.3,
          }}
        />
      ))}
    </View>
  );
}

function ProcessingView({
  phase,
  elapsedSeconds,
}: {
  phase: string | null;
  elapsedSeconds: number;
}) {
  const steps: { key: string; label: string }[] = [
    { key: "QUEUED", label: "Saving your recording" },
    { key: "TRANSCRIBING", label: "Transcribing" },
    { key: "EXTRACTING", label: "Extracting insights" },
    { key: "PERSISTING", label: "Almost done" },
  ];
  const currentIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === phase)
  );
  return (
    <View className="w-full items-center">
      <ActivityIndicator size="large" color="#7C3AED" />
      <Text className="mt-6 text-zinc-800 dark:text-zinc-100 text-base font-semibold">
        {steps[currentIndex]?.label ?? "Processing"}
      </Text>
      <Text className="mt-1 text-zinc-500 dark:text-zinc-400 text-xs">
        {elapsedSeconds}s elapsed — usually under a minute
      </Text>

      <View className="mt-8 w-full max-w-xs gap-2">
        {steps.map((step, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <View key={step.key} className="flex-row items-center gap-3">
              <View
                className={`h-4 w-4 rounded-full ${
                  done
                    ? "bg-violet-500"
                    : current
                      ? "bg-violet-500/40 border border-violet-500"
                      : "bg-zinc-800"
                }`}
              />
              <Text
                className={`text-sm ${
                  done || current ? "text-zinc-700 dark:text-zinc-200" : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
