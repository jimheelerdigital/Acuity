import { Skeleton, SkeletonCard } from "@/components/skeleton";

export default function GoalsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Skeleton className="mb-2 h-9 w-32" />
      <Skeleton className="mb-6 h-4 w-56" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-12" />
            </div>
            <Skeleton className="mt-3 h-2 w-full rounded-full" />
            <Skeleton className="mt-4 h-4 w-3/4" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}
