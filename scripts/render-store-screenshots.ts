// ⚠️ RE-RENDER DEPENDENCY: requires the untracked `marketing_handoff/` dir — both the mockup *.jsx files AND `_screenshot-harness.html` live there and are NOT committed; they must be present locally to run this.
/**
 * Render the marketing_handoff phone mockups (the real app screens —
 * Home / Life Matrix / Theme Map) to Play-Store-sized PNGs.
 *
 * Headless Playwright loads marketing_handoff/_screenshot-harness.html
 * over a local static server (file:// would block Babel's JSX fetches),
 * mounts one screen at a time centered on a 1080×1920 (9:16) canvas
 * filled with the app's hero gradient, and screenshots it.
 *
 * No DB, no demo data, no user-table writes — pure design-mockup render.
 *
 * Usage:  npx tsx scripts/render-store-screenshots.ts
 * Output: docs/play-store-listing/phone-screenshots-v1.3.4/{01..03}.png
 */
import { chromium } from "playwright";
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = join(process.cwd(), "marketing_handoff");
const OUT = join(process.cwd(), "docs/play-store-listing/phone-screenshots-v1.3.4");
const HARNESS = "_screenshot-harness.html";
const PORT = 8799;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/babel; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".css": "text/css",
};

const SCREENS = [
  { key: "home", file: "01-home.png" },
  { key: "lifematrix", file: "02-life-matrix.png" },
  { key: "thememap", file: "03-theme-map.png" },
];

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
  console.log(`serving ${ROOT} on :${PORT}`);

  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE.ERR:", m.text());
  });

  for (const s of SCREENS) {
    const url = `http://localhost:${PORT}/${HARNESS}?screen=${s.key}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready).catch(() => {});
    await page.waitForTimeout(1500); // settle fonts + ambient cosmos animation
    await page.screenshot({ path: join(OUT, s.file) });
    console.log("✓", s.key, "→", s.file);
  }

  await browser.close();
  server.close();
  console.log("done →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
