import { Skeleton, SkeletonCard } from "@/components/skeleton";

/**
 * Per-section skeleton fallbacks for /home Suspense boundaries.
 * Footprints mirror each loaded card so the swap reads as content
 * resolving in place. The route-level loading.tsx uses the same
 * primitives composed into the full grid; these are the per-card
 * variants for in-page Suspense.
 */

export function TodaysPromptSkeleton() {
  return (
    <SkeletonCard className="lg:col-span-8">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-5 w-3/4" />
      <Skeleton className="mt-2 h-5 w-2/3" />
      <Skeleton className="mt-5 h-4 w-32" />
    </SkeletonCard>
  );
}

export function StreakSummarySkeleton() {
  return (
    <SkeletonCard className="lg:col-span-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-3 h-4 w-40" />
    </SkeletonCard>
  );
}

export function LifeMatrixSkeleton() {
  return (
    <SkeletonCard className="lg:col-span-7">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-6 w-48" />
      <div className="mt-6 flex flex-col items-center gap-6 lg:flex-row lg:gap-12">
        <Skeleton className="aspect-square w-full max-w-[360px] rounded-full" />
        <div className="flex w-full max-w-[260px] flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-5" />
          ))}
        </div>
      </div>
    </SkeletonCard>
  );
}

export function WeeklyInsightSkeleton() {
  return (
    <SkeletonCard>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-6 w-48" />
      <Skeleton className="mt-5 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-5/6" />
    </SkeletonCard>
  );
}

export function GoalsSnapshotSkeleton() {
  return (
    <SkeletonCard>
      <Skeleton className="h-3 w-12" />
      <Skeleton className="mt-2 h-6 w-40" />
      <div className="mt-5 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-2 h-1.5 w-full" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

export function RecentSessionsSkeleton() {
  return (
    <SkeletonCard className="lg:col-span-6">
      <Skeleton className="h-3 w-32" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </SkeletonCard>
  );
}

export function OpenTasksSkeleton() {
  return (
    <SkeletonCard className="lg:col-span-6">
      <Skeleton className="h-3 w-24" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </SkeletonCard>
  );
}
