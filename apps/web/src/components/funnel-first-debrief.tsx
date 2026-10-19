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
 *
 * Pre-filled (2026-10-18, audit 2026-10-10 R-2, per Keenan): week one was
 * 2 submitted / 11 skipped from a blank box, right after the funnel had
 * asked what's on her plate and what's on her list. The step now opens
 * with her own answer ("You said kids and a demanding job are on your
 * plate.") and three editable lines pre-filled with the week-list items
 * she tapped; text mode submits them as one sentence through the same
 * route. Skip stays, but as a small "Not now" under everything.
 *
 * Consent (2026-10-11): the debrief is transcribed and analysed by AI and
 * can contain special-category data, so the Art. 9 checkbox (same wording
 * and version as the app, lib/consent.ts) must be ticked and recorded in
 * the ConsentRecord ledger before anything is recorded or saved. If the
 * consent write fails, nothing is sent.
 */
import { Keyboard, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ART9_CONSENT_TEXT, ART9_WORDING_VERSION } from "@/lib/consent";
import {
  canSubmitLines,
  composeDebriefText,
  FIRST_DEBRIEF_MAX_CHARS,
  initialLines,
  isPrefilled,
  PREFILL_LINE_LABELS,
  saidLine,
  type FirstDebriefPrefill,
} from "@/lib/first-debrief-prefill";

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
  prefill,
  track,
  onDone,
}: {
  brand: "ripple" | "bwk";
  firstName?: string | null;
  /** Her funnel answers (lib/first-debrief-prefill.ts). Optional: a direct
   *  visit with no answers gets the blank version. */
  prefill?: FirstDebriefPrefill | null;
  track: (event: string, value?: string) => void;
  onDone: (outcome: FirstDebriefOutcome) => void;
}) {
  const [mode, setMode] = useState<"idle" | "recording" | "sending" | "typing" | "saved">("idle");
  const [savedHow, setSavedHow] = useState<FirstDebriefOutcome>("voice");
  const [elapsed, setElapsed] = useState(0);
  // Three editable lines (Work / Home / Me), pre-filled from her week-list
  // picks when the funnel has them, plus an optional free-text tail.
  const [lines, setLines] = useState<string[]>(() => initialLines(prefill));
  const [text, setText] = useState("");
  const [showMore, setShowMore] = useState(false);
  const prefilled = isPrefilled(prefill);
  const prefilledTag = `prefilled:${prefilled ? "true" : "false"}`;
  const said = saidLine(prefill, brand);
  const [error, setError] = useState<string | null>(null);
  const [savingText, setSavingText] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const [consent, setConsent] = useState(false);
  // The in-flight (or finished) consent write. Started when the box is
  // ticked, so it's normally done by the time they tap record or save.
  const consentRef = useRef<Promise<boolean> | null>(null);
  const ask = "Name the three things you'd most like off your mind.";
  const linePlaceholders =
    brand === "bwk"
      ? ["The call I keep putting off", "The thing at home that's waiting", "Gym this week"]
      : ["The deadline that's looming", "The permission slip, the dentist…", "A walk, an hour that's mine"];
  const morePlaceholder = "Anything else on your mind? Say it however it comes out.";

  useEffect(() => {
    const fb = inFacebookBrowser();
    if (fb) setMode("typing");
    track("funnel_first_debrief_viewed", `${fb ? "facebook_typing" : "record"}:${prefilledTag}`);
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
    track("funnel_first_debrief_submitted", `${how}:${prefilledTag}`);
  };

  const recordConsent = (): Promise<boolean> =>
    fetch("/api/consent/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consentType: "special_category_processing",
        granted: true,
        consentText: ART9_CONSENT_TEXT,
        wordingVersion: ART9_WORDING_VERSION,
        platform: "web",
      }),
    })
      .then((r) => r.ok)
      .catch(() => false);

  const toggleConsent = () => {
    if (consent) return; // once recorded, it stays ticked here
    setError(null);
    setConsent(true);
    track("funnel_first_debrief_consent_checked");
    consentRef.current = recordConsent();
  };

  /** True once the grant is in the ledger. On failure, unticks and says so. */
  const ensureConsent = async (): Promise<boolean> => {
    if (!consent || !consentRef.current) return false;
    let ok = await consentRef.current;
    if (!ok) {
      consentRef.current = recordConsent(); // one retry
      ok = await consentRef.current;
    }
    if (!ok) {
      consentRef.current = null;
      setConsent(false);
      track("funnel_first_debrief_failed", "consent");
      setError("We couldn't save your consent. Check your connection and tick the box again.");
    }
    return ok;
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
    if (!(await ensureConsent())) return;
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
    if (!(await ensureConsent())) {
      setSavingText(false);
      return;
    }
    try {
      const res = await fetch("/api/onboarding/first-debrief-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: composeDebriefText(lines, text) }),
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
    track("funnel_first_debrief_skipped", `${mode}:${prefilledTag}`);
    onDone("skipped");
  };

  if (mode === "saved") {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-10 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-acuity-primary/15 text-[30px]">&#10003;</div>
        <h2 className="text-[26px] font-bold leading-tight tracking-tight">Saved to your Ripple</h2>
        <p className="mt-3 text-[16px] leading-relaxed text-acuity-text-sec">
          Ripple is pulling out your tasks and habits now. Your first tasks will be waiting when you open the app.
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
      {said && <p className="mt-3 text-center text-[15px] leading-snug text-acuity-text">{said}</p>}
      <p className={`${said ? "mt-1" : "mt-2"} text-center text-[15px] leading-snug text-acuity-text-sec`}>
        {ask}{" "}
        {mode === "typing" ? "Change the lines to whatever fits." : "Say them however they come out."} Ripple sorts them into your list.
      </p>

      {(mode === "idle" || mode === "typing") && (
        <div className="mt-6 rounded-2xl border border-acuity-line-strong bg-acuity-bg-inset p-4">
          <label className="flex cursor-pointer gap-3 text-left">
            <input
              type="checkbox"
              checked={consent}
              onChange={toggleConsent}
              disabled={consent}
              className="mt-0.5 h-5 w-5 shrink-0 accent-acuity-primary"
            />
            <span className="text-[13px] leading-snug text-acuity-text-sec">{ART9_CONSENT_TEXT}</span>
          </label>
          <details className="mt-3 text-[13px] text-acuity-text-sec">
            <summary className="cursor-pointer font-semibold text-acuity-primary">What we collect, and what we don&rsquo;t</summary>
            <p className="mt-2 leading-snug">
              We collect your recording or text and what Ripple pulls from it: tasks, themes and mood. We don&rsquo;t sell
              your data or let AI providers train their models on it, and it&rsquo;s encrypted in transit. You can delete
              any entry, or your whole account, at any time.
            </p>
          </details>
        </div>
      )}

      {mode !== "typing" ? (
        <div className="mt-7 text-center">
          {lines.some((l) => l.trim()) && mode !== "sending" && (
            <ul className="mx-auto mb-6 flex max-w-xs flex-wrap justify-center gap-2" aria-label="From your list this week">
              {lines.filter((l) => l.trim()).map((l) => (
                <li key={l} className="rounded-full border border-acuity-line-strong bg-acuity-bg-inset px-3 py-1 text-[13px] text-acuity-text">
                  {l}
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={mode === "recording" ? stop : start}
            disabled={mode === "sending" || (mode === "idle" && !consent)}
            aria-label={mode === "recording" ? "Stop recording" : "Start recording"}
            className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-acuity-primary text-white shadow-lg transition active:scale-95 disabled:opacity-60 ${mode === "recording" ? "animate-pulse" : ""}`}
          >
            {mode === "recording" ? <span className="h-8 w-8 rounded-md bg-white" /> : <Mic className="h-11 w-11" />}
          </button>
          <p className="mt-5 text-[15px] font-semibold">
            {mode === "idle" && (consent ? "Tap and start talking" : "Tick the box above to start")}
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
          <div className="space-y-3">
            {lines.map((value, i) => (
              <label key={PREFILL_LINE_LABELS[i]} className="block">
                <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-acuity-text-sec">
                  {PREFILL_LINE_LABELS[i]}
                </span>
                <input
                  type="text"
                  value={value}
                  onChange={(e) =>
                    setLines((prev) => prev.map((l, j) => (j === i ? e.target.value.slice(0, 200) : l)))
                  }
                  placeholder={linePlaceholders[i]}
                  autoComplete="off"
                  className="w-full rounded-2xl border border-acuity-line-strong bg-acuity-bg-inset px-4 py-3 text-[16px] leading-relaxed text-acuity-text outline-none placeholder:text-acuity-text-ter focus:border-acuity-primary"
                />
              </label>
            ))}
          </div>
          {showMore ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, FIRST_DEBRIEF_MAX_CHARS))}
              rows={4}
              placeholder={morePlaceholder}
              className="mt-3 w-full resize-none rounded-2xl border border-acuity-line-strong bg-acuity-bg-inset p-4 text-[16px] leading-relaxed text-acuity-text outline-none placeholder:text-acuity-text-ter focus:border-acuity-primary"
            />
          ) : (
            <button onClick={() => setShowMore(true)} className="mt-3 text-[14px] font-semibold text-acuity-primary">
              + Add anything else
            </button>
          )}
          <button
            onClick={submitText}
            disabled={!consent || !canSubmitLines(lines, text) || savingText}
            className="mt-4 w-full rounded-full bg-acuity-primary py-4 text-[17px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {savingText ? "Saving…" : "Save my first debrief"}
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-center text-[14px] text-acuity-text-sec">{error}</p>}
      {/* Skip stays (never block a buyer), but as a quiet text link under
          everything rather than a second, equal-weight button. */}
      <button onClick={skip} className="mt-12 block w-full text-center text-[13px] text-acuity-text-ter underline-offset-4 hover:underline">
        Not now
      </button>
    </div>
  );
}
