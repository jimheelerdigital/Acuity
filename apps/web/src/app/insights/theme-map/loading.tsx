import { PageContainer } from "@/components/page-container";
import { Skeleton, SkeletonCard } from "@/components/skeleton";

export default function ThemeMapLoading() {
  return (
    <div className="min-h-screen">
      <PageContainer mobileWidth="5xl">
        <header className="mb-8">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-9 w-40" />
          <Skeleton className="mt-3 h-4 w-2/3 max-w-xl" />
        </header>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i}>
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-12" />
              </div>
              <Skeleton className="mt-4 h-16 w-full" />
              <Skeleton className="mt-3 h-3 w-2/3" />
            </SkeletonCard>
          ))}
        </div>
      </PageContainer>
    </div>
  );
}
