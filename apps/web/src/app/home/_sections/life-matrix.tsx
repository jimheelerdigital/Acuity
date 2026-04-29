import { LifeMatrixSnapshot } from "../life-matrix-snapshot";

/**
 * Life Matrix snapshot section. Fetches the 6 dimension scores plus
 * the total entry count (drives the empty-state progress bar) and
 * the unlocked flag. The presentational LifeMatrixSnapshot card
 * stays untouched.
 */
export async function LifeMatrixSection({ userId }: { userId: string }) {
  const { prisma } = await import("@/lib/prisma");
  const { getUserProgression } = await import("@/lib/userProgression");

  const [areas, entryCount, userProg] = await Promise.all([
    prisma.lifeMapArea.findMany({
      where: { userId },
      select: { area: true, score: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.entry.count({ where: { userId } }),
    getUserProgression(userId),
  ]);

  return (
    <div className="lg:col-span-7">
      <LifeMatrixSnapshot
        areas={areas}
        entryCount={entryCount}
        unlocked={userProg.unlocked.lifeMatrix}
      />
    </div>
  );
}
