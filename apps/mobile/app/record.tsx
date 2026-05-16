import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { Audio, InterruptionModeIOS } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  type AppStateStatus,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ProcessingProgressBar } from "@/components/processing-progress-bar";
import { useEntryPolling } from "@/hooks/use-entry-polling";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { invalidate } from "@/lib/cache";

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

// Hard cap on recording length. Bumped 120s → 300s on 2026-05-09 after
// Keenan's TestFlight test surfaced "user hits a wall mid-recording" —
// the original 2-minute cap was set to "match" /api/record's Vercel
// function maxDuration of 120s, but the upload-handler request
// completes in seconds regardless of audio length (Whisper transcription
// runs async via Inngest after the request returns). 5min covers ~95%
// of journaling sessions; transcription cost delta is ~$0.018 per
// recording — trivial. Beyond 5min Whisper's per-file 25MB ceiling
// becomes the next constraint.
const MAX_SECONDS = 300;
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
  // v1.1 free-tier slice 6 — surfaces when the cap flag is on AND
  // this recording is the user's 30th of the month. "grace" → show
  // the "this one is on us" modal before navigating to detail.
  // "ok" is omitted by the server; "blocked" is a 402, not 201/202.
  freeCapState?: "grace" | "blocked";
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
  const [canceling, setCanceling] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);

  const poll = useEntryPolling(polledEntryId);

  // Bridge polling terminal states → nav or error surface.
  useEffect(() => {
    if (!polledEntryId) return;
    if (poll.status === "complete" || poll.status === "partial") {
      // Invalidate every cache key that derives from entry state so
      // the next visit to Insights / Home / Entries refetches fresh
      // data instead of showing stale cache. Most visible symptom
      // pre-fix (Keenan TestFlight, 2026-05-09): the Life Matrix
      // radar on the Insights tab kept showing values from the first
      // entry and never updated. The cache module's stale-while-
      // revalidate pattern with 30s TTL meant a quick tab-switch
      // post-recording landed on cached data; user thought the
      // radar was frozen.
      //
      // /api/weekly is intentionally NOT invalidated — weekly reports
      // require explicit generation; single-entry events don't change
      // them.
      invalidate("/api/lifemap");
      invalidate("/api/lifemap/trend");
      invalidate("/api/entries");
      invalidate("/api/home");
      invalidate("/api/user/progression");
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
      // expo-av's default metering cadence is 500ms (2 Hz). Bumping
      // to 1000ms (1 Hz) halves the JS-thread setLevels churn with
      // zero visible impact on the level-bar animation — each status
      // callback forces a re-render cascade, so cutting them in half
      // is free perf.
      recording.setProgressUpdateInterval(1000);
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
      // The most common production cause is the iOS audio session being
      // held by another app — phone call, FaceTime, Voice Memos, etc.
      // expo-av surfaces this as a generic prepareToRecordAsync throw,
      // so we re-check permission state to disambiguate the rarer
      // "permission revoked between request and use" case from the
      // dominant "audio session busy" case.
      const nativeMessage = err instanceof Error ? err.message : String(err);
      const nativeCode =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code)
          : null;
      Sentry.addBreadcrumb({
        category: "audio",
        level: "error",
        message: "recording.start failed",
        data: { nativeMessage, nativeCode },
      });

      const fresh = await Audio.getPermissionsAsync().catch(() => null);
      if (fresh && !fresh.granted) {
        Alert.alert(
          "Microphone access required",
          "Enable in Settings → Acuity → Microphone, then try again.",
          [{ text: "OK", onPress: () => router.back() }]
        );
        return;
      }
      Alert.alert(
        "Recording unavailable",
        "Your phone is in use by another app or a call. End the call or close the other app, then try again."
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

          // v1.1 slice 6 — grace recording (30/30, "this one is on
          // us"). The server already accepted the recording and
          // bumped the counter; the modal is informational. Show
          // it before transitioning so the user sees the messaging
          // exactly once on the recording that triggers the cap.
          // Pure visual layer — both async and sync paths call into
          // the same flow afterward via the resolved promise.
          if (body.freeCapState === "grace") {
            await new Promise<void>((resolve) => {
              Alert.alert(
                "30 of 30 — this one is on us",
                "You've used your free recordings for this month. Continue on web → for unlimited reflection.",
                [{ text: "OK", onPress: () => resolve() }],
                { cancelable: false }
              );
            });
          }

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

  // Cancel an in-flight entry from the processing screen. Slice C
  // Stage 2 (2026-05-16). Posts to /api/entries/[id]/cancel which
  // sets canceledAt on the row; the Inngest pipeline picks up the
  // flag at the next step.run() boundary and transitions to FAILED
  // with a marker errorMessage.
  //
  // Response handling:
  //   200 ok or alreadyCanceled — stop polling, nav back to dashboard
  //   410 AlreadyComplete       — pipeline beat us to it. Nav to the
  //                                completed entry so user can decide
  //                                what to do with it.
  //   anything else             — show alert + stay on screen
  const handleCancel = useCallback(async () => {
    if (!polledEntryId || canceling) return;
    setCanceling(true);
    try {
      // Manual fetch instead of api.post so we can introspect 410.
      const apiBase =
        process.env.EXPO_PUBLIC_API_URL ?? "https://getacuity.io";
      const token = await getToken();
      const res = await fetch(
        `${apiBase}/api/entries/${polledEntryId}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );
      if (res.status === 410) {
        // Pipeline completed between user tap and server receipt —
        // open the finished entry instead of canceling.
        router.replace(`/entry/${polledEntryId}`);
        return;
      }
      if (!res.ok) {
        // Surface the failure without trapping the user; they can
        // tap Back to dashboard if they want.
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? `Cancel failed (${res.status})`);
        setState("error");
        return;
      }
      // Success — invalidate caches that might be showing the
      // canceled entry as in-flight, then nav back to dashboard.
      invalidate("/api/entries");
      invalidate("/api/home");
      router.back();
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Cancel failed");
      setState("error");
    } finally {
      setCanceling(false);
    }
  }, [polledEntryId, canceling, router]);

  // ────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12]" edges={["bottom"]}>
      <View className="flex-1 items-center justify-center px-8">
        {state === "processing" ? (
          <View className="items-center gap-6">
            <ProcessingView
              phase={poll.phase}
              elapsedSeconds={poll.elapsedSeconds}
            />
            <Pressable
              onPress={() => void handleCancel()}
              disabled={canceling}
              hitSlop={12}
              style={{ opacity: canceling ? 0.4 : 1 }}
              className="px-4 py-2 rounded-full border border-zinc-300 dark:border-white/15"
            >
              <Text className="text-sm text-zinc-600 dark:text-zinc-300">
                {canceling ? "Canceling…" : "Cancel"}
              </Text>
            </Pressable>
          </View>
        ) : state === "uploading" ? (
          <ProcessingProgressBar phase="uploading" elapsedSeconds={0} />
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
            {/* Timer — shows elapsed / max when recording so the cap is
                visible at a glance. Color shifts to amber in the last
                30s so the user has time to wrap up rather than
                hitting an unannounced wall. */}
            <View className="items-center gap-1">
              <Text className="text-zinc-800 dark:text-zinc-100 text-lg font-medium">
                {state === "recording" ? "Recording" : "Ready"}
              </Text>
              <Text
                className={`text-5xl font-mono tabular-nums ${
                  state === "recording" && MAX_SECONDS - elapsed <= 30
                    ? "text-amber-500"
                    : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                {state === "recording"
                  ? `${formatTime(elapsed)} / ${formatTime(MAX_SECONDS)}`
                  : formatTime(0)}
              </Text>
              {state === "idle" && (
                <Text className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">
                  Up to 5 minutes. Talk as long as you need.
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

            {/* Progress bar when recording. Light-mode track uses
                zinc-200 so the empty portion remains visible against
                the light-mode bg; dark-mode keeps the original
                zinc-800 track. */}
            {state === "recording" && (
              <View className="w-48 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800">
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
  return (
    <View className="w-full items-center">
      <ProcessingProgressBar phase={phase} elapsedSeconds={elapsedSeconds} />
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
