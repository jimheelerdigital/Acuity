import { PageContainer } from "@/components/page-container";
import { Skeleton, SkeletonCard } from "@/components/skeleton";

export default function LifeMatrixLoading() {
  return (
    <div className="min-h-screen">
      <PageContainer mobileWidth="5xl">
        <header className="mb-8">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-9 w-48" />
          <Skeleton className="mt-3 h-4 w-2/3 max-w-xl" />
        </header>
        <SkeletonCard>
          <div className="flex justify-center py-6">
            <Skeleton className="aspect-square w-full max-w-[400px] rounded-full" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </SkeletonCard>
      </PageContainer>
    </div>
  );
}
