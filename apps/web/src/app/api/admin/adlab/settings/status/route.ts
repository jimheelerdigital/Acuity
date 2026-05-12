/**
 * GET /api/admin/adlab/settings/status — check env var status (set/not set, never expose values)
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  return NextResponse.json({
    META_ACCESS_TOKEN: !!process.env.META_ACCESS_TOKEN,
    META_AD_ACCOUNT_ID: !!process.env.META_AD_ACCOUNT_ID,
    META_API_VERSION: !!process.env.META_API_VERSION,
    CRON_SECRET: !!process.env.CRON_SECRET,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
  });
}
