"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type RecordState = "idle" | "recording" | "processing" | "done" | "error";

export function RecordButton() {
  const router = useRouter();
  const [state, setState] = useState<RecordState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = async () => {
    setError(null);
    setElapsed(0);
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: bestMimeType() });
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);

      const blob = new Blob(chunksRef.current, { type: mr.mimeType });
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);

      setState("processing");

      const fd = new FormData();
      fd.append("audio", blob, `recording.${extFromMime(mr.mimeType)}`);
      fd.append("durationSeconds", String(duration));

      try {
        const res = await fetch("/api/record", { method: "POST", body: fd });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        setState("done");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setState("error");
      }
    };

    mr.start(1000); // collect every second
    startTimeRef.current = Date.now();
    setState("recording");

    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const handleClick = async () => {
    if (state === "recording") {
      stopRecording();
    } else if (state === "idle" || state === "done" || state === "error") {
      await startRecording();
    }
  };

  const label = {
    idle: "Start recording",
    recording: `Stop  ${formatTime(elapsed)}`,
    processing: "Processing…",
    done: "Record again",
    error: "Try again",
  }[state];

  const isDisabled = state === "processing";

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className={`flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-semibold transition ${
          state === "recording"
            ? "bg-red-600 hover:bg-red-500 text-white recording-indicator"
            : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90"
        } disabled:opacity-50`}
      >
        {state === "recording" ? (
          <span className="h-2 w-2 rounded-full bg-white" />
        ) : (
          <MicIcon />
        )}
        {label}
      </button>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function bestMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function extFromMime(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
