"use client";

import { useEffect, useState } from "react";

import { useOnboarding } from "../onboarding-context";

/**
 * Step 3 — Microphone permission.
 *
 * Exists so the OS-level permission prompt doesn't appear as the
 * user's FIRST interaction with the product. That framing is the
 * difference between "grant rate" and "what's this thing asking me?"
 * refusals.
 *
 * State machine:
 *   idle      — explainer + "Enable microphone" button
 *   granted   — success confirmation, canContinue true
 *   denied    — friendly recovery copy + Try again + continue option
 *   pending   — request in flight (usually < 1s, but iOS Safari can hang)
 *
 * Data captured: { microphoneGranted: boolean }. Persisted to
 * UserOnboarding on shell Continue.
 *
 * Skip-this-step is also available from the shell footer (step 3 is
 * in the default skippableSteps). We don't double up on an inline
 * "continue without" button in the denied branch — it would duplicate
 * the footer skip and confuse the nav.
 */
type State = "idle" | "pending" | "granted" | "denied";

export function Step3MicrophonePermission() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  const [state, setState] = useState<State>("idle");

  // Continue is disabled until the user interacts — either grants, denies,
  // or uses the shell's Skip-this-step button. This is intentional: the
  // whole point of step 3 is to make the grant/decline decision conscious.
  useEffect(() => {
    if (state === "idle" || state === "pending") {
      setCanContinue(false);
    } else {
      setCanContinue(true);
    }
  }, [state, setCanContinue]);

  async function requestMic() {
    setState("pending");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release the track immediately — we only needed the permission,
      // not an actual recording. Leaving it live would show an
      // indefinite red "recording" indicator in most browsers.
      stream.getTracks().forEach((t) => t.stop());
      setState("granted");
      setCapturedData({ microphoneGranted: true });
    } catch {
      setState("denied");
      setCapturedData({ microphoneGranted: false });
    }
  }

  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        Acuity needs your microphone.
      </h1>

      <p className="mt-5 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Recording happens in your browser. Audio is uploaded encrypted,
        stored privately, and deleted on request. Only you and the
        transcription service ever hear it.
      </p>

      <p className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Your browser will ask once, and remember your answer.
      </p>

      <div className="mt-10">
        {state === "idle" && (
          <button
            onClick={requestMic}
            className="rounded-full bg-[#7C5CFC] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6B4FE0] hover:shadow-md"
          >
            Enable microphone
          </button>
        )}

        {state === "pending" && (
          <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
            <Spinner />
            <span>Waiting for your browser&hellip;</span>
          </div>
        )}

        {state === "granted" && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckIcon />
            <div>
              <p className="text-sm font-semibold text-emerald-900">
                Microphone ready.
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                You&rsquo;re set. Hit Continue.
              </p>
            </div>
          </div>
        )}

        {state === "denied" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-3">
              <InfoIcon />
              <p className="text-sm font-semibold text-amber-900">
                Your browser said no.
              </p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-amber-900">
              That&rsquo;s fine — you can grant it later from the record
              button. If you meant to say yes, find the microphone icon
              in your browser&rsquo;s address bar and flip it to Allow,
              then try again.
            </p>
            <button
              onClick={requestMic}
              className="mt-4 rounded-full border border-amber-300 bg-white dark:bg-[#1E1E2E] px-5 py-2 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-50"
            >
              Try again
            </button>
            <p className="mt-4 text-xs text-amber-800">
              <strong>On iOS Safari?</strong> The permission lives at{" "}
              <em>Settings → Safari → Microphone</em>. Set getacuity.io
              to Allow, then reload.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#10B981" />
      <path
        d="M7 12l3.5 3.5L17 9"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#F59E0B" />
      <path
        d="M12 7v6m0 3v.5"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-[#7C5CFC]"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="30 60"
        opacity="0.6"
      />
    </svg>
  );
}
