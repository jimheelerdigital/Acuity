"use client";

import { useState } from "react";

import { wrappedShareText, type WrappedSummary } from "@acuity/shared";

/**
 * Share block for the web Wrapped page (2026-10-27). Shows the exact text
 * that gets copied, built by the shared wrappedShareText: counts, top
 * themes and the mood trend only. Never transcript content or the win, and
 * a person's first name only when the user ticks the box (off by default),
 * the same rule as the app's share sheet.
 */
export function WrappedShareBlock({ wrapped }: { wrapped: WrappedSummary }) {
  const [includePerson, setIncludePerson] = useState(false);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const text = wrappedShareText(wrapped, { includePerson });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <div>
      <pre className="whitespace-pre-wrap rounded-acuity-lg bg-acuity-bg-inset p-4 font-sans text-sm leading-relaxed text-acuity-text-sec">
        {text}
      </pre>
      {wrapped.person ? (
        <label className="mt-3 flex items-center gap-2 text-sm text-acuity-text">
          <input
            type="checkbox"
            checked={includePerson}
            onChange={(e) => {
              setIncludePerson(e.target.checked);
              setCopied("idle");
            }}
          />
          Include {wrapped.person.firstName}
        </label>
      ) : null}
      <p className="mt-2 text-xs text-acuity-text-ter">
        Only what&rsquo;s shown above is shared. Nothing you said in your debriefs.
      </p>
      <button
        type="button"
        onClick={copy}
        className="mt-4 rounded-acuity-pill bg-acuity-grad-primary px-5 py-2.5 text-sm font-semibold text-white"
      >
        {copied === "done" ? "Copied" : "Copy to share"}
      </button>
      {copied === "failed" ? (
        <p className="mt-2 text-xs text-acuity-bad">Couldn&rsquo;t copy. Select the text above instead.</p>
      ) : null}
    </div>
  );
}
