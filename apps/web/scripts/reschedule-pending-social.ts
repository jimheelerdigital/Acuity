/**
 * One-off (2026-09-18): re-space all PENDING SocialPublish rows into
 * the NEW posting windows (both open noon ET / 9am PT — per Keenan,
 * 6am PT posts were too early). Keeps each platform's relative order,
 * restarts the stagger from the new window open (or now, if later).
 */
import { PrismaClient } from "@prisma/client";

import {
  PLATFORM_WINDOWS,
  clampToWindow,
} from "../src/lib/content-factory/social-publish";

const prisma = new PrismaClient();

const fmtPT = (d: Date) =>
  d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " PT";

async function main() {
  for (const platform of ["instagram", "facebook"] as const) {
    const rows = await prisma.socialPublish.findMany({
      where: { status: "PENDING", platform },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        scheduledAt: true,
        carouselPost: { select: { lane: true } },
      },
    });
    let cursor = Date.now();
    for (const row of rows) {
      const slot = clampToWindow(new Date(cursor), platform);
      cursor = slot.getTime() + PLATFORM_WINDOWS[platform].staggerMs;
      await prisma.socialPublish.update({
        where: { id: row.id },
        data: { scheduledAt: slot },
      });
      console.log(
        `${platform.padEnd(10)} ${(row.carouselPost.lane ?? "?").padEnd(16)} ${fmtPT(row.scheduledAt)} → ${fmtPT(slot)}`
      );
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
