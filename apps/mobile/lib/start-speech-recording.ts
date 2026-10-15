import * as Sentry from "@sentry/react-native";
import {
  Audio,
  InterruptionModeAndroid,
  InterruptionModeIOS,
} from "expo-av";
import { AppState } from "react-native";

import { SPEECH_RECORDING_OPTIONS } from "@/lib/audio-recording-options";

/**
 * The ONE way the app starts a voice recording (1.9.1). Every recorder —
 * the main recorder, the onboarding (v10 + legacy) recorders and the
 * practice round — goes through here.
 *
 * Why: each screen used to start recording its own way, and each got a
 * different subset of the fixes. The onboarding recorder failed with
 * "Ripple couldn't start recording" on the FIRST try for new installs
 * (production events 2026-10-15: every failure followed a fresh mic
 * permission prompt; the retry, with permission already granted, worked).
 * Root cause: when the iOS permission alert closes, the app is briefly
 * "inactive", and the screen pushed in that instant tries to activate the
 * audio session before iOS allows it. The Action Button launch had the
 * same failure (fixed only in app/record.tsx). This makes the fix shared:
 *
 *   1. wait for the app to be "active" (up to 3s),
 *   2. set the recording audio mode and WAIT for it (not fire-and-forget),
 *   3. prepare + start; on failure unload the half-prepared recording
 *      (expo-av allows only one prepared recording at a time, so a leaked
 *      one makes every later attempt fail too),
 *   4. retry once after 600ms, re-applying the audio mode.
 *
 * Permission is NOT requested here — callers own that UX. Throws the last
 * error if both attempts fail.
 */

export type SpeechRecordingStatusHandler = (status: Audio.RecordingStatus) => void;

export function waitUntilAppActive(timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    if (AppState.currentState === "active") return resolve();
    const timer = setTimeout(() => {
      sub.remove();
      resolve();
    }, timeoutMs);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        clearTimeout(timer);
        sub.remove();
        resolve();
      }
    });
  });
}

export async function setRecordingAudioMode(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: false,
    });
  } catch {
    // Older iOS / Expo Go can reject parts of the mode; recording can still
    // start without clean interruption handling.
  }
}

async function attemptStart(
  onStatus: SpeechRecordingStatusHandler | undefined,
  progressIntervalMs: number
): Promise<Audio.Recording> {
  const recording = new Audio.Recording();
  try {
    await recording.prepareToRecordAsync(SPEECH_RECORDING_OPTIONS);
    recording.setProgressUpdateInterval(progressIntervalMs);
    if (onStatus) {
      recording.setOnRecordingStatusUpdate(onStatus);
    }
    await recording.startAsync();
    return recording;
  } catch (err) {
    // Release the native recorder so the retry (or the next screen) can
    // prepare a new one.
    await recording.stopAndUnloadAsync().catch(() => {});
    throw err;
  }
}

export async function startSpeechRecording({
  onStatus,
  progressIntervalMs = 500,
  source,
}: {
  onStatus?: SpeechRecordingStatusHandler;
  progressIntervalMs?: number;
  /** For diagnostics ("main", "onboarding_v10", …). */
  source: string;
}): Promise<Audio.Recording> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    await waitUntilAppActive();
    await setRecordingAudioMode();
    try {
      const rec = await attemptStart(onStatus, progressIntervalMs);
      if (attempt > 1) {
        Sentry.addBreadcrumb({
          category: "audio",
          level: "info",
          message: "recording.start recovered on retry",
          data: { source },
        });
      }
      return rec;
    } catch (err) {
      lastErr = err;
      Sentry.addBreadcrumb({
        category: "audio",
        level: "error",
        message: "recording.start failed",
        data: {
          source,
          attempt,
          appState: AppState.currentState,
          nativeMessage: err instanceof Error ? err.message : String(err),
          nativeCode:
            err && typeof err === "object" && "code" in err
              ? String((err as { code?: unknown }).code)
              : null,
        },
      });
      if (attempt === 1) await new Promise((r) => setTimeout(r, 600));
    }
  }
  Sentry.captureMessage(`recording.start failed twice (${source})`, "warning");
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
