import { NextRequest, NextResponse } from "next/server";

import { logEvent, type SiteEvent } from "@/lib/mythicals/store";

export const dynamic = "force-dynamic";

/** Legendary Mythicals analytics beacon (2026-10-01): storage JSON, no vendor. */
const ALLOWED: SiteEvent[] = ["page_view", "quiz_start", "quiz_complete", "result_view", "share", "product_interest"];
const BOT = /bot|crawl|spider|preview|facebookexternalhit|slurp|headless/i;

export async function POST(req: NextRequest) {
  let body: {
    type?: string;
    path?: string;
    slug?: string;
    quiz?: string;
    answers?: unknown;
    products?: unknown;
    own?: unknown;
    ref?: string;
    method?: string;
  };
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
    // Since 2026-10-27 answers are the encoded picks string (quizzes.ts).
    quiz: clip(body.quiz, 10),
    answers: typeof body.answers === "string" ? clip(body.answers, 40) : Array.isArray(body.answers) ? body.answers.slice(0, 8).map(Number) : undefined,
    products: Array.isArray(body.products) ? body.products.slice(0, 12).map((p) => String(p).slice(0, 20)) : undefined,
    own: typeof body.own === "boolean" ? body.own : undefined,
    ref: clip(body.ref, 300),
    method: clip(body.method, 20),
    host: req.headers.get("host"),
    country: req.headers.get("x-vercel-ip-country") ?? undefined,
    mobile: /Mobi|Android|iPhone/i.test(ua),
  });
  return NextResponse.json({ ok: true });
}
