/**
 * POST /api/admin/blog/visual-refresh
 *
 * Fires admin/blog-visual-refresh.requested: restyles the given live posts
 * with the rb-* components and regenerates their hero + inline images in
 * the house style (inngest/functions/blog-visual-refresh.ts). Runs in prod,
 * where the working Anthropic/OpenAI keys live.
 *
 * Body: { slugs: string[] }
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = !!cronSecret && bearer === `Bearer ${cronSecret}`;
  if (!bearerOk) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }

  let slugs: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.slugs)) slugs = body.slugs.filter((s: unknown): s is string => typeof s === "string");
  } catch {
    // no body
  }
  if (slugs.length === 0) return NextResponse.json({ ok: false, error: "slugs required" }, { status: 400 });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "admin/blog-visual-refresh.requested", data: { slugs } });

  return NextResponse.json({ ok: true, slugs });
}
