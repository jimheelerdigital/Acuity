"use client";

// TODO: wire the real navigator.mediaDevices.getUserMedia({ audio: true })
// prompt. On successful grant, call a server action to set
// UserOnboarding.microphoneGranted = true. On denial, show fallback
// copy pointing to browser settings. DO NOT block Continue — users
// can grant permission later from the record screen.
//
// This screen exists so the system permission prompt doesn't appear
// as the user's first interaction with the app (which is a common
// source of "wait, what's this asking me?" rejections). The walkthrough
// frames the request before the OS surfaces it.
import { useState } from "react";

export function Step4MicrophonePermission() {
  const [granted, setGranted] = useState<boolean | null>(null);

  async function requestMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setGranted(true);
      // TODO: server action to persist microphoneGranted: true
    } catch {
      setGranted(false);
    }
  }

  return (
    <div className="animate-fade-in text-center">
      <div className="mb-6 text-5xl">🎙️</div>
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        Your browser will ask for your mic.
      </h1>
      <p className="mt-4 text-base leading-relaxed text-zinc-500">
        Everything happens locally until you stop recording. Audio is uploaded
        encrypted and deleted on your request.
      </p>

      <button
        onClick={requestMic}
        className="mt-8 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
      >
        {granted === true
          ? "✓ Microphone access granted"
          : granted === false
            ? "Request again"
            : "Grant microphone access"}
      </button>
      {granted === false && (
        <p className="mt-4 text-sm text-zinc-500">
          No worries — you can grant access later when you tap the record
          button.
        </p>
      )}
    </div>
  );
}
