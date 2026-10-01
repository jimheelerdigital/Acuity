import { NextRequest, NextResponse } from "next/server";

import { unsubscribeToken } from "@/lib/mythicals/emails";
import { addUnsubscribe } from "@/lib/mythicals/store";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const e = (req.nextUrl.searchParams.get("e") ?? "").toLowerCase();
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const ok = !!e && t === unsubscribeToken(e);
  if (ok) await addUnsubscribe(e);
  const msg = ok ? "You are unsubscribed. No more emails from Legendary Mythicals." : "This unsubscribe link is not valid.";
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Legendary Mythicals</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0a09;color:#ede6d6;font-family:Helvetica,Arial,sans-serif;padding:16px;text-align:center"><p>${msg}</p></body>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export const GET = handle;
// One-click List-Unsubscribe (RFC 8058) posts to the same URL.
export const POST = handle;
