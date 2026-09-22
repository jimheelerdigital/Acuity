/**
 * One-off diagnostic (2026-09-18): why are FB/IG posts shipping at 6am
 * PST, and why are some posts not going out? Dumps the last 3 days of
 * SocialPublish rows + eligible DRAFT carousels without queue rows.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const fmtPT = (d: Date | null) =>
  d
    ? d.toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }) + " PT"
    : "—";

async function main() {
  const since = new Date(Date.now() - 3 * 86_400_000);

  const rows = await prisma.socialPublish.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { scheduledAt: "asc" },
    select: {
      platform: true,
      status: true,
      scheduledAt: true,
      postedAt: true,
      attempts: true,
      error: true,
      carouselPost: { select: { lane: true, headline: true, format: true } },
    },
  });

  console.log(`── SocialPublish rows created since ${since.toISOString()} (${rows.length}) ──`);
  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    console.log(
      [
        r.status.padEnd(8),
        r.platform.padEnd(10),
        `sched ${fmtPT(r.scheduledAt)}`.padEnd(26),
        r.postedAt ? `posted ${fmtPT(r.postedAt)}`.padEnd(26) : "".padEnd(26),
        `att ${r.attempts}`,
        (r.carouselPost.lane ?? "?").padEnd(16),
        r.error ? `ERR: ${r.error.slice(0, 90)}` : "",
      ].join(" ")
    );
  }
  console.log("status counts:", byStatus);

  // Eligible DRAFT posts with no queue rows at all
  const lanes = await prisma.contentLane.findMany({ select: { key: true } });
  const noQueue = await prisma.carouselPost.findMany({
    where: {
      status: "DRAFT",
      generatedFor: { gte: since },
      socialPublishes: { none: {} },
    },
    select: { lane: true, headline: true, format: true, generatedFor: true },
    orderBy: { generatedFor: "asc" },
  });
  console.log(`\n── DRAFT posts (3d) with NO SocialPublish rows (${noQueue.length}) ──`);
  for (const p of noQueue) {
    console.log(
      `${(p.lane ?? "?").padEnd(16)} format=${p.format.padEnd(6)} for=${p.generatedFor?.toISOString().slice(0, 10)} "${(p.headline ?? "").slice(0, 60)}"`
    );
  }
  console.log(`\nContentLane keys: ${lanes.map((l) => l.key).join(", ")}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
