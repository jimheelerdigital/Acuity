/**
 * Blog hero image generation + Supabase Storage upload.
 *
 * Pipeline: DALL-E 3 generates from a prompt → download raw bytes →
 * upload to Supabase Storage `blog-images` bucket → return public URL.
 *
 * Fire-and-forget safe: if any step fails, returns null so the blog
 * post still publishes without a hero image.
 */

import OpenAI from "openai";

let cachedClient: OpenAI | null = null;
function openai(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60_000,
    });
  }
  return cachedClient;
}

/**
 * Generate a hero image via DALL-E 3 and upload to Supabase Storage.
 * Returns the public URL or null on failure.
 */
export async function generateAndStoreBlogImage(
  slug: string,
  imagePrompt: string
): Promise<string | null> {
  try {
    // 1. Generate image via DALL-E 3
    const response = await openai().images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1792x1024",
      quality: "standard",
      style: "vivid",
    });

    const imageUrl = response.data[0]?.url;
    if (!imageUrl) {
      console.error("[blog-image] DALL-E returned no URL");
      return null;
    }

    // 2. Download the image bytes (DALL-E URLs expire after ~1 hour)
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      console.error("[blog-image] Failed to download DALL-E image:", imageRes.status);
      return null;
    }
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

    // 3. Upload to Supabase Storage
    const { supabase } = await import("@/lib/supabase.server");
    const filePath = `${slug}.webp`;

    const { error: uploadError } = await supabase.storage
      .from("blog-images")
      .upload(filePath, imageBuffer, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadError) {
      console.error("[blog-image] Supabase upload failed:", uploadError.message);
      return null;
    }

    // 4. Get the public URL
    const { data: publicUrlData } = supabase.storage
      .from("blog-images")
      .getPublicUrl(filePath);

    console.log("[blog-image] Uploaded hero image:", publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  } catch (err) {
    console.error(
      "[blog-image] Image generation failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
