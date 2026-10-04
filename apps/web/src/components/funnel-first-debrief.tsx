"use client";

/**
 * First debrief right after payment (2026-10-04, per Keenan: "current
 * funnels, then paywall, then first recording, (analysis happens in the
 * BACKGROUND), THEN we push people to download the app to get their results
 * and start using"; weekly audit 2026-10-03 #1).
 *
 * NO WAITING. The 2026-09-28 version (6dd5c57) polled for the result and made
 * buyers wait 30-40s, so it was pulled (8a44e85). Here the entry is saved and
 * queued, we say "Saved, your tasks will be waiting in the app", and the
 * funnel moves on to the app download. Processing finishes in the background.
 *
 * Where it records (tested on real phones via /mic-test, 2026-10-03):
 *   - Instagram in-app browser (iOS): mic works → record, or type.
 *   - Facebook / Messenger in-app browser: mic BLOCKED (NotAllowedError, no
 *     prompt) → starts in typing mode, no record button.
 *   - Anything else whose mic fails → falls back to typing on the spot.
 * Never adds in-app-browser escape links (Google Safe Browsing, 2026-10-03).
 *
 * Saving: voice → direct upload + POST /api/record; typed →
 * POST /api/onboarding/first-debrief-text. Both run the normal pipeline.
 */
import { Keyboard, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const DONE_KEY = "acuity_first_debrief_done";

export type FirstDebriefOutcome = "voice" | "text" | "skipped";
const MAX_S = 120;
const MIN_S = 5;

/** null until the step is finished; then how it ended. */
export function firstDebriefOutcome(): FirstDebriefOutcome | null {
  try {
    const v = sessionStorage.getItem(DONE_KEY);
    return v === "voice" || v === "text" || v === "skipped" ? v : null;
  } catch {
    return null;
  }
}

function markDone(how: FirstDebriefOutcome) {
  try {
    sessionStorage.setItem(DONE_KEY, how);
  } catch {}
}

function inFacebookBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /FBAN|FBAV|FB_IAB/i.test(navigator.userAgent);
}


export function FunnelFirstDebrief({
  brand,
  firstName,
  track,
  onDone,
}: {
  brand: "ripple" | "bwk";
  firstName?: string | null;
  track: (event: string, value?: string) => void;
  onDone: (outcome: FirstDebriefOutcome) => void;
}) {
  const [mode, setMode] = useState<"idle" | "recording" | "sending" | "typing" | "saved">("idle");
  const [savedHow, setSavedHow] = useState<FirstDebriefOutcome>("voice");
  const [elapsed, setElapsed] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingText, setSavingText] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const prompt = brand === "bwk" ? "What's on your plate this week?" : "What's on your mind this week?";
  const placeholder =
    brand === "bwk"
      ? "Gym Monday and Thursday, I keep putting off the car insurance call, and I want to put my phone down earlier…"
      : "The permission slip is due Friday, I still haven't called the dentist, and I want to walk three times this week…";

  useEffect(() => {
    const fb = inFacebookBrowser();
    if (fb) setMode("typing");
    track("funnel_first_debrief_viewed", fb ? "facebook_typing" : "record");
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saved = (how: FirstDebriefOutcome) => {
    markDone(how);
    setSavedHow(how);
    setMode("saved");
    track("funnel_first_debrief_submitted", how);
  };

  const submitVoice = async (blob: Blob, seconds: number) => {
    setMode("sending");
    try {
      const { uploadAudioDirect } = await import("@/lib/direct-upload.client");
      const up = await uploadAudioDirect(blob, "entry");
      const res = await fetch("/api/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: up.storagePath, mimeType: up.mimeType, durationSeconds: String(seconds) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.entryId) throw new Error(body.error ?? `HTTP ${res.status}`);
      saved("voice");
    } catch (e) {
      track("funnel_first_debrief_failed", `voice:${String(e).slice(0, 60)}`);
      setError("That didn't save. Try again, or type it instead.");
      setMode("idle");
    }
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { bestMimeType } = await import("@/components/debrief-shared");
      const mime = bestMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) window.clearInterval(timerRef.current);
        const secs = Math.round((Date.now() - startRef.current) / 1000);
        void submitVoice(new Blob(chunksRef.current, { type: rec.mimeType || mime || "audio/webm" }), secs);
      };
      rec.start(1000);
      recRef.current = rec;
      startRef.current = Date.now();
      setElapsed(0);
      setMode("recording");
      track("funnel_first_debrief_record_started");
      timerRef.current = window.setInterval(() => {
        const secs = Math.round((Date.now() - startRef.current) / 1000);
        setElapsed(secs);
        if (secs >= MAX_S) recRef.current?.stop();
      }, 250);
    } catch (e) {
      track("funnel_first_debrief_mic_denied", e instanceof Error ? e.name : "error");
      setError("Your browser won't share the mic here, so type it instead.");
      setMode("typing");
    }
  };

  const stop = () => {
    if (elapsed < MIN_S) return;
    recRef.current?.stop();
  };

  const submitText = async () => {
    setSavingText(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/first-debrief-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // Already has an entry (e.g. a reload after saving): nothing to add.
        markDone("text");
        onDone("text");
        return;
      }
      if (!res.ok || !body.entryId) throw new Error(body.error ?? `HTTP ${res.status}`);
      saved("text");
    } catch (e) {
      track("funnel_first_debrief_failed", `text:${String(e).slice(0, 60)}`);
      setError(e instanceof Error && e.message.length < 80 ? e.message : "That didn't save. Try again.");
    } finally {
      setSavingText(false);
    }
  };

  const skip = () => {
    markDone("skipped");
    track("funnel_first_debrief_skipped", mode);
    onDone("skipped");
  };

  if (mode === "saved") {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-10 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-acuity-primary/15 text-[30px]">&#10003;</div>
        <h2 className="text-[26px] font-bold leading-tight tracking-tight">Saved to your Ripple</h2>
        <p className="mt-3 text-[16px] leading-relaxed text-acuity-text-sec">
          Ripple is pulling out your tasks and habits now. They&rsquo;ll be waiting for you in the app.
        </p>
        <button
          onClick={() => onDone(savedHow)}
          className="mt-8 w-full rounded-full bg-acuity-primary py-4 text-[17px] font-semibold text-white transition active:scale-[0.98]"
        >
          See my results in the app
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-6 py-10">
      <p className="text-center text-[13px] font-semibold tracking-wide text-acuity-primary">
        {firstName ? `You're in, ${firstName}` : "You're in"}
      </p>
      <h2 className="mt-2 text-center text-[26px] font-bold leading-tight tracking-tight">Do your first debrief</h2>
      <p className="mt-2 text-center text-[15px] leading-snug text-acuity-text-sec">
        {prompt} {mode === "typing" ? "Write it however it comes out." : "Say it however it comes out."} Ripple sorts it into your list.
      </p>

      {mode !== "typing" ? (
        <div className="mt-7 text-center">
          <button
            onClick={mode === "recording" ? stop : start}
            disabled={mode === "sending"}
            aria-label={mode === "recording" ? "Stop recording" : "Start recording"}
            className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-acuity-primary text-white shadow-lg transition active:scale-95 disabled:opacity-60 ${mode === "recording" ? "animate-pulse" : ""}`}
          >
            {mode === "recording" ? <span className="h-8 w-8 rounded-md bg-white" /> : <Mic className="h-11 w-11" />}
          </button>
          <p className="mt-5 text-[15px] font-semibold">
            {mode === "idle" && "Tap and start talking"}
            {mode === "recording" && (elapsed < MIN_S ? "Keep going…" : "Tap to finish")}
            {mode === "sending" && "Saving to your Ripple…"}
          </p>
          {mode === "idle" && (
            <button onClick={() => setMode("typing")} className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-acuity-primary">
              <Keyboard className="h-4 w-4" /> Rather type it?
            </button>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            rows={6}
            placeholder={placeholder}
            className="w-full resize-none rounded-2xl border border-acuity-line-strong bg-acuity-bg-inset p-4 text-[16px] leading-relaxed text-acuity-text outline-none placeholder:text-acuity-text-ter focus:border-acuity-primary"
          />
          <button
            onClick={submitText}
            disabled={text.trim().length < 10 || savingText}
            className="mt-4 w-full rounded-full bg-acuity-primary py-4 text-[17px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {savingText ? "Saving…" : "Save my first debrief"}
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-center text-[14px] text-acuity-text-sec">{error}</p>}
      <button onClick={skip} className="mt-6 block w-full text-center text-[14px] text-acuity-text-sec underline-offset-4 hover:underline">
        Skip, I&rsquo;ll do it in the app
      </button>
    </div>
  );
}
