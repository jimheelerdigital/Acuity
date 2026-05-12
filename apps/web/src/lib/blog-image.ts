/**
 * Blog hero image generation + Supabase Storage upload.
 *
 * Pipeline: gpt-image-2 generates from a prompt (b64_json) →
 * upload to Supabase Storage `blog-images` bucket → return public URL.
 *
 * Fire-and-forget safe: if any step fails, returns null so the blog
 * post still publishes without a hero image.
 *
 * Self-heals: creates the blog-images bucket if it doesn't exist.
 */

import OpenAI from "openai";

let cachedClient: OpenAI | null = null;
function openai(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 120_000,
    });
  }
  return cachedClient;
}

/**
 * Ensure the blog-images bucket exists, creating it if needed.
 */
async function ensureBucket(): Promise<boolean> {
  try {
    const { supabase } = await import("@/lib/supabase.server");
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === "blog-images");
    if (!exists) {
      console.warn("[blog-image] blog-images bucket not found — creating it now");
      const { error } = await supabase.storage.createBucket("blog-images", {
        public: true,
      });
      if (error) {
        console.error("[blog-image] Failed to create bucket:", error.message);
        return false;
      }
      console.log("[blog-image] blog-images bucket created successfully");
    }
    return true;
  } catch (err) {
    console.error("[blog-image] Bucket check failed:", err);
    return false;
  }
}

/**
 * Generate a hero image via gpt-image-2 and upload to Supabase Storage.
 * Returns the public URL or null on failure.
 */
export async function generateAndStoreBlogImage(
  slug: string,
  imagePrompt: string
): Promise<string | null> {
  try {
    // 0. Ensure bucket exists
    const bucketReady = await ensureBucket();
    if (!bucketReady) return null;

    // 1. Generate image via gpt-image-2 (b64_json — no URL download needed)
    const response = await openai().images.generate({
      model: "gpt-image-2",
      prompt: imagePrompt,
      n: 1,
      size: "1536x1024",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      console.error("[blog-image] gpt-image-2 returned no image data");
      return null;
    }

    const imageBuffer = Buffer.from(b64, "base64");

    // 2. Upload to Supabase Storage as PNG
    const { supabase } = await import("@/lib/supabase.server");
    const filePath = `${slug}.png`;

    const { error: uploadError } = await supabase.storage
      .from("blog-images")
      .upload(filePath, imageBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("[blog-image] Supabase upload failed:", uploadError.message);
      return null;
    }

    // 3. Get the public URL
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
