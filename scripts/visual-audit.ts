/**
 * Visual audit — headless Playwright sweeps the consumer-facing routes
 * at multiple viewport widths and screenshots each one. Used to catch
 * wide-desktop layout regressions that don't show up in unit/typecheck.
 *
 * Auth: mints a NextAuth JWT signed with NEXTAUTH_SECRET and injects
 * it as the next-auth.session-token cookie on the headless browser, so
 * the script never has to drive an OAuth flow. The user identity comes
 * from AUDIT_USER_ID in .env.local — set this to your founder/test
 * account's User.id.
 *
 * Usage:
 *   pnpm dev   # in apps/web — server must be running on :3000
 *   tsx scripts/visual-audit.ts before
 *   # ...apply CSS fix...
 *   tsx scripts/visual-audit.ts after
 *
 * Output: .tmp/visual-audit/{phase}/{route_slug}/{width}.png — one full-
 * page PNG per (phase × route × width). 36 frames per phase.
 *
 * Roadmap (from runbook): a follow-up PR converts this to also support
 * AUDIT_SEED=true, which seeds a synthetic user instead of pointing at
 * AUDIT_USER_ID, so the same script can run in CI without real data.
 */

import { config as loadEnv } from "dotenv";
import { encode } from "next-auth/jwt";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

loadEnv({ path: "apps/web/.env.local" });

const PHASE = process.argv[2] as "before" | "after" | undefined;
if (PHASE !== "before" && PHASE !== "after") {
  console.error("Usage: tsx scripts/visual-audit.ts <before|after>");
  process.exit(1);
}

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.NEXTAUTH_SECRET;
const USER_ID = process.env.AUDIT_USER_ID;

if (!SECRET) {
  console.error("NEXTAUTH_SECRET unset — can't mint a session cookie.");
  process.exit(1);
}
if (!USER_ID) {
  console.error("AUDIT_USER_ID unset — set it in apps/web/.env.local.");
  process.exit(1);
}

// Routes — order matches the user's wide-desktop polish push (a–g).
const ROUTES: Array<{ path: string; slug: string }> = [
  { path: "/home", slug: "home" },
  { path: "/entries", slug: "entries" },
  { path: "/tasks", slug: "tasks" },
  { path: "/goals", slug: "goals" },
  { path: "/life-matrix", slug: "life-matrix" },
  { path: "/insights/theme-map", slug: "insights-theme-map" },
];

// Viewport widths — covers Tailwind's lg (1024), xl (1280), 2xl (1536),
// plus three wide-desktop bands matching common external monitors.
// 1400 added because the user-reported "Streak orphaned to its own row"
// reproduces between xl (1280) and 2xl (1536) where the lg:grid-cols-12
// row math breaks under min-content pressure from the row-3 radar.
const WIDTHS = [1024, 1280, 1400, 1536, 1920, 2240, 2560];

const VIEWPORT_HEIGHT = 1024; // initial; full-page screenshots scroll

async function main() {
  // ── Mint session cookie ─────────────────────────────────────────
  // Mirrors apps/web/src/lib/mobile-session.ts so server-side helpers
  // recognize this token as a normal NextAuth session.
  const sessionToken = await encode({
    token: { id: USER_ID, sub: USER_ID },
    secret: SECRET!,
    maxAge: 30 * 24 * 60 * 60,
  });

  // Cookie name varies by NODE_ENV (matches apps/web/src/lib/auth.ts:163).
  // Local dev runs on http://, so the unprefixed name is what NextAuth
  // reads. If you ever point this at a https origin, switch to the
  // __Secure- prefixed name.
  const cookieName = "next-auth.session-token";

  const baseUrl = new URL(BASE_URL);

  console.log(`[visual-audit] phase=${PHASE} base=${BASE_URL} user=${USER_ID}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: WIDTHS[0], height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
  });
  await context.addCookies([
    {
      name: cookieName,
      value: sessionToken,
      // Using `url` form so Playwright derives domain/path/secure from
      // the origin — avoids subtle host vs domain mismatches that
      // bit the first run (cookie set but middleware didn't see it).
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();

  let failures = 0;
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      const outPath = join(
        ".tmp",
        "visual-audit",
        PHASE!,
        route.slug,
        `${width}.png`
      );
      if (!existsSync(dirname(outPath))) {
        await mkdir(dirname(outPath), { recursive: true });
      }

      try {
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
        await page.goto(`${BASE_URL}${route.path}`, {
          waitUntil: "networkidle",
          timeout: 30_000,
        });
        // Suspense boundaries on /home stream cards in — give them a
        // beat to settle. networkidle isn't enough because each card
        // is its own RSC stream.
        await page.waitForTimeout(800);
        await page.screenshot({ path: outPath, fullPage: true });
        console.log(`  ✓ ${route.slug} @ ${width}px → ${outPath}`);

        // Sticky-state probe: full-page screenshots render the entire
        // doc at once and so can't catch sticky-overflow bugs where a
        // sticky element follows the user past its row into the next.
        // For routes that mount a sticky rail, take a second viewport-
        // only screenshot scrolled to where the rail is most likely
        // to misbehave (~50% down).
        const hasSticky = route.slug === "home" || route.slug === "goals";
        if (hasSticky && width >= 1536) {
          const scrolledPath = join(
            ".tmp",
            "visual-audit",
            PHASE!,
            route.slug,
            `${width}-scrolled.png`
          );
          const docHeight = await page.evaluate(
            () => document.documentElement.scrollHeight
          );
          await page.evaluate(
            (y) => window.scrollTo(0, y),
            Math.max(0, Math.floor(docHeight * 0.5))
          );
          await page.waitForTimeout(200);
          await page.screenshot({ path: scrolledPath, fullPage: false });
          console.log(`  ✓ ${route.slug} @ ${width}px scrolled → ${scrolledPath}`);
        }
      } catch (err) {
        failures += 1;
        console.error(
          `  ✗ ${route.slug} @ ${width}px — ${(err as Error).message}`
        );
      }
    }
  }

  await browser.close();

  if (failures > 0) {
    console.error(`\n[visual-audit] ${failures} frame(s) failed.`);
    process.exit(1);
  }
  console.log(
    `\n[visual-audit] captured ${ROUTES.length * WIDTHS.length} frames into .tmp/visual-audit/${PHASE}/`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
