/**
 * Shared HTML shell for transactional auth emails. Matches the dark
 * aesthetic of the app: #0D0D0F canvas, #18181B card, violet→indigo
 * brand gradient on CTAs. Table-free because modern email clients
 * render flex fine and the copy is short — verification link, reset
 * link, magic link — so we don't need enterprise-grade layout compat.
 *
 * Every caller passes pre-escaped copy. Do NOT interpolate unescaped
 * user input (names) into any arg: email clients render HTML entities
 * but not script, so this is XSS-safe only as long as the argument
 * list stays free of user-controlled strings. Right now the only
 * dynamic piece is the URL, which we construct server-side.
 */
export function emailLayout(opts: {
  title: string;
  preheader?: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  /** Optional paragraph below the CTA (e.g. "expires in 1 hour"). */
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
    Acuity — Debrief daily. See your life clearly.
  </p>
</body>
</html>
`.trim();
}
