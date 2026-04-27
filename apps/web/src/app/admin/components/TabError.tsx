"use client";

/**
 * Shared error state for any /admin tab whose data fetch fails. Tabs
 * previously ignored useTabData's `error` field — when /api/admin/metrics
 * threw, the tab spun on the loading skeleton forever (manifesting as
 * "tab doesn't load"). This component surfaces the error so we can
 * diagnose, with a retry button so a transient failure isn't a refresh-
 * the-whole-app moment.
 */
export function TabError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-900/10 p-6">
      <h3 className="text-base font-semibold text-red-300">
        Couldn&rsquo;t load this tab
      </h3>
      <p className="mt-1 text-sm text-red-300/70">{message}</p>
      <p className="mt-2 text-xs text-white/40">
        If this keeps happening, check the function logs for{" "}
        <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono">
          /api/admin/metrics
        </code>
        .
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
        >
          Retry
        </button>
      )}
    </div>
  );
}
