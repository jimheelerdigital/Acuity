import { NextRequest, NextResponse } from "next/server";

import { logEvent, type SiteEvent } from "@/lib/mythicals/store";

export const dynamic = "force-dynamic";

/** Legendary Mythicals analytics beacon (2026-10-01): storage JSON, no vendor. */
const ALLOWED: SiteEvent[] = ["page_view", "quiz_start", "quiz_complete", "result_view", "share"];
const BOT = /bot|crawl|spider|preview|facebookexternalhit|slurp|headless/i;

export async function POST(req: NextRequest) {
  let body: { type?: string; path?: string; slug?: string; answers?: unknown; ref?: string; method?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const type = body.type as SiteEvent;
  if (!ALLOWED.includes(type)) return NextResponse.json({ ok: false }, { status: 400 });
  const ua = req.headers.get("user-agent") ?? "";
  if (BOT.test(ua)) return NextResponse.json({ ok: true, skipped: "bot" });

  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  await logEvent(type, {
    path: clip(body.path, 200),
    slug: clip(body.slug, 40),
    answers: Array.isArray(body.answers) ? body.answers.slice(0, 8).map(Number) : undefined,
    ref: clip(body.ref, 300),
    method: clip(body.method, 20),
    host: req.headers.get("host"),
    country: req.headers.get("x-vercel-ip-country") ?? undefined,
    mobile: /Mobi|Android|iPhone/i.test(ua),
  });
  return NextResponse.json({ ok: true });
}
