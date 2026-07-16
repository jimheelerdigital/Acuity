/**
 * Shared HTML shell for every email in the trial onboarding sequence
 * (emails/trial/*.ts) and recovery emails.
 *
 * DESIGN (2026-06-27 refresh):
 *   - Branded coral header: thin 3px coral top border + text-based
 *     "acuity" wordmark in coral (#E06B46). No images — text-only
 *     wordmark survives image-blocking and doesn't trip spam filters.
 *   - Clean hierarchy: headline (bold, dark) → body (gray #374151,
 *     1.7 line-height) → coral emphasis → CTA.
 *   - Generous whitespace: 48px top/bottom padding, 24px between
 *     sections.
 *   - Coral accent used with restraint: header, links, buttons,
 *     emphasis text, card left-border, dividers.
 *   - Dark-mode safe: explicit color-scheme, explicit backgrounds,
 *     coral (#E06B46 / #FF8A65) clears WCAG AA on both light and
 *     dark canvases.
 *
 * MARKETING footer: includes one-click unsubscribe (legal requirement).
 * TRANSACTIONAL footer: sender info only.
 *
 * Contract:
 *   - `content` is pre-built HTML that goes inside the main 560px table.
 *   - `unsubscribeUrl` required on marketing emails (legal).
 *   - `preheader` is the inbox preview line (<= ~90 chars).
 */

export interface TrialLayoutOpts {
  content: string;
  unsubscribeUrl?: string;
  preheader?: string;
  footer?: "marketing" | "transactional";
}

export function trialLayout(opts: TrialLayoutOpts): string {
  const { content, unsubscribeUrl, preheader } = opts;
  const pre = preheader ?? "";
  const isMarketing = (opts.footer ?? "marketing") === "marketing";

  const footerLinks = isMarketing
    ? `<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.7;">
                <a href="https://getacuity.io" style="color:#C4451C;text-decoration:none;">getacuity.io</a>
                <span style="margin:0 8px;color:#D1D5DB;">&middot;</span>
                <a href="${unsubscribeUrl ?? "https://getacuity.io/account"}" style="color:#9CA3AF;text-decoration:underline;">Unsubscribe from onboarding emails</a>
              </p>`
    : `<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.7;">
                <a href="https://getacuity.io" style="color:#C4451C;text-decoration:none;">getacuity.io</a>
              </p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>Ripple</title>
</head>
<body style="margin:0;padding:0;background-color:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${pre}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9FAFB;">
    <tr>
      <td align="center" style="padding:32px 20px 40px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- ── Branded header: coral top border + wordmark ── -->
          <tr>
            <td style="padding-bottom:32px;">
              <div style="height:3px;background:linear-gradient(90deg,#FF8A65,#E06B46);border-radius:2px;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#E06B46;letter-spacing:1.5px;text-transform:lowercase;">ripple</p>
            </td>
          </tr>
          <!-- ── Content ── -->
          ${content}
          <!-- ── Footer ── -->
          <tr>
            <td style="padding:36px 0 16px;">
              <div style="height:1px;background:linear-gradient(90deg,#FFD4C4,#E5E7EB,#FFD4C4);"></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:8px;">
              ${footerLinks}
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0;font-size:11px;color:#9CA3AF;">
                Ripple &middot; getacuity.io
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Public URL of Keenan's headshot. */
export const KEENAN_HEADSHOT_URL =
  "https://www.getacuity.io/email/ka-headshot-email.png";

/** Keenan's signature block — headshot + name/title. */
export function keenanSignature(): string {
  return `<tr>
        <td style="padding-top:8px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle" style="padding-right:12px;">
                <img src="${KEENAN_HEADSHOT_URL}" alt="Keenan, co-founder of Ripple" width="52" height="52" style="display:block;width:52px;height:52px;border-radius:50%;" />
              </td>
              <td valign="middle">
                <p style="margin:0;font-size:16px;color:#1a1a1a;font-weight:600;">Keenan</p>
                <p style="margin:0;font-size:13px;color:#6b7280;">Co-founder, Ripple</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
}

/**
 * Standardized email buttons.
 *
 * PRIMARY: solid deep coral (#E06B46) fill with gradient overlay.
 * Rounded corners, generous padding. Full-width.
 *
 * SECONDARY: ghost/outline — white fill, 2px coral border, coral label.
 * Same size + shape, visually subordinate.
 */
export function primaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0;">
    <tr>
      <td style="background-color:#E06B46;background:linear-gradient(135deg,#FFA47E 0%,#FF8A65 55%,#E06B46 100%);border-radius:10px;text-align:center;">
        <a href="${href}" style="display:block;padding:16px 28px;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;letter-spacing:0.2px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

export function secondaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0;">
    <tr>
      <td style="background-color:#FFFFFF;border:2px solid #FFB89E;border-radius:10px;text-align:center;">
        <a href="${href}" style="display:block;padding:14px 26px;font-size:15px;font-weight:600;color:#C4451C;text-decoration:none;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

/** Back-compat alias. */
export function trialButton(href: string, label: string): string {
  return primaryButton(href, label);
}

/** Canonical store URLs — both apps are live (Android launched 2026-07). */
export const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity";

/**
 * Cross-platform download CTA: App Store + Google Play side by side.
 *
 * Emails can't OS-detect (static HTML) and SVG store badges are unreliable
 * across mail clients (Gmail strips SVG), so these are text buttons where the
 * store NAME is the label and the tap target. That also removes any ambiguity
 * about which app to install — the button says the store. Two-column table is
 * the most mail-client-safe way to lay them out; falls back to stacked on
 * narrow widths.
 */
export function appStoreAndPlayButtons(
  appStoreUrl: string = APP_STORE_URL,
  playStoreUrl: string = PLAY_STORE_URL,
): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0;">
    <tr>
      <td width="50%" valign="top" style="padding-right:5px;">${primaryButton(appStoreUrl, "App Store")}</td>
      <td width="50%" valign="top" style="padding-left:5px;">${primaryButton(playStoreUrl, "Google Play")}</td>
    </tr>
  </table>`;
}

/** Subtle inset card — coral left-accent. Used for quotes, insights. */
export function trialCard(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="background-color:#FFF7F4;border-radius:12px;padding:24px;border:1px solid #FFE4D9;border-left:4px solid #FF8A65;">
        ${inner}
      </td>
    </tr>
  </table>`;
}

/**
 * Standard paragraph — centralized so all templates inherit consistent
 * typography. 16px, gray (#374151), generous line-height.
 */
export function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

/**
 * Coral emphasis paragraph — for ONE key punch line per email.
 * Slightly larger, coral color, semi-bold. Used sparingly for the
 * single phrase you want to land (e.g. "It compounds." or "top 1%").
 */
export function emphasis(text: string): string {
  return `<tr><td style="padding:8px 0 28px;"><p style="margin:0;font-size:17px;color:#E06B46;font-weight:600;line-height:1.6;">${text}</p></td></tr>`;
}

/**
 * Coral-accented list item — for value/insight bullets.
 * Small coral dot marker + clean spacing.
 */
export function coralListItem(text: string): string {
  return `<tr><td style="padding-bottom:12px;padding-left:4px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td valign="top" style="padding-right:10px;padding-top:6px;">
        <div style="width:6px;height:6px;background:#FF8A65;border-radius:50%;"></div>
      </td>
      <td><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td>
    </tr></table>
  </td></tr>`;
}
