"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Manual State-of-Me trigger. Rate limit (1/30d) is enforced server-
 * side; this button also disables when the parent knows we're in
 * cooldown. Surfaces 429 message inline.
 */
export function StateOfMeGenerateButton({
  canGenerate,
  cooldownUntil,
}: {
  canGenerate: boolean;
  cooldownUntil: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/state-of-me", { method: "POST" });
      if (res.ok || res.status === 202) {
        const body = await res.json();
        if (body.report?.id) {
          router.push(`/insights/state-of-me/${body.report.id}`);
          return;
        }
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? body.error ?? `HTTP ${res.status}`);
    } finally {
      setLoading(false);
    }
  };

  if (!canGenerate) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Next manual generation available{" "}
        {cooldownUntil
          ? new Date(cooldownUntil).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "soon"}
        .
      </p>
    );
  }

  return (
    <div>
      <button
        onClick={submit}
        disabled={loading}
        className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40"
      >
        {loading ? "Queuing…" : "Generate State of Me"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
