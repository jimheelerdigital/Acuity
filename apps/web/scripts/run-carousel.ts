/**
 * Manual carousel generation script.
 * Run from apps/web: npx tsx scripts/run-carousel.ts <topic-slug>
 */

// Shim server-only before anything imports it
const Module = require("module");
try {
  const soPath = require.resolve("server-only");
  Module._cache[soPath] = { id: soPath, filename: soPath, loaded: true, exports: {}, children: [], paths: [] };
} catch {}

// Load env
const fs = require("fs");
const path = require("path");
const envPath = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/);
    if (m) process.env[m[1]] = m[2];
  }
}

async function main() {
  const slug = process.argv[2] || "invisible-mental-load";

  console.log("[manual] OpenAI:", process.env.OPENAI_API_KEY ? "set" : "MISSING");
  console.log("[manual] Supabase:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "MISSING");
  console.log("[manual] DATABASE_URL:", process.env.DATABASE_URL ? "set" : "MISSING");

  const { generateCarousel } = await import("@/lib/content-factory/carousel-generate");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  console.log(`[manual] Generating: ${slug} for ${today.toISOString().slice(0, 10)}`);
  console.log("[manual] This will take 2-3 minutes (7+ image generations)...");

  const result = await generateCarousel(slug, today);
  console.log("[manual] Done!", JSON.stringify(result, null, 2));
}

main().catch(e => { console.error("[manual] FAILED:", e.message || e); process.exit(1); });
