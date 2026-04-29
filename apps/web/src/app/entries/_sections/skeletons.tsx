import { Skeleton, SkeletonCard } from "@/components/skeleton";

/**
 * /entries list-section skeleton. Mirrors the loaded layout's
 * footprint (count subline + filter pills + 6 entry cards) so the
 * Suspense swap reads as content resolving in place. Matches the
 * shape used in apps/web/src/app/entries/loading.tsx; the route-
 * level loader handles route-transition loads, this handles
 * in-page Suspense streams.
 */
export function EntriesListSkeleton() {
  return (
    <>
      <Skeleton className="-mt-4 mb-6 h-4 w-40" />
      <Skeleton className="mb-4 h-10 w-full rounded-xl" />
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i}>
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-5/6" />
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </SkeletonCard>
        ))}
      </div>
    </>
  );
}
