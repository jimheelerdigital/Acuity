/**
 * Shared HTML shell for transactional auth emails. White canvas, dark
 * text, small left-aligned logo, coral CTA. Brand palette is coral
 * (#FF8A65) with the button using the deeper coral #E06B46 so white
 * label text clears WCAG AA. Declares color-scheme so dark-mode clients
 * keep our explicit light card instead of force-inverting it into
 * unreadable dark-grey-on-near-black.
 *
 * TRANSACTIONAL footer: sender info only, no marketing unsubscribe.
 *
 * Used by: password-reset, verification, magic-link, payment-failed,
 * data-export-ready, state-of-me-ready.
 *
 * Every caller passes pre-escaped copy. Do NOT interpolate unescaped
 * user input (names) into any arg.
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
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${title}</title>
</head>
<body style="background:#FFFFFF;margin:0;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${pre}</span>
  <div style="max-width:560px;margin:0 auto;background:#F9FAFB;border-radius:16px;padding:40px;border:1px solid #E5E7EB;">
    <div style="margin-bottom:32px;">
      <img src="https://www.getacuity.io/AcuityLogoDark.png" alt="Acuity" width="36" height="36" style="display:block;width:36px;height:36px;margin-bottom:16px;" />
      <h1 style="color:#1a1a1a;font-size:24px;font-weight:700;margin:0;">${title}</h1>
    </div>
    <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 32px;">
      ${intro}
    </p>
    <a href="${ctaUrl}" style="display:block;background:#E06B46;background:linear-gradient(135deg,#FFA47E 0%,#FF8A65 55%,#E06B46 100%);color:#FFFFFF;text-decoration:none;text-align:center;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;margin-bottom:24px;">
      ${ctaLabel}
    </a>
    ${
      footnote
        ? `<p style="color:#6b7280;font-size:13px;text-align:center;margin:0;">${footnote}</p>`
        : `<p style="color:#6b7280;font-size:13px;text-align:center;margin:0;">If you didn't request this email, you can safely ignore it.</p>`
    }
  </div>
  <p style="color:#6b7280;font-size:12px;text-align:center;margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
    Acuity &middot; getacuity.io
  </p>
</body>
</html>
`.trim();
}
