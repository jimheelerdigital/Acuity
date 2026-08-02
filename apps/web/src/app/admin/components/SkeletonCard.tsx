"use client";

// Quiet progressive-reveal skeletons — no shimmer (DESIGN_SYSTEM §6.4).
const cardClass =
  "rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg p-5 animate-pulse";

export function SkeletonMetric() {
  return (
    <div className={`${cardClass} min-h-[160px]`}>
      <div className="h-3 w-20 rounded bg-acuity-bg-inset" />
      <div className="mt-4 h-8 w-28 rounded bg-acuity-bg-inset" />
      <div className="mt-3 h-2 w-full rounded bg-acuity-bg-inset" />
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className={cardClass}>
      <div className="h-3 w-32 rounded bg-acuity-bg-inset" />
      <div className="mt-4 h-48 w-full rounded bg-acuity-bg-inset" />
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className={`${cardClass} space-y-3`}>
      <div className="h-3 w-32 rounded bg-acuity-bg-inset" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-6 w-full rounded bg-acuity-bg-inset" />
      ))}
    </div>
  );
}
