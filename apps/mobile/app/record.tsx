import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { Audio, InterruptionModeIOS } from "expo-av";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isEffectivelySilentPeak,
  NO_SOUND_CAPTURED_MESSAGE,
} from "@acuity/shared";
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
import {
  RecordOrb,
  RecordWaveform,
  SpeedometerGauge,
} from "@/components/recording";
import { useEntryPolling } from "@/hooks/use-entry-polling";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { invalidate } from "@/lib/cache";
import { registerPushTokenAfterRecording } from "@/lib/push-token";

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
  const navigation = useNavigation();
  const { tokens } = useTheme();
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
  // Set when iOS backgrounds the app mid-recording (e.g. a manual
  // screen lock) despite the wake lock — drives the "interrupted"
  // recovery copy instead of a silent stop.
  const [interrupted, setInterrupted] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const peakLevelRef = useRef(0); // P1: loudest normalized level this recording
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);
  // Per-upload cancellation flag (Slice Q5 polish 10, 2026-05-20).
  // The prior cut (polish 7) used an AbortController to cancel the
  // in-flight fetch, but the server commits the Entry row before
  // returning — so aborting the client read doesn't undo the
  // database write, and the user still sees the entry. Instead we
  // mark the current upload as "cancelled," let the fetch complete,
  // then DELETE the row using the entryId from the response.
  //
  // Pattern: the ref holds a pointer to the CURRENT upload's local
  // flag object. Each upload run creates its own `{requested:false}`
  // and assigns it to the ref. handleCancel mutates the ref's
  // target → mutates only the current upload's flag. Older upload
  // closures still hold their own object reference, so a new
  // recording starting while a prior DELETE is pending never
  // overwrites the older upload's intent.
  const currentUploadCancelRef = useRef<{ requested: boolean } | null>(null);

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

      // Slice 9b — post-second-recording push permission ask. The
      // helper is idempotent (PROMPTED_KEY guard) and silently
      // skips unless totalRecordings === 2, so it's safe to call
      // on every successful record. Fire-and-forget: a slow /api/
      // user/me round-trip must not block the entry-detail nav.
      void (async () => {
        try {
          const meRes = await api.get<{
            user?: { totalRecordings?: number };
          }>("/api/user/me");
          const total = meRes.user?.totalRecordings ?? 0;
          await registerPushTokenAfterRecording(total);
        } catch {
          // Non-fatal — registration will retry on the next
          // qualifying record completion.
        }
      })();
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
          // With keep-awake the screen no longer auto-locks mid-record,
          // so this now only fires on a deliberate lock or app-switch.
          // Discard the cut-off take (don't upload a junk partial) and
          // surface why on return — not a silent stop.
          try {
            deactivateKeepAwake("acuity-recording");
          } catch {
            // no-op
          }
          cleanupTimer();
          const rec = recordingRef.current;
          recordingRef.current = null;
          if (rec) rec.stopAndUnloadAsync().catch(() => {});
          setInterrupted(true);
          setError(
            "Your screen locked and interrupted the recording. Tap Try again to record again."
          );
          setState("error");
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
      try {
        deactivateKeepAwake("acuity-recording");
      } catch {
        // no-op
      }
      const rec = recordingRef.current;
      if (rec) {
        rec.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    setInterrupted(false);
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
        // P1: track the loudest level across the WHOLE recording (the
        // `levels` window only retains the last 18 samples) so stopRecording
        // can block a silent upload.
        if (normalized > peakLevelRef.current) {
          peakLevelRef.current = normalized;
        }
        setLevels((prev) => {
          const next = prev.slice(1);
          next.push(Math.max(0.05, normalized));
          return next;
        });
      });
      peakLevelRef.current = 0; // P1: reset peak for this recording
      await recording.startAsync();
      recordingRef.current = recording;
      setElapsed(0);
      setState("recording");
      // Keep iOS from auto-locking mid-recording — the v1.3.2 fix for
      // takes getting cut off when the user holds the phone and talks
      // without touching the screen. Released on stop / cap / unmount /
      // interrupt below.
      activateKeepAwakeAsync("acuity-recording").catch(() => {});

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
    try {
      deactivateKeepAwake("acuity-recording");
    } catch {
      // no-op — tag may already be released
    }
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
    // P1: block silent uploads. If the peak level never crossed the speech
    // threshold, the mic captured nothing (Bluetooth not routing, muted, or
    // wrong input) — surface it now instead of a wasted Whisper call + an
    // after-the-fact "no speech" failure.
    if (isEffectivelySilentPeak(peakLevelRef.current)) {
      Alert.alert("No sound detected", NO_SOUND_CAPTURED_MESSAGE);
      setState("idle");
      return;
    }
    await upload(uri, elapsed);
  };

  const upload = useCallback(
    async (uri: string, duration: number) => {
      setState("uploading");

      // Per-upload local cancel flag. Captured in closure by every
      // post-response branch below. handleCancel mutates this via
      // currentUploadCancelRef. A subsequent upload swaps the ref
      // to a new object — but this closure still holds THIS object,
      // so the wrong upload is never marked cancelled.
      const localCancel = { requested: false };
      currentUploadCancelRef.current = localCancel;

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
          const res = await fetch(`${api.baseUrl()}/api/record`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: form,
            // Intentionally no AbortController signal: the prior cut
            // aborted the read, but the server still committed the
            // entry row. We let the fetch complete and DELETE
            // post-response if the user has cancelled. See Slice Q5
            // polish 10 commit body for the full rationale.
          });

          if (res.status === 402) {
            // 402 returns BEFORE the server creates an entry (cap
            // check happens first), so no DELETE cleanup needed.
            router.replace("/paywall");
            return;
          }

          if (res.status === 429) {
            // Rate limit — no entry created server-side either.
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
          // Capture entryId as a const so the cancel-cleanup closure
          // below binds the right id even if a subsequent upload
          // overwrites currentUploadCancelRef. Bound by value, not
          // by reference.
          const responseEntryId = body.entryId;

          // Grace flow — only show if the user hasn't cancelled.
          // If they tapped Cancel we'd be flashing a modal as they
          // navigate away, which reads as a glitch.
          if (!localCancel.requested && body.freeCapState === "grace") {
            await new Promise<void>((resolve) => {
              Alert.alert(
                "30 of 30 — this one is on us",
                "You've used your free recordings for this month. Continue on web → for unlimited reflection.",
                [{ text: "OK", onPress: () => resolve() }],
                { cancelable: false }
              );
            });
          }

          // Cancel-cleanup branch. The fetch succeeded; the server
          // created an entry. The user has tapped Cancel during
          // "uploading", so we DELETE that entry before it can
          // appear in the list. Fire-and-forget — handleCancel has
          // already navigated the user away. No state updates here
          // (component is likely unmounted).
          if (localCancel.requested && responseEntryId) {
            deleteEntryFireAndForget(responseEntryId);
            return;
          }

          // Async path — poll for completion.
          if (res.status === 202 && responseEntryId) {
            setState("processing");
            setPolledEntryId(responseEntryId);
            return;
          }

          // Sync path — the server returned an inline RecordResponse
          // with the extraction already done. Nav straight to detail.
          if (responseEntryId) {
            router.replace(`/entry/${responseEntryId}`);
            // Slice 9b — same post-second-recording trigger as the
            // async polling branch above. Both code paths complete a
            // recording; both should consider asking for push.
            void (async () => {
              try {
                const meRes = await api.get<{
                  user?: { totalRecordings?: number };
                }>("/api/user/me");
                const total = meRes.user?.totalRecordings ?? 0;
                await registerPushTokenAfterRecording(total);
              } catch {
                // non-fatal
              }
            })();
            return;
          }

          throw new Error("Unexpected response shape");
        } catch (err) {
          // If the user has cancelled, swallow the error and exit
          // quietly. They've navigated away; surfacing an error UI
          // on an unmounted screen is pointless.
          if (localCancel.requested) {
            return;
          }
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

  /**
   * Fire-and-forget DELETE of an entry the user cancelled out of
   * (Slice Q5 polish 10). Called from two paths:
   *   1. After a "successful" upload whose user has tapped Cancel
   *      during the upload phase — the server committed the entry
   *      before the response, and we clean up post-hoc.
   *   2. From handleCancel when state===processing AND phase is
   *      early (QUEUED — pre-Inngest-work). Replaces the prior
   *      POST /cancel for those phases because the user expects
   *      "no entry appears", not "entry appears as FAILED".
   *
   * Closure semantics: `entryId` is passed as a value (not a ref).
   * If the user starts a new recording before this DELETE settles,
   * the new recording's flow is independent — this DELETE still
   * targets the original entry.
   *
   * Errors are swallowed silently. A failed DELETE leaves the row
   * in the list; user can manually swipe-delete. Surfacing an
   * error UI mid-new-recording would be worse than the stale row.
   */
  const deleteEntryFireAndForget = useCallback((entryId: string) => {
    void (async () => {
      try {
        const apiBase =
          process.env.EXPO_PUBLIC_API_URL ?? "https://getacuity.io";
        const token = await getToken();
        await fetch(`${apiBase}/api/entries/${entryId}`, {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        invalidate("/api/entries");
        invalidate("/api/home");
      } catch {
        // Best-effort cleanup; row may persist on failure.
      }
    })();
  }, []);

  const handlePress = () => {
    if (state === "idle") startRecording();
    else if (state === "recording") stopRecording();
    else if (state === "error") {
      setError(null);
      setInterrupted(false);
      setState("idle");
    }
  };

  /**
   * Discard the in-progress recording — stop mic, drop the captured
   * audio without uploading, return to idle. Used by the top-left
   * back button's "Discard" branch (Slice Q5 polish 3, 2026-05-20).
   * The standard stopRecording() always uploads at the end; this is
   * the no-upload variant.
   */
  const discardRecording = useCallback(async () => {
    cleanupTimer();
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch {
        // stop can throw if already unloaded — ignore
      }
    }
    setElapsed(0);
    setState("idle");
  }, []);

  /**
   * Back button handler (Slice Q5 polish 3). State-aware:
   *   - idle      → router.back()
   *   - recording → confirm dialog; on Discard, drop audio + back
   *   - other     → button is hidden in render, so unreachable here
   */
  const handleBackPress = useCallback(() => {
    if (state === "recording") {
      Alert.alert(
        "Discard this recording?",
        "You'll lose what you've recorded so far.",
        [
          { text: "Keep recording", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              void discardRecording().then(() => router.back());
            },
          },
        ]
      );
      return;
    }
    router.back();
  }, [state, discardRecording, router]);

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
    if (canceling) return;
    // Q5 polish 10 — Cancel during "uploading": flag the in-flight
    // upload for post-response DELETE cleanup, navigate the user
    // away immediately. The upload function's continuation fires
    // a fire-and-forget DELETE when the server response arrives
    // with an entryId. See `upload` + `deleteEntryFireAndForget`
    // above for the per-upload closure-capture rationale.
    if (state === "uploading") {
      if (currentUploadCancelRef.current) {
        currentUploadCancelRef.current.requested = true;
      }
      setElapsed(0);
      setState("idle");
      router.back();
      return;
    }
    if (!polledEntryId) return;
    // Capture entryId in a const so the network-bound branches all
    // operate on the same id even if state shifts mid-flight.
    const entryIdAtCancel = polledEntryId;
    // Phase routing (Q5 polish 10):
    //   - QUEUED (UI label "Saving") or unknown → DELETE. From the
    //     user's POV the entry was never created; cleaner than the
    //     existing "FAILED with __canceled_by_user__" marker which
    //     leaves an audit row in the Entries list.
    //   - TRANSCRIBING / EXTRACTING / anything else → POST /cancel.
    //     Inngest is mid-pipeline; deleting the row underneath it
    //     breaks in-flight step.run() calls. The canceledAt-marker
    //     path is designed for that.
    const phase = poll.phase;
    const useDeletePath = phase === "QUEUED" || phase == null;
    setCanceling(true);
    try {
      if (useDeletePath) {
        const apiBase =
          process.env.EXPO_PUBLIC_API_URL ?? "https://getacuity.io";
        const token = await getToken();
        const res = await fetch(
          `${apiBase}/api/entries/${entryIdAtCancel}`,
          {
            method: "DELETE",
            headers: token
              ? { Authorization: `Bearer ${token}` }
              : undefined,
          }
        );
        if (res.status === 410) {
          // Pipeline beat us — open the completed entry instead of
          // failing the cancel.
          router.replace(`/entry/${entryIdAtCancel}`);
          return;
        }
        // 200/204 = deleted; 404 = already gone (idempotent). Both ok.
        if (!res.ok && res.status !== 404) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(body?.error ?? `Cancel failed (${res.status})`);
          setState("error");
          return;
        }
        invalidate("/api/entries");
        invalidate("/api/home");
        router.back();
        return;
      }
      // Later-phase fall-through: existing POST /cancel flow.
      // Manual fetch instead of api.post so we can introspect 410.
      const apiBase =
        process.env.EXPO_PUBLIC_API_URL ?? "https://getacuity.io";
      const token = await getToken();
      const res = await fetch(
        `${apiBase}/api/entries/${entryIdAtCancel}/cancel`,
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
        router.replace(`/entry/${entryIdAtCancel}`);
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
  }, [state, polledEntryId, canceling, router, poll.phase]);

  // Wire the back button into the native navigation header's
  // headerLeft slot (Slice Q5 polish 5, 2026-05-20). The prior cut
  // had a custom in-content Pressable positioned via insets.top —
  // which lands below the modal header, visually detached from the
  // "Recording" title. headerLeft sits inside the header bar,
  // auto-aligned with the title baseline.
  //
  // Visibility: idle + recording only. Upload/processing/error/timeout
  // hide the affordance (those have their own controls or shouldn't
  // be backed out of mid-flight). Returning `null` from headerLeft
  // removes the slot entirely.
  useEffect(() => {
    const showBack = state === "idle" || state === "recording";
    navigation.setOptions({
      headerLeft: () =>
        showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              state === "recording" ? "Discard recording" : "Back"
            }
            onPress={handleBackPress}
            hitSlop={12}
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              marginLeft: 4,
            }}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={tokens.textSec}
            />
          </Pressable>
        ) : null,
    });
  }, [state, handleBackPress, navigation, tokens.textSec]);

  // ────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12]" edges={["bottom"]}>
      <View className="flex-1 items-center justify-center px-8">
        {state === "processing" || state === "uploading" ? (
          // Q5 polish 7 — Cancel button now shows from the moment
          // "uploading" starts (not just on the later processing
          // sub-steps). Tap during "uploading" aborts the in-flight
          // fetch via the per-attempt AbortController in handleCancel;
          // tap during "processing" hits /api/entries/[id]/cancel as
          // before. Same button, same gap-14 spacing for breathing
          // room beneath the checklist.
          <View className="items-center gap-14">
            {state === "uploading" ? (
              <ProcessingProgressBar phase="uploading" elapsedSeconds={0} />
            ) : (
              <ProcessingView
                phase={poll.phase}
                elapsedSeconds={poll.elapsedSeconds}
              />
            )}
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
        ) : state === "error" ? (
          <View className="items-center gap-4 px-4">
            <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
            <Text className="text-zinc-800 dark:text-zinc-100 text-lg font-semibold text-center">
              {interrupted ? "Recording interrupted" : "Upload failed."}
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
          <RecordSurface
            state={state}
            elapsed={elapsed}
            levels={levels}
            onPress={handlePress}
            tokens={tokens}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

/**
 * RecordSurface — the idle + recording render for the recording
 * screen. Slice Q5 (2026-05-20) — visual layer of the recording
 * screen. Consumes existing state machine signals (state / elapsed /
 * levels) without modifying them.
 *
 * Composition:
 *   - SpeedometerGauge (top half-arc, fills with elapsed/MAX_SECONDS)
 *   - RecordOrb (Pressable, voice-reactive, replaces the prior mic
 *     button — preserves tap-to-toggle semantics)
 *   - Timer text (display font, "0:23" — sits inside the arc cup)
 *   - RecordWaveform (fed by the same levels[] expo-av populates)
 *
 * Ghost transcript SKIPPED: the current upload-then-poll model has
 * no streaming transcript signal during recording. The design's
 * ghost transcript area would need a new streaming infrastructure
 * (Whisper streaming or similar) which is explicitly out of Q5
 * scope. Add to backlog when streaming infra ships.
 *
 * TODO(post-Q5): wire ghost transcript when partial-transcript
 * streaming exists. The visual hook is the empty space between the
 * timer and the waveform — drop a fade-masked Text in there.
 */
function RecordSurface({
  state,
  elapsed,
  levels,
  onPress,
  tokens,
}: {
  state: State;
  elapsed: number;
  levels: number[];
  onPress: () => void;
  tokens: ReturnType<typeof useTheme>["tokens"];
}) {
  const isRecording = state === "recording";
  // Latest amplitude tail — drives the orb's reactive scale/halo.
  // Falls to 0 outside recording so the orb settles to idle breath.
  const latestAmplitude = isRecording
    ? (levels[levels.length - 1] ?? 0)
    : 0;
  const remainingWarning =
    isRecording && MAX_SECONDS - elapsed <= 30;
  return (
    <View style={{ alignItems: "center", gap: 32, width: "100%" }}>
      <SpeedometerGauge elapsed={elapsed} maxSeconds={MAX_SECONDS}>
        <View style={{ alignItems: "center", gap: 14 }}>
          <RecordOrb
            amplitude={latestAmplitude}
            active={isRecording}
            onPress={onPress}
          />
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 44,
              fontWeight: "700",
              letterSpacing: -1.4,
              color: remainingWarning ? tokens.bad : tokens.text,
              lineHeight: 48,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatTime(isRecording ? elapsed : 0)}
          </Text>
        </View>
      </SpeedometerGauge>

      <RecordWaveform levels={levels} active={isRecording} height={64} />

      {/* Single helper line — preserves the existing tap-to-X
          affordance copy. The orb itself is the action target; this
          text is the only chrome below it. */}
      <Text
        style={{
          fontFamily: tokens.fontSans,
          fontSize: 14,
          color: tokens.textTer,
          textAlign: "center",
        }}
      >
        {isRecording
          ? remainingWarning
            ? `${MAX_SECONDS - elapsed}s left`
            : "Tap the orb to stop"
          : "Tap the orb to start your recording"}
      </Text>
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
