/**
 * Render the combined welcome+verify signup email to a temp HTML file
 * (and optionally send it to a test inbox via Resend) so we can verify
 * the layout before pushing.
 *
 * Usage:
 *
 *   # Render to /tmp and open in browser:
 *   cd apps/web && npx tsx scripts/preview-welcome-verify-email.ts
 *
 *   # ALSO send via Resend to a test address:
 *   cd apps/web && npx tsx scripts/preview-welcome-verify-email.ts --send-to=jim+test@heelerdigital.com
 *
 * Reads RESEND_API_KEY from apps/web/.env.local when --send-to is
 * passed. No env vars required for render-only mode.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

loadDotenv({ path: resolve(__dirname, "../.env.local") });

import { welcomeVerifyEmail } from "@/emails/welcome-verify";

const OUT_PATH = "/tmp/welcome-verify-preview.html";

function parseArgs(): { sendTo: string | null } {
  let sendTo: string | null = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--send-to=")) sendTo = arg.slice("--send-to=".length);
  }
  return { sendTo };
}

async function main() {
  const { sendTo } = parseArgs();

  const { subject, html } = welcomeVerifyEmail({
    firstName: "Jim",
    // Realistic token URL so we can click-test in the rendered preview.
    // Token is a fake placeholder — Apple's verify-email route will
    // return InvalidToken on click, which is the correct rejection.
    verifyUrl:
      "https://getacuity.io/api/auth/verify-email?token=preview-fake-token-abc123",
    unsubscribeUrl:
      "https://getacuity.io/api/emails/unsubscribe?token=preview-fake-unsub-xyz",
    foundingMemberNumber: 42,
  });

  writeFileSync(OUT_PATH, html, "utf8");
  console.log(`\n✓ Rendered to ${OUT_PATH}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  HTML length: ${html.length} chars`);
  console.log(`\n  Open in browser:`);
  console.log(`    open ${OUT_PATH}`);

  if (sendTo) {
    if (!process.env.RESEND_API_KEY) {
      console.error(
        "\n❌ --send-to passed but RESEND_API_KEY not set in apps/web/.env.local"
      );
      process.exit(1);
    }
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>",
      to: sendTo,
      subject,
      html,
    });
    if ("error" in result && result.error) {
      console.error("\n❌ Resend send failed:", result.error);
      process.exit(1);
    }
    const resendId =
      (result as { data?: { id?: string } }).data?.id ?? "(no id)";
    console.log(`\n✓ Sent to ${sendTo} via Resend (id: ${resendId})`);
  } else {
    console.log(
      `\n  (To also test-send via Resend: --send-to=your-email@example.com)`
    );
  }
}

main().catch((err) => {
  console.error("\n💥 Unhandled error:", err);
  process.exit(1);
});
