"use client";

// TODO: wire to persist UserOnboarding.expectedUsageFrequency.
// Informs:
//   - Default reminder time + days (User.reminderTime already exists;
//     default cadence drives which days of the week we send pushes
//     when push notifications land in v2).
//   - Post-trial email copy tone: someone who said "DAILY" and then
//     used the product 2x per week gets different re-engagement copy
//     than someone who said "WEEKLY" and hit that target.
//   - The Day 14 Life Audit prompt can use expected-vs-actual cadence
//     as a soft signal ("you said you'd record daily, and you did
//     11 out of 14 — that's a shape worth noting").
import { useState } from "react";

type Cadence = "DAILY" | "WEEKDAYS" | "WEEKLY" | "UNSURE";

const OPTIONS: { value: Cadence; label: string; sub: string }[] = [
  { value: "DAILY", label: "Every night", sub: "Part of the wind-down." },
  { value: "WEEKDAYS", label: "Weeknights only", sub: "Work weeks, not weekends." },
  { value: "WEEKLY", label: "A few times a week", sub: "When I've got something to unload." },
  { value: "UNSURE", label: "Not sure yet", sub: "We'll see." },
];

export function Step7ExpectedCadence() {
  const [selected, setSelected] = useState<Cadence | null>(null);

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        How often do you think you&rsquo;ll record?
      </h1>
      <p className="mt-3 text-base text-zinc-500">
        There&rsquo;s no wrong answer. This shapes the reminders we send.
      </p>

      <div className="mt-8 space-y-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSelected(opt.value)}
            className={`w-full rounded-xl border p-4 text-left transition ${
              selected === opt.value
                ? "border-violet-500 bg-violet-50"
                : "border-zinc-200 bg-white hover:border-zinc-300"
            }`}
          >
            <p className="text-sm font-semibold text-zinc-900">{opt.label}</p>
            <p className="mt-1 text-xs text-zinc-500">{opt.sub}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
