/**
 * Generate the hero, share (OG) and email images for every quiz result that
 * doesn't have one yet (2026-10-27: 8 new beasts + the armor and weapon
 * quizzes). Skips anything already in the bucket, so it is safe to re-run.
 *
 *   npx tsx scripts/mythicals-quiz-images.ts            # all missing
 *   npx tsx scripts/mythicals-quiz-images.ts armor      # one quiz
 *   npx tsx scripts/mythicals-quiz-images.ts --redo weapon:sunspear
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "..", ".env.local") });
config({ path: resolve(__dirname, "../../..", ".env"), override: true });

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const STYLE =
  "Photorealistic cinematic fantasy concept art, epic scale, dramatic volumetric lighting, rich color, extremely high detail, sharp focus. " +
  "Vertical 9:16 phone-wallpaper composition with the subject centered and the whole subject in frame. " +
  "No text, no letters, no logos, no watermark. No visible human face: any person is helmeted, hooded or seen from behind.";

async function main() {
  const { QUIZZES, QUIZ_KINDS, resultImageUrl } = await import("../src/lib/mythicals/quizzes");
  const { generateImage } = await import("../src/lib/content-factory/carousel-generate");
  // Straight to the public bucket (lib/mythicals/store is server-only).
  const bucket = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage.from("content-factory");
  const uploadAsset = async (path: string, buf: Buffer, contentType: string) => {
    const full = `mythicals-site/${path}`;
    const { error } = await bucket.upload(full, buf, { contentType, upsert: true });
    if (error) throw new Error(`upload ${full}: ${error.message}`);
    return bucket.getPublicUrl(full).data.publicUrl;
  };

  const args = process.argv.slice(2);
  const redo = new Set(args.filter((a) => a.includes(":")).map((a) => a.replace("--redo", "").trim()));
  const only = args.find((a) => (QUIZ_KINDS as string[]).includes(a));
  const jobs: { kind: (typeof QUIZ_KINDS)[number]; slug: string; scene: string }[] = [];
  for (const kind of QUIZ_KINDS) {
    if (only && kind !== only) continue;
    for (const r of Object.values(QUIZZES[kind].results)) {
      const exists = (await fetch(resultImageUrl(kind, r.slug), { method: "HEAD" })).ok;
      if (exists && !redo.has(`${kind}:${r.slug}`)) continue;
      jobs.push({ kind, slug: r.slug, scene: (r as { scene: string }).scene });
    }
  }
  console.log(`${jobs.length} images to make`);

  const run = async (j: (typeof jobs)[number]) => {
    const hero = await generateImage(`${j.scene}. ${STYLE}`, "cover");
    const base = j.kind === "beast" ? { hero: `archetypes/${j.slug}.jpg`, og: `og/${j.slug}.jpg`, email: `email/${j.slug}.jpg` }
      : { hero: `${j.kind}/${j.slug}.jpg`, og: `og/${j.kind}-${j.slug}.jpg`, email: `email/${j.kind}-${j.slug}.jpg` };
    const jpg = await sharp(hero).jpeg({ quality: 90 }).toBuffer();
    const og = await sharp(hero).resize(1200, 630, { fit: "cover", position: "attention" }).jpeg({ quality: 85 }).toBuffer();
    const email = await sharp(hero).resize(720, 900, { fit: "cover", position: "attention" }).jpeg({ quality: 85 }).toBuffer();
    const url = await uploadAsset(base.hero, jpg, "image/jpeg");
    await uploadAsset(base.og, og, "image/jpeg");
    await uploadAsset(base.email, email, "image/jpeg");
    console.log(`done ${j.kind}/${j.slug} ${url}`);
  };

  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let j = queue.shift(); j; j = queue.shift()) {
        try {
          await run(j);
        } catch (err) {
          console.error(`FAILED ${j.kind}/${j.slug}: ${err instanceof Error ? err.message : err}`);
        }
      }
    })
  );
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
