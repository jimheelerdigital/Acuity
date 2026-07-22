/**
 * Shared digest email shell. Richer than the transactional emailLayout
 * because digests carry sections: mood summary, themes, observations,
 * goals progress. Coral brand accents (#FF8A65 / #E06B46 button).
 * Declares color-scheme so dark-mode clients keep the explicit light
 * card instead of force-inverting it.
 *
 * Every caller supplies pre-escaped HTML sections. Don't pass raw
 * user input here — XSS-safe only when the caller escaped upstream.
 *
 * MARKETING footer. Unsubscribe link is mandatory — CAN-SPAM
 * compliance + matches the List-Unsubscribe header that upstream
 * senders should include.
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
           <a href="${opts.ctaUrl}" style="display:block;background:#E06B46;background:linear-gradient(135deg,#FFA47E 0%,#FF8A65 55%,#E06B46 100%);color:#FFFFFF;text-decoration:none;text-align:center;padding:14px 20px;border-radius:8px;font-weight:600;font-size:14px;">${opts.ctaLabel}</a>
         </div>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${opts.title}</title>
</head>
<body style="background:#FFFFFF;margin:0;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${opts.preheader}</span>
  <div style="max-width:560px;margin:0 auto;background:#F9FAFB;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">
    <div style="padding:28px 32px 16px;">
      <p style="margin:0;color:#9ca3af;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">${opts.kindLabel}</p>
      <h1 style="margin:4px 0 0;color:#1a1a1a;font-size:22px;font-weight:700;line-height:1.3;">${opts.title}</h1>
      <p style="margin:4px 0 0;color:#9ca3af;font-size:13px;">${opts.dateRange}</p>
    </div>

    ${opts.sectionsHtml}

    ${cta}

    <div style="padding:24px 32px 28px;border-top:1px solid #E5E7EB;margin-top:16px;">
      <p style="color:#9ca3af;font-size:11px;margin:0;line-height:1.6;">
        You received this because ${opts.kindLabel} emails are on.
        <a href="${opts.unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
        or change your preferences in <a href="${appUrl()}/account" style="color:#6b7280;text-decoration:underline;">Account settings</a>.
      </p>
    </div>
  </div>
  <p style="color:#6b7280;font-size:11px;text-align:center;margin:16px 0 0;">
    Ripple &middot; goripple.io
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
<div style="padding:16px 32px;border-top:1px solid #E5E7EB;">
  <p style="margin:0 0 8px;color:#9ca3af;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:600;">${label}</p>
  <div style="color:#374151;font-size:14px;line-height:1.6;">${inner}</div>
</div>`;
}

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://goripple.io"
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
