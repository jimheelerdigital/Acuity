/**
 * Manual trigger for the weekly talking-head script report
 * (video-scripts.ts). Generates 3 pulse-driven scripts per brand from
 * the freshest RedditTrendDigest and emails them to Keenan — same
 * thing the Monday cron step does, runnable on demand.
 *
 *   cd apps/web && npx tsx scripts/send-script-report.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "..", ".env.local") });
// Root .env holds the valid Resend key (re_...); override the placeholder
// that lives in apps/web/.env.local.
config({ path: resolve(__dirname, "../../..", ".env"), override: true });

async function main() {
  const { sendVideoScriptReport } = await import(
    "../src/lib/content-factory/video-scripts"
  );
  const sent = await sendVideoScriptReport();
  console.log(`Done — ${sent} scripts emailed.`);
  if (sent === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
