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
    <div
      className="rounded-acuity-lg border bg-acuity-bad-soft p-6"
      style={{
        borderColor: "color-mix(in oklch, var(--acuity-bad), transparent 75%)",
      }}
    >
      <h3 className="text-base font-semibold text-acuity-bad">
        Couldn&rsquo;t load this tab
      </h3>
      <p className="mt-1 text-sm text-acuity-text-sec">{message}</p>
      <p className="mt-2 text-xs text-acuity-text-ter">
        If this keeps happening, check the function logs for{" "}
        <code className="rounded bg-acuity-bg-inset px-1.5 py-0.5 font-mono">
          /api/admin/metrics
        </code>
        .
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-acuity-pill border border-acuity-line-strong bg-acuity-bg-sub px-4 py-1.5 text-sm font-medium text-acuity-text transition hover:border-acuity-line-strong hover:bg-acuity-bg-inset"
        >
          Retry
        </button>
      )}
    </div>
  );
}
