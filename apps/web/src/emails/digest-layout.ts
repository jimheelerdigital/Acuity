/**
 * Shared digest email shell — richer than the transactional
 * emailLayout (which expects a single CTA) because digests carry
 * sections: mood summary, themes, observations, goals progress.
 *
 * Every caller supplies pre-escaped HTML sections. Don't pass raw
 * user input here — XSS-safe only when the caller escaped upstream.
 *
 * Unsubscribe link is mandatory. CAN-SPAM compliance + matches the
 * List-Unsubscribe header that upstream senders should include.
 */

export function digestLayout(opts: {
  title: string;
  preheader: string;
  dateRange: string;
  sectionsHtml: string;
  /** Unsubscribe URL including the signed token. */
  unsubscribeUrl: string;
  /** "weekly summary" | "monthly reflection" — whichever kind this is. */
  kindLabel: string;
  /** Link to the primary in-app destination for more detail. */
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<div style="padding:16px 32px 0;">
           <a href="${opts.ctaUrl}" style="display:block;background:linear-gradient(135deg,#7C3AED,#4F46E5);color:#FFFFFF;text-decoration:none;text-align:center;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px;">${opts.ctaLabel} →</a>
         </div>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.title}</title>
</head>
<body style="background:#0D0D0F;margin:0;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${opts.preheader}</span>
  <div style="max-width:560px;margin:0 auto;background:#18181B;border-radius:16px;overflow:hidden;border:1px solid #27272A;">
    <div style="padding:28px 32px 16px;">
      <img src="https://www.getacuity.io/AcuityLogo.png" alt="Acuity" width="36" height="36" style="display:inline-block;width:36px;height:36px;margin-bottom:12px;" />
      <p style="margin:0;color:#71717A;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">${opts.kindLabel}</p>
      <h1 style="margin:4px 0 0;color:#FAFAFA;font-size:22px;font-weight:700;line-height:1.3;">${opts.title}</h1>
      <p style="margin:4px 0 0;color:#71717A;font-size:13px;">${opts.dateRange}</p>
    </div>

    ${opts.sectionsHtml}

    ${cta}

    <div style="padding:24px 32px 28px;border-top:1px solid #27272A;margin-top:16px;">
      <p style="color:#52525B;font-size:11px;margin:0;line-height:1.6;">
        You received this because ${opts.kindLabel} emails are on.
        <a href="${opts.unsubscribeUrl}" style="color:#A1A1AA;text-decoration:underline;">Unsubscribe</a>
        or change your preferences in <a href="${appUrl()}/account" style="color:#A1A1AA;text-decoration:underline;">Account settings</a>.
      </p>
    </div>
  </div>
  <p style="color:#3F3F46;font-size:11px;text-align:center;margin:16px 0 0;">
    Acuity — notice patterns across your own words.
  </p>
</body>
</html>`.trim();
}

/**
 * Build one of the digest content sections. Caller passes inner
 * HTML already escaped. Kept tiny on purpose — digests are short.
 */
export function section(label: string, inner: string): string {
  return `
<div style="padding:16px 32px;border-top:1px solid #27272A;">
  <p style="margin:0 0 8px;color:#71717A;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:600;">${label}</p>
  <div style="color:#E4E4E7;font-size:14px;line-height:1.6;">${inner}</div>
</div>`;
}

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://www.getacuity.io"
  );
}

/** Conservative HTML escape for user-controlled text inside the digest. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
