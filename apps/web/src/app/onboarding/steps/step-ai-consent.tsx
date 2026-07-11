"use client";

import { useEffect, useRef, useState } from "react";

import { ART9_CONSENT_TEXT, ART9_WORDING_VERSION } from "@/lib/consent";

import { useOnboarding } from "../onboarding-context";

/**
 * AI processing + Article 9 explicit consent — web parity with iOS
 * (apps/mobile/components/onboarding/step-5-ai-consent.tsx).
 *
 * Why this exists: voice entries may contain special-category data
 * (health, beliefs, sexuality). UK/EU GDPR Art. 9(2)(a) requires
 * SEPARATE, EXPLICIT, affirmative consent before processing it — not
 * consent inferred from the act of recording. Previously the web app
 * only captured this at /upgrade checkout, so a web TRIAL user could
 * record entries (processed by OpenAI/Anthropic) before ever consenting.
 * This step closes that gap.
 *
 * The unticked checkbox is the affirmative act; ticking it appends an
 * append-only ConsentRecord (granted=true, platform="web", wording
 * art9-v1) we can later evidence. Continue is gated on the tick, and the
 * shell hides "Skip for now" on this step (AI_CONSENT_STEP), so a user
 * cannot reach the recorder without an explicit grant.
 *
 * Consent lives in the ConsentRecord ledger (the legal source of truth),
 * not on UserOnboarding — so setCapturedData(null): nothing for the
 * shell's /api/onboarding/update call to persist.
 */
export function StepAiConsent() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  const [accepted, setAccepted] = useState(false);
  // Write the ConsentRecord exactly once per grant. Fail-soft: a network
  // error must not trap the user — it resets the guard so a later tick
  // (or the next consent touchpoint) can retry.
  const recordedRef = useRef(false);

  useEffect(() => {
    setCanContinue(accepted);
    setCapturedData(null);
    if (accepted && !recordedRef.current) {
      recordedRef.current = true;
      void fetch("/api/consent/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consentType: "special_category_processing",
          granted: true,
          consentText: ART9_CONSENT_TEXT,
          wordingVersion: ART9_WORDING_VERSION,
          platform: "web",
        }),
      })
        .then((r) => {
          if (!r.ok) recordedRef.current = false;
        })
        .catch(() => {
          recordedRef.current = false;
        });
    }
  }, [accepted, setCanContinue, setCapturedData]);

  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        Before your first entry
      </h1>

      <p className="mt-5 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Ripple sends your voice recordings to{" "}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          OpenAI (Whisper)
        </span>{" "}
        for transcription and{" "}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          Anthropic (Claude)
        </span>{" "}
        for themes, tasks, and your weekly narrative. Recordings are
        encrypted in transit, never sold, and never used to train AI models.
      </p>

      <p className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Because what you say can include health, beliefs, or other sensitive
        details, the law treats that as a special category that needs your
        explicit consent. You can withdraw it anytime by deleting entries or
        your account.
      </p>

      <button
        type="button"
        role="checkbox"
        aria-checked={accepted}
        onClick={() => setAccepted((v) => !v)}
        className="mt-8 flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
      >
        <span
          aria-hidden
          className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md border transition ${
            accepted
              ? "border-acuity-primary bg-acuity-primary text-white"
              : "border-zinc-300 dark:border-zinc-600"
          }`}
        >
          {accepted && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden
            >
              <path
                d="M2.5 6.5L5 9L9.5 3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        <span className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
          {ART9_CONSENT_TEXT}
        </span>
      </button>
    </div>
  );
}
