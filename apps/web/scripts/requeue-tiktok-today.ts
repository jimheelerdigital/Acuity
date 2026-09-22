/**
 * One-off (2026-09-15): after Keenan completed both TikTok OAuth connects,
 * requeue ALL tiktok SocialPublish rows for SAME-DAY delivery (per Keenan:
 * "give me the tiktok drafts today" — not the 7-10am morning window).
 *
 * 1. Verifies both SocialToken rows exist (ripple + bwk) — aborts if not.
 * 2. Flips SKIPPED tiktok rows ("TikTok not connected") back to PENDING.
 * 3. Re-slots every PENDING tiktok row starting NOW at a 5-min stagger.
 *
 * Run from apps/web with prod env:
 *   set -a && source /tmp/acuity-prod.env && set +a && npx tsx scripts/requeue-tiktok-today.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const STAGGER_MS = 5 * 60_000;

async function main() {
  const tokens = await prisma.socialToken.findMany({
    where: { provider: "tiktok" },
    select: { accountKey: true, updatedAt: true },
  });
  console.log(
    "SocialToken rows:",
    tokens.map((t) => `${t.accountKey} (${t.updatedAt.toISOString()})`).join(", ") || "NONE"
  );
  const keys = new Set(tokens.map((t) => t.accountKey));
  if (!keys.has("ripple") || !keys.has("bwk")) {
    console.error("ABORT: missing token for", !keys.has("ripple") ? "ripple" : "bwk");
    process.exit(1);
  }

  const skipped = await prisma.socialPublish.updateMany({
    where: { platform: "tiktok", status: "SKIPPED" },
    data: { status: "PENDING", error: null, attempts: 0 },
  });
  console.log(`SKIPPED → PENDING: ${skipped.count} rows`);

  const rows = await prisma.socialPublish.findMany({
    where: { platform: "tiktok", status: "PENDING" },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, accountKey: true, carouselPost: { select: { headline: true } } },
  });
  let cursor = Date.now();
  for (const row of rows) {
    const slot = new Date(cursor);
    cursor += STAGGER_MS;
    await prisma.socialPublish.update({
      where: { id: row.id },
      data: { scheduledAt: slot },
    });
    console.log(
      `${slot.toLocaleString("en-US", { timeZone: "America/New_York" })} ET | ${row.accountKey} | "${row.carouselPost.headline.slice(0, 45)}"`
    );
  }
  console.log(`\nRe-slotted ${rows.length} tiktok rows starting now @ 5-min stagger.`);
}

main().finally(() => prisma.$disconnect());
