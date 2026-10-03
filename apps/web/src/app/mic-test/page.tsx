"use client";

/**
 * /mic-test — can a phone record audio inside the Instagram / Facebook
 * in-app browsers? (2026-10-03, per Keenan: "do the test" before any
 * record-in-the-funnel step.) Hidden page, not linked anywhere, noindex.
 *
 * Tap → 5-second recording → plays it back → "I heard myself" / "I didn't".
 * Every stage is logged as funnel_mic_test with a JSON value (stage, which
 * app's browser, OS, error name, bytes, mime), so results are readable from
 * the DB without screenshots. Nothing is uploaded; the audio stays on the phone.
 */
import { useEffect, useRef, useState } from "react";

import { detectBrowserEnv } from "@/components/app-store-cta";
import { trackOnboardingEvent } from "@/lib/track-onboarding";

type Stage = "idle" | "asking" | "recording" | "playback" | "done" | "failed";

function env() {
  const e = detectBrowserEnv();
  const ua = e.ua;
  const os = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "desktop";
  return { app: e.label, os, ua };
}

export default function MicTestPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [detail, setDetail] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [left, setLeft] = useState(5);
  const info = useRef<{ app: string; os: string; ua: string }>({ app: "?", os: "?", ua: "" });
  const runId = useRef(`mic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`);

  const log = (stageName: string, extra: Record<string, unknown> = {}) => {
    trackOnboardingEvent("funnel_mic_test", {
      sessionToken: runId.current,
      browser: info.current.ua,
      value: JSON.stringify({ stage: stageName, app: info.current.app, os: info.current.os, ...extra }).slice(0, 480),
    });
  };

  useEffect(() => {
    info.current = env();
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    log("loaded", {
      getUserMedia: !!md?.getUserMedia,
      mediaRecorder: typeof window !== "undefined" && "MediaRecorder" in window,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setStage("asking");
    setDetail("");
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) {
      setStage("failed");
      setDetail("This browser has no microphone access at all (getUserMedia missing).");
      log("no_getusermedia");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await md.getUserMedia({ audio: true });
      log("permission_ok");
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      const msg = err instanceof Error ? err.message : String(err);
      setStage("failed");
      setDetail(`Microphone blocked: ${name}${msg ? ` (${msg})` : ""}`);
      log("permission_failed", { error: name, message: msg.slice(0, 120) });
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      stream.getTracks().forEach((t) => t.stop());
      setStage("failed");
      setDetail("Microphone works, but this browser can't record (MediaRecorder missing).");
      log("no_mediarecorder");
      return;
    }
    const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/aac"].find(
      (m) => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(m)
    );
    const chunks: Blob[] = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setStage("failed");
      setDetail(`Recorder failed to start: ${err instanceof Error ? err.name : String(err)}`);
      log("recorder_failed", { error: err instanceof Error ? err.name : String(err) });
      return;
    }
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
      log("recorded", { bytes: blob.size, mime: blob.type });
      if (!blob.size) {
        setStage("failed");
        setDetail("Recording finished but captured no audio (0 bytes).");
        return;
      }
      setAudioUrl(URL.createObjectURL(blob));
      setStage("playback");
    };
    rec.start(250);
    setStage("recording");
    setLeft(5);
    let s = 5;
    const t = setInterval(() => {
      s -= 1;
      setLeft(s);
      if (s <= 0) {
        clearInterval(t);
        if (rec.state !== "inactive") rec.stop();
      }
    }, 1000);
  };

  const verdict = (heard: boolean) => {
    log(heard ? "heard_playback" : "silent_playback");
    setStage("done");
    setDetail(heard ? "Recording works in this browser." : "Recorded, but playback was silent.");
  };

  const i = info.current;
  return (
    <main className="mx-auto flex min-h-[100svh] max-w-md flex-col justify-center gap-5 px-6 py-10 text-center">
      <h1 className="text-[24px] font-bold">Microphone test</h1>
      <p className="text-[14px] text-acuity-text-sec">
        Testing: <strong>{i.app}</strong> browser on <strong>{i.os}</strong>
      </p>

      {stage === "idle" && (
        <button onClick={start} className="rounded-full bg-acuity-primary py-4 text-[17px] font-semibold text-white">
          Start 5-second test
        </button>
      )}
      {stage === "asking" && <p className="text-[16px]">Allow the microphone if your phone asks…</p>}
      {stage === "recording" && (
        <p className="text-[18px] font-semibold text-acuity-primary">Recording… say anything ({left})</p>
      )}
      {stage === "playback" && audioUrl && (
        <div className="flex flex-col gap-3">
          <p className="text-[16px]">Play it back. Can you hear yourself?</p>
          <audio src={audioUrl} controls className="w-full" />
          <div className="flex gap-3">
            <button onClick={() => verdict(true)} className="flex-1 rounded-full bg-acuity-primary py-3 font-semibold text-white">
              Yes, I heard it
            </button>
            <button onClick={() => verdict(false)} className="flex-1 rounded-full border border-acuity-line-strong py-3 font-semibold">
              No sound
            </button>
          </div>
        </div>
      )}
      {(stage === "done" || stage === "failed") && (
        <div className={`rounded-2xl p-4 text-[16px] font-semibold ${stage === "done" && detail.startsWith("Recording works") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {stage === "done" && detail.startsWith("Recording works") ? "✅ " : "❌ "}
          {detail}
        </div>
      )}
      {(stage === "done" || stage === "failed") && (
        <button onClick={() => { setStage("idle"); setAudioUrl(null); }} className="text-[14px] underline">
          Try again
        </button>
      )}
      <p className="text-[11px] text-acuity-text-ter break-all">{i.ua}</p>
    </main>
  );
}
