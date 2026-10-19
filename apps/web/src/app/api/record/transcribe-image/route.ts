/**
 * POST /api/record/transcribe-image
 *
 * Handwritten entry, step 1 of 2 (2026-10-17). Body (JSON):
 *   { image: <base64, no data: prefix>, mediaType: "image/jpeg" | "image/png" | "image/webp" }
 * Returns { text } — the page's words, verbatim — which the mobile
 * composer shows for review. Saving then goes through POST /api/record
 * { text } like any typed entry (step 2), so nothing here creates rows.
 *
 * Gated like a recording (paywall canRecord + the expensive-AI rate
 * limiters): one vision call costs about what one extraction does.
 *
 * Body size: Vercel caps function bodies at 4.5 MB. The client downsizes
 * to ≤1600px JPEG (~300–900 KB; base64 ×1.37) before sending, and we
 * refuse decoded images over HANDWRITING_MAX_IMAGE_BYTES.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import {
  HANDWRITING_ALLOWED_MEDIA,
  HANDWRITING_MAX_IMAGE_BYTES,
  transcribeHandwriting,
  type HandwritingMedia,
} from "@/lib/handwriting";
import { requireEntitlement } from "@/lib/paywall";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  for (const limiter of [
    limiters.expensiveAi,
    limiters.recordDaily,
    limiters.recordMonthly,
  ]) {
    const rl = await checkRateLimit(limiter, `user:${userId}`);
    if (!rl.success) return rateLimitedResponse(rl);
  }

  const gate = await requireEntitlement("canRecord", userId);
  if (!gate.ok) return gate.response;

  let body: { image?: unknown; mediaType?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mediaType =
    typeof body.mediaType === "string" ? body.mediaType.toLowerCase() : "";
  if (!HANDWRITING_ALLOWED_MEDIA.has(mediaType)) {
    return NextResponse.json(
      { error: "Unsupported image type. Send a JPEG, PNG or WebP." },
      { status: 415 }
    );
  }

  const raw = typeof body.image === "string" ? body.image : "";
  // Tolerate a data: URL prefix even though the client shouldn't send one.
  const image = raw.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!image || !BASE64_RE.test(image)) {
    return NextResponse.json(
      { error: "Missing or malformed image" },
      { status: 400 }
    );
  }
  const padding = image.endsWith("==") ? 2 : image.endsWith("=") ? 1 : 0;
  const decodedBytes = Math.floor((image.length * 3) / 4) - padding;
  if (decodedBytes > HANDWRITING_MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "That photo is too large. Try again — we'll shrink it on your phone." },
      { status: 413 }
    );
  }

  try {
    const result = await transcribeHandwriting(
      image,
      mediaType as HandwritingMedia
    );
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.reason === "no_text"
              ? "We couldn't find any writing in that photo. Try a closer, well-lit shot of the page."
              : "We couldn't read that photo. Please try again.",
          code: result.reason,
        },
        { status: 422 }
      );
    }
    return NextResponse.json({ text: result.text });
  } catch (err) {
    console.error("[transcribe-image] vision call failed:", err);
    return NextResponse.json(
      { error: "We couldn't read that photo right now. Please try again." },
      { status: 502 }
    );
  }
}
