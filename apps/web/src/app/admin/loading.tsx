import { Skeleton, SkeletonCard } from "@/components/skeleton";

export default function AdminLoading() {
  return (
    <div className="px-6 py-8">
      <Skeleton className="mb-2 h-9 w-48" />
      <Skeleton className="mb-6 h-4 w-72" />
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-8 w-32" />
            <Skeleton className="mt-2 h-3 w-24" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}
