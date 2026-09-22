/**
 * One-off (2026-09-15): add CarouselPost.reelTransition (TEXT, nullable)
 * to prod — additive, back-declared in prisma/schema.prisma same session.
 *
 * Run from apps/web with prod env:
 *   set -a && source /tmp/acuity-prod.env && set +a && npx tsx scripts/add-reel-transition-column.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

prisma
  .$executeRawUnsafe(
    'ALTER TABLE public."CarouselPost" ADD COLUMN IF NOT EXISTS "reelTransition" TEXT;'
  )
  .then(() => console.log("reelTransition column added"))
  .finally(() => prisma.$disconnect());
