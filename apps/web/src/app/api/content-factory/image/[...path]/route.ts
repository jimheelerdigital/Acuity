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
 *
 * PLATFORM CROPS (2026-09-22, per Keenan: "properly crop facebook and
 * instagram posts ... to fill the screen"): `?ar=4x5` center-crops the
 * 9:16 slide to 1080x1350 with sharp before responding. The slide
 * design's 15% top/bottom safe zone matches a 4:5 center-crop (keeps
 * the middle 70.3%), so baked text survives. IG/FB feed posts pull
 * these URLs; TikTok keeps the uncropped 9:16 originals.
 */

export const dynamic = "force-dynamic";

/** Supported crop ratios → output size. Slides are 1080x1920. */
const CROPS: Record<string, { width: number; height: number }> = {
  "4x5": { width: 1080, height: 1350 },
  "1x1": { width: 1080, height: 1080 },
};

export async function GET(
  req: Request,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.map((p) => encodeURIComponent(p)).join("/");
  const upstream = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/content-factory/${path}`;

  const res = await fetch(upstream);
  if (!res.ok || !res.body) {
    return new Response("Not found", { status: 404 });
  }

  const ar = new URL(req.url).searchParams.get("ar");
  const crop = ar ? CROPS[ar] : undefined;
  if (!crop) {
    return new Response(res.body, {
      headers: {
        "content-type": res.headers.get("content-type") ?? "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  const { default: sharp } = await import("sharp");
  const cropped = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(crop.width, crop.height, { fit: "cover", position: "centre" })
    .jpeg({ quality: 92 })
    .toBuffer();
  return new Response(new Uint8Array(cropped), {
    headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
