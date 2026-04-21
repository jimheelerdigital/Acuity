"use client";

export function SkeletonMetric() {
  return (
    <div className="rounded-xl bg-[#13131F] p-5 min-h-[140px] animate-pulse">
      <div className="h-3 w-20 rounded bg-white/5" />
      <div className="mt-4 h-8 w-28 rounded bg-white/5" />
      <div className="mt-3 h-2 w-full rounded bg-white/5" />
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="rounded-xl bg-[#13131F] p-5 animate-pulse">
      <div className="h-3 w-32 rounded bg-white/5" />
      <div className="mt-4 h-48 w-full rounded bg-white/5" />
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="rounded-xl bg-[#13131F] p-5 animate-pulse space-y-3">
      <div className="h-3 w-32 rounded bg-white/5" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-6 w-full rounded bg-white/5" />
      ))}
    </div>
  );
}
