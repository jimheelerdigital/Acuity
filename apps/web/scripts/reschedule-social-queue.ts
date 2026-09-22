/**
 * One-off (2026-09-15): re-slot all PENDING SocialPublish rows into the
 * new prime-time ET windows (PLATFORM_WINDOWS). The pre-scheduler queue
 * had rows firing overnight; this moves every pending row into its
 * platform's window, preserving relative order, starting from now.
 *
 * Run from apps/web with prod env:
 *   set -a && source /tmp/acuity-prod.env && set +a && npx tsx scripts/reschedule-social-queue.ts
 */
import { PrismaClient } from "@prisma/client";

import {
  clampToWindow,
  PLATFORM_WINDOWS,
  type SocialPlatform,
} from "../src/lib/content-factory/social-publish";

const prisma = new PrismaClient();

async function main() {
  for (const platform of ["instagram", "facebook", "tiktok"] as const) {
    const rows = await prisma.socialPublish.findMany({
      where: { status: "PENDING", platform },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, carouselPost: { select: { headline: true } } },
    });
    let cursor = Date.now();
    for (const row of rows) {
      const slot = clampToWindow(new Date(cursor), platform as SocialPlatform);
      cursor = slot.getTime() + PLATFORM_WINDOWS[platform].staggerMs;
      await prisma.socialPublish.update({
        where: { id: row.id },
        data: { scheduledAt: slot },
      });
      console.log(
        `${platform} | ${slot.toLocaleString("en-US", { timeZone: "America/New_York" })} ET | "${row.carouselPost.headline.slice(0, 45)}"`
      );
    }
    console.log(`— ${platform}: re-slotted ${rows.length} rows\n`);
  }
}

main().finally(() => prisma.$disconnect());
