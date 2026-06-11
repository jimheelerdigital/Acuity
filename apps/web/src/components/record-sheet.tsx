"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  isEffectivelySilentPeak,
  NO_SOUND_CAPTURED_MESSAGE,
} from "@acuity/shared";

import { usePendingEntries } from "@/contexts/pending-entries-context";

/**
 * Universal record-about-this modal. Slides up from the bottom of the
 * screen, records audio, uploads with optional context (goalId or
 * dimensionKey), fires `onRecordComplete` on 202/201, and closes.
 *
 * Existing "Record about this" buttons that used to route the user
 * home (losing the dimension / goal context they were looking at)
 * now open this sheet in-place. The existing RecordButton component
 * on /home stays as-is for the primary daily debrief flow — this
 * component is only for contextual recordings.
 */

type Context = {
  /** Category the parent component cares about. Consumed by the sheet
   *  only to label the header + decide which field name to send on the
   *  upload FormData. Unknown types fall through with no server-side
   *  context attached. */
  type: "goal" | "dimension" | "theme" | "entry-prompt" | "generic";
  /** Goal.id when type="goal", lowercase dimension key when
   *  type="dimension", theme label when type="theme". Undefined for
   *  generic recordings. */
  id?: string;
  /** Human-readable label rendered at the top of the sheet. */
  label: string;
  /** Optional subtitle (e.g. the dimension's reflection prompt text). */
  description?: string;
};

type Props = {
  context: Context;
  open: boolean;
  onClose: () => void;
  onRecordComplete: (entryId: string) => void;
};

const MAX_SECONDS = 120;

type Phase =
  | "idle"
  | "recording"
  | "uploading"
  | "processing"
  | "error";

export function RecordSheet({
  context,
  open,
  onClose,
  onRecordComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const { trackEntry } = usePendingEntries();
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // P1 silence guard — Web Audio peak-level tracking during recording.
  const peakRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  // Screen Wake Lock — keeps the screen from locking mid-recording on
  // mobile web (parity with the iOS keep-awake fix). Released on stop /
  // close; re-acquired on tab re-show (wake locks auto-release when the
  // tab is hidden). Feature-detected — recording still works without it.
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // unsupported or denied — non-fatal
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // Reset on close so re-opening for a different dimension starts clean.
  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setElapsed(0);
      setError(null);
      chunksRef.current = [];
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      releaseWakeLock();
    }
  }, [open, releaseWakeLock]);

  // Wake locks auto-release when the tab is hidden (e.g. the user
  // switches away and back). Re-acquire on return if still recording.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && phase === "recording") {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase, requestWakeLock]);

  const teardownAnalyser = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // P1: tap the stream with an AnalyserNode to track the peak input
      // level across the recording — used to block a silent upload onstop
      // (mirrors the mobile expo-av metering guard). Feature-detected;
      // if Web Audio is unavailable we skip the guard rather than block.
      peakRef.current = 0;
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;
        const buf = new Float32Array(analyser.fftSize);
        const tick = () => {
          const a = analyserRef.current;
          if (!a) return;
          a.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const db = rms > 0 ? 20 * Math.log10(rms) : -60;
          const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
          if (normalized > peakRef.current) peakRef.current = normalized;
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // Web Audio unsupported — skip the guard, don't block recording.
      }

      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        const mimeType = mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const duration = elapsedRef.current;
        // Release the mic before the upload — the user can see the
        // upload spinner and nothing is being captured anymore.
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        releaseWakeLock();
        const silent = isEffectivelySilentPeak(peakRef.current);
        teardownAnalyser();
        // P1: block silent uploads — same guard + copy as mobile.
        if (silent) {
          setError(NO_SOUND_CAPTURED_MESSAGE);
          setPhase("idle");
          return;
        }
        await upload(blob, duration, mimeType);
      };

      mr.start();
      setPhase("recording");
      void requestWakeLock();
      setElapsed(0);
      elapsedRef.current = 0;
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
        if (elapsedRef.current >= MAX_SECONDS) {
          stopRecording();
        }
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Microphone access denied — check your browser settings."
      );
      setPhase("error");
    }
  }, []);

  const elapsedRef = useRef(0);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      // ignore — onstop may fire async anyway
    }
  }, []);

  const upload = useCallback(
    async (blob: Blob, duration: number, mime: string) => {
      setPhase("uploading");
      const fd = new FormData();
      fd.append("audio", blob, `recording.${extFromMime(mime)}`);
      fd.append("durationSeconds", String(duration));

      // Route context to the server fields the /api/record endpoint
      // already understands: Entry.goalId for type="goal",
      // Entry.dimensionContext for type="dimension". Other types
      // (theme, entry-prompt, generic) upload without extra context
      // — still creates an entry, just not anchored.
      if (context.type === "goal" && context.id) {
        fd.append("goalId", context.id);
      } else if (context.type === "dimension" && context.id) {
        fd.append("dimensionContext", context.id);
      }

      try {
        const res = await fetch("/api/record", {
          method: "POST",
          body: fd,
        });

        if (res.status === 402) {
          window.location.href = "/upgrade?src=record_sheet_paywall";
          return;
        }
        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          const retry = Number(body?.retryAfter ?? 60);
          setError(
            `You're recording too fast — try again in ${Math.ceil(retry / 60)} minute${retry > 60 ? "s" : ""}.`
          );
          setPhase("error");
          return;
        }
        const body = (await res.json()) as { entryId?: string; error?: string };
        if (!res.ok) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        if (body.entryId) {
          // Close the sheet immediately — the server is still
          // processing (async path) but the parent component gets
          // the entry id and can show its own "processing..." state
          // or just refresh its list.
          // Phase 2/3: track app-wide so a toast fires on COMPLETE/FAILED
          // once the sheet has closed and the user has moved on.
          trackEntry(body.entryId);
          onRecordComplete(body.entryId);
          onClose();
          return;
        }
        throw new Error("Unexpected response shape");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
        setPhase("error");
      }
    },
    [context.type, context.id, onRecordComplete, onClose]
  );

  // Backdrop click — cancel only when idle or in an error state, so
  // we don't accidentally abandon an in-progress recording.
  const handleBackdrop = () => {
    if (phase === "recording" || phase === "uploading" || phase === "processing") {
      if (!confirm("Discard this recording?")) return;
      stopRecording();
    }
    onClose();
  };

  // Escape key mirrors backdrop click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleBackdrop();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/60 animate-fade-in"
      onClick={handleBackdrop}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[#1E1E2E] border border-zinc-200 dark:border-white/10 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle on mobile only */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <span className="block h-1 w-10 rounded-full bg-zinc-300 dark:bg-white/20" />
        </div>

        <div className="p-6 pt-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Recording about
              </p>
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {context.label}
              </p>
              {context.description && (
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 leading-snug">
                  {context.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleBackdrop}
              className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-700 dark:hover:text-zinc-300"
              aria-label="Close"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Recorder */}
          <div className="flex flex-col items-center py-6">
            <RecordButton
              phase={phase}
              onStart={startRecording}
              onStop={stopRecording}
            />
            <p className="mt-4 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {timeLabel}
            </p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
              {phase === "idle" && "Tap to record"}
              {phase === "recording" && `${MAX_SECONDS - elapsed}s remaining`}
              {phase === "uploading" && "Uploading…"}
              {phase === "processing" && "Processing…"}
              {phase === "error" && "Something went wrong"}
            </p>
            {error && (
              <p className="mt-3 text-sm text-red-500 text-center max-w-xs">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordButton({
  phase,
  onStart,
  onStop,
}: {
  phase: Phase;
  onStart: () => void;
  onStop: () => void;
}) {
  const isRecording = phase === "recording";
  const isBusy = phase === "uploading" || phase === "processing";

  return (
    <button
      type="button"
      onClick={isRecording ? onStop : onStart}
      disabled={isBusy}
      aria-label={isRecording ? "Stop recording" : "Start recording"}
      className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-all ${
        isRecording
          ? "bg-red-500 hover:bg-red-400 animate-pulse-slow"
          : "bg-orange-500 hover:bg-orange-400"
      } disabled:opacity-60 shadow-lg`}
      style={{
        boxShadow: isRecording
          ? "0 0 0 8px rgba(239, 68, 68, 0.15)"
          : "0 0 0 6px rgba(249, 115, 22, 0.18)",
      }}
    >
      {isBusy ? (
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : isRecording ? (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="white"
          aria-hidden="true"
        >
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )}
    </button>
  );
}

function pickMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function extFromMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}
