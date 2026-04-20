"use client";

// TODO: wire this to persist to UserOnboarding.referralSource. Should
// call a server action (pattern: onboarding/actions.ts) that upserts
// the row. Also fire a PostHog `onboarding_referral_source` event
// (not currently in IMPLEMENTATION_PLAN_PAYWALL §8's event list;
// propose adding) so we can measure acquisition channels.
//
// Keep the list short — 5-6 options max. Long lists trigger analysis
// paralysis on a tiny onboarding step. "Something else" text field
// captures the rest.
import { useState } from "react";

const OPTIONS = [
  { value: "twitter", label: "Twitter / X" },
  { value: "friend", label: "A friend" },
  { value: "google", label: "Google search" },
  { value: "podcast", label: "A podcast or newsletter" },
  { value: "youtube", label: "YouTube" },
  { value: "other", label: "Something else" },
] as const;

export function Step3Referral() {
  const [selected, setSelected] = useState<string | null>(null);
  const [other, setOther] = useState("");

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        How did you find Acuity?
      </h1>
      <p className="mt-3 text-base text-zinc-500">
        Just curious. No right answer.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSelected(opt.value)}
            className={`rounded-xl border p-3 text-sm font-medium transition ${
              selected === opt.value
                ? "border-violet-500 bg-violet-50 text-violet-900"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {selected === "other" && (
        <input
          type="text"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Tell us where"
          className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-violet-500 focus:outline-none"
        />
      )}
    </div>
  );
}
