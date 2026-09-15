/**
 * Public image proxy for TikTok photo posts (2026-09-14).
 *
 * TikTok's Content Posting API only PULLs photo URLs from a domain the
 * developer app has verified — we verified goripple.io, but the slide
 * images live on Supabase's domain. This route streams any object from
 * the public content-factory bucket under a goripple.io URL:
 *
 *   /api/content-factory/image/carousels/abc/slide-1.jpg
 *   → {SUPABASE}/storage/v1/object/public/content-factory/carousels/abc/slide-1.jpg
 *
 * The bucket is already public, so this exposes nothing new.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.map((p) => encodeURIComponent(p)).join("/");
  const upstream = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/content-factory/${path}`;

  const res = await fetch(upstream);
  if (!res.ok || !res.body) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
