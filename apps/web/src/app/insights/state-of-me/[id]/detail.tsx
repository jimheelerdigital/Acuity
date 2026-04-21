"use client";

import { useCallback, useEffect, useState } from "react";

import type { StateOfMeContent } from "@acuity/shared";

import { StateOfMeReader } from "@/components/state-of-me-reader";
import { StateOfMeShareButton } from "./share-button";

/**
 * Detail view client wrapper. If the row is still QUEUED/GENERATING
 * we poll /api/state-of-me every 6 seconds until the server flips
 * COMPLETE or FAILED (capped at 5 min).
 */

type Props = {
  reportId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  degraded: boolean;
  errorMessage: string | null;
  content: StateOfMeContent | Record<string, never>;
  publicShareId: string | null;
  publicShareExpiresAt: string | null;
};

export function StateOfMeDetail(props: Props) {
  const [state, setState] = useState<Props>(props);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/state-of-me");
      if (!res.ok) return;
      const body = await res.json();
      const row = (body.reports ?? []).find(
        (r: { id: string }) => r.id === props.reportId
      );
      if (row && row.status !== state.status) {
        // Full re-read for content.
        const single = await fetch(
          `/api/state-of-me/${props.reportId}/share`,
          { method: "GET" }
        );
        // The share GET doesn't return content — reload the page for
        // the authoritative view. Simpler than wiring a second read
        // endpoint.
        void single;
        window.location.reload();
      }
    } catch {
      // silent
    }
  }, [props.reportId, state.status]);

  useEffect(() => {
    if (state.status !== "QUEUED" && state.status !== "GENERATING") return;
    const interval = setInterval(refetch, 6_000);
    const cap = setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
    return () => {
      clearInterval(interval);
      clearTimeout(cap);
    };
  }, [state.status, refetch]);

  if (state.status === "QUEUED" || state.status === "GENERATING") {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-16 text-center">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500 mb-4" />
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Synthesizing your quarter…
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          This usually takes 20-40 seconds. We&apos;ll refresh the page
          automatically when it&apos;s ready.
        </p>
      </div>
    );
  }

  if (state.status === "FAILED") {
    return (
      <div className="mt-10 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/20 px-6 py-10 text-center">
        <h2 className="text-base font-semibold text-red-900 dark:text-red-200">
          Generation failed
        </h2>
        <p className="mt-2 text-sm text-red-800 dark:text-red-300">
          {state.errorMessage ?? "An unknown error occurred."} Try
          requesting a fresh report from the list page.
        </p>
      </div>
    );
  }

  const content = state.content as StateOfMeContent;

  return (
    <div className="mt-6">
      <StateOfMeReader
        periodStart={state.periodStart}
        periodEnd={state.periodEnd}
        content={content}
      />

      <div className="mt-10 pt-8 border-t border-zinc-200 dark:border-white/10 flex items-center justify-between">
        <StateOfMeShareButton
          reportId={state.reportId}
          initialShareId={state.publicShareId}
          initialExpiresAt={state.publicShareExpiresAt}
        />
        {state.degraded && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Generated from limited data — the next one will be richer.
          </p>
        )}
      </div>
    </div>
  );
}
