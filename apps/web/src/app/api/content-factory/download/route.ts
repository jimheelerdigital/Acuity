/**
 * Content Factory — force-download proxy for slide videos/images.
 *
 * The daily email's "Download" buttons point here instead of directly at
 * Supabase Storage. Streaming the file from our own domain with
 * `Content-Disposition: attachment` reliably triggers the native
 * "Do you want to download?" popup on iOS Safari — direct Supabase links
 * (even with the ?download flag) get played inline by some mail apps'
 * in-app browsers.
 *
 * Only paths inside the public content-factory bucket's carousels/ prefix
 * are allowed, so this cannot be used as an open proxy.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PATH_RE = /^carousels\/[A-Za-z0-9\-_/.]+\.(mp4|jpg|jpeg|png)$/;

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!PATH_RE.test(path) || path.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const name = req.nextUrl.searchParams.get("name") ?? path.split("/").pop()!;
  const safeName = name.replace(/[^A-Za-z0-9\-_.]/g, "_");

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const upstream = await fetch(
    `${base}/storage/v1/object/public/content-factory/${path}`
  );
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const headers = new Headers({
    "Content-Type":
      upstream.headers.get("content-type") ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename="${safeName}"`,
    "Cache-Control": "public, max-age=3600",
  });
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);

  return new NextResponse(upstream.body, { headers });
}
