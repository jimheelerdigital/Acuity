/**
 * Lightweight skeleton primitive. Subtle pulse animation, matches the
 * card surfaces the loaded UI uses (rounded-xl, zinc-100 / white/[0.06]).
 *
 * Use as a building block inside per-route loading.tsx files. Keep
 * skeletons close to the loaded layout's footprint — same outer card
 * shape, same column rhythm — so the swap feels like content
 * resolving in place rather than two separate screens.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-zinc-100 dark:bg-white/[0.06] ${className}`}
    />
  );
}

/**
 * Card-shaped skeleton container. Mirrors the rounded-2xl + border +
 * padding signature most consumer cards use, so a route's loading
 * state lines up with its loaded state on render.
 */
export function SkeletonCard({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1E1E2E] ${className}`}
    >
      {children}
    </div>
  );
}
