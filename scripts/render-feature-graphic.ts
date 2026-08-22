// ⚠️ RE-RENDER DEPENDENCY: requires the untracked `marketing_handoff/` dir — both the brand mockups (*.jsx) AND `_feature-graphic.html` live there and are NOT committed; they must be present locally to run this.
/**
 * Render the Google Play "Feature graphic" (1024×500) headlessly from the
 * brand design tokens — Acuity wordmark + approved positioning copy + the
 * Home screen peeking in. No DB, no demo data.
 *
 * Usage:  npx tsx scripts/render-feature-graphic.ts
 * Output: docs/play-store-listing/feature-graphic-1024x500.png
 */
import { chromium } from "playwright";
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(process.cwd(), "marketing_handoff");
const OUT = join(process.cwd(), "docs/play-store-listing/feature-graphic-1024x500.png");
const HARNESS = "_feature-graphic.html";
const PORT = 8801;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/babel; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".css": "text/css",
};

async function main() {
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p === "/") p = "/" + HARNESS;
      const fp = join(ROOT, p);
      if (!fp.startsWith(ROOT) || !existsSync(fp)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const body = await readFile(fp);
      res.writeHead(200, { "content-type": MIME[extname(fp)] || "application/octet-stream" });
      res.end(body);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  await new Promise<void>((r) => server.listen(PORT, () => r()));

  await mkdir(join(OUT, ".."), { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE.ERR:", m.text()); });

  await page.goto(`http://localhost:${PORT}/${HARNESS}`, { waitUntil: "networkidle" });
  await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
  await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT });
  console.log("✓ feature graphic →", OUT);

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
