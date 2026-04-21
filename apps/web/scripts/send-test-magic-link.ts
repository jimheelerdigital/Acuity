/**
 * Sends a test magic-link email to verify the logo renders correctly.
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a
 *   npx tsx apps/web/scripts/send-test-magic-link.ts
 */

import { Resend } from "resend";

// Inline the email builder so we don't need tsconfig path aliases
function emailLayout(opts: {
  title: string;
  preheader?: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  footnote?: string;
}): string {
  const { title, preheader, intro, ctaLabel, ctaUrl, footnote } = opts;
  const pre = preheader ?? "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="background:#0D0D0F;margin:0;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${pre}</span>
  <div style="max-width:480px;margin:0 auto;background:#18181B;border-radius:16px;padding:40px;border:1px solid #27272A;">
    <div style="text-align:center;margin-bottom:32px;">
      <img src="https://www.getacuity.io/AcuityLogo.png" alt="Acuity" width="48" height="48" style="display:block;margin:0 auto 16px;width:48px;height:48px;" />
      <h1 style="color:#FAFAFA;font-size:24px;font-weight:700;margin:0;">${title}</h1>
    </div>
    <p style="color:#A1A1AA;font-size:15px;line-height:1.6;margin:0 0 32px;">
      ${intro}
    </p>
    <a href="${ctaUrl}" style="display:block;background:linear-gradient(135deg,#7C3AED,#4F46E5);color:#FFFFFF;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-weight:600;font-size:15px;margin-bottom:24px;">
      ${ctaLabel} →
    </a>
    ${
      footnote
        ? `<p style="color:#52525B;font-size:13px;text-align:center;margin:0;">${footnote}</p>`
        : `<p style="color:#52525B;font-size:13px;text-align:center;margin:0;">If you didn't request this email, you can safely ignore it.</p>`
    }
  </div>
  <p style="color:#3F3F46;font-size:12px;text-align:center;margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
    Acuity — Brain dump daily. Get your life back.
  </p>
</body>
</html>
`.trim();
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set. Run:\n  set -a && source apps/web/.env.local && set +a");
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  const to = "keenan@heelerdigital.com";
  const from = process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>";

  const html = emailLayout({
    title: "Sign in to Acuity",
    preheader: "Tap the button to sign in. No password needed.",
    intro:
      "Click the button below to sign in. This link expires in 24 hours and can only be used once.",
    ctaLabel: "Sign in to Acuity",
    ctaUrl: "https://www.getacuity.io/api/auth/callback/email?callbackUrl=%2F&token=test-token-for-logo-verification&email=keenan%40heelerdigital.com",
  });

  console.log(`Sending test magic-link email to ${to}...`);

  const result = await resend.emails.send({
    from,
    to,
    subject: "[TEST] Sign in to Acuity — verify logo",
    html,
  });

  console.log("Sent!", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
