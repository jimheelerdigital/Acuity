/**
 * Shared HTML shell for every email in the trial onboarding sequence
 * (emails/trial/*.ts) and recovery emails. White canvas, dark text,
 * small left-aligned logo, coral accents (#FF8A65 brand / #E06B46
 * button). Declares color-scheme so dark-mode clients keep our explicit
 * light card rather than force-inverting it.
 *
 * MARKETING footer: includes the one-click unsubscribe required on
 * lifecycle/marketing sends. Senders pair this with a List-Unsubscribe
 * header (see weekly-digest.ts for the header wiring).
 *
 * Contract:
 *   - `content` is pre-built HTML that goes inside the main 560px
 *     table. Each email builds its own content with
 *     HTML-escaped user values via `escapeHtml` before passing in.
 *   - `unsubscribeUrl` is required on EVERY trial email — legal
 *     requirement. Orchestrator fills it with the per-user token URL.
 *   - `preheader` is the inbox preview line (<= ~90 chars).
 */

export interface TrialLayoutOpts {
  content: string;
  /**
   * Required for the marketing footer (legal one-click unsubscribe).
   * Optional/ignored when footer is "transactional" — auth and
   * internal emails carry no marketing unsubscribe.
   */
  unsubscribeUrl?: string;
  preheader?: string;
  /**
   * "marketing" (default) renders the one-click unsubscribe line for
   * lifecycle sends. "transactional" renders sender info only — used
   * by welcome+verify and internal founder notifications, which reuse
   * this richer shell for deliverability but must not invite an
   * onboarding unsubscribe.
   */
  footer?: "marketing" | "transactional";
}

export function trialLayout(opts: TrialLayoutOpts): string {
  const { content, unsubscribeUrl, preheader } = opts;
  const pre = preheader ?? "";
  const isMarketing = (opts.footer ?? "marketing") === "marketing";

  const footerLinks = isMarketing
    ? `<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.7;">
                <a href="https://getacuity.io" style="color:#C4451C;text-decoration:none;">getacuity.io</a>
                <span style="margin:0 8px;color:#E5E7EB;">&middot;</span>
                <a href="${unsubscribeUrl ?? "https://getacuity.io/account"}" style="color:#6b7280;text-decoration:underline;">Unsubscribe from onboarding emails</a>
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
  <title>Acuity</title>
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${pre}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          ${content}
          <tr>
            <td style="padding:40px 0 16px;">
              <div style="height:1px;background:#E5E7EB;"></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:8px;">
              ${footerLinks}
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0;font-size:11px;color:#6b7280;">
                Acuity &middot; getacuity.io
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

/** Public URL of Keenan's headshot, hosted alongside the other email
 *  assets. Used by keenanSignature(). */
export const KEENAN_HEADSHOT_URL =
  "https://www.getacuity.io/email/keenan-updated-headshot.png";

/** Keenan's signature block — a small circular headshot next to his name
 *  and title. Used by every email that goes out personally from Keenan so
 *  they all sign off the same way. Reads cleanly with images off: the
 *  name and title are real text, the photo carries descriptive alt text.
 *  Returns a table row, so drop it straight into a trialLayout content
 *  string (optionally after a "Talk soon," line). */
export function keenanSignature(): string {
  return `<tr>
        <td>
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle" style="padding-right:12px;">
                <img src="${KEENAN_HEADSHOT_URL}" alt="Keenan, founder of Acuity" width="52" height="52" style="display:block;width:52px;height:52px;border-radius:50%;" />
              </td>
              <td valign="middle">
                <p style="margin:0;font-size:16px;color:#1a1a1a;font-weight:600;">Keenan</p>
                <p style="margin:0;font-size:13px;color:#6b7280;">Co-founder, Acuity</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
}

/**
 * Standardized email buttons. Every email should use primaryButton() for
 * the dominant action and secondaryButton() for the alternate/fallback,
 * so button styling stays consistent everywhere and future emails just
 * call these helpers.
 *
 * Both are table-based with inline styles only (no flexbox/modern CSS) so
 * they survive Outlook's Word rendering engine, and both declare explicit
 * colors against an explicit background so dark-mode clients that force a
 * light card (we set color-scheme on the layout) keep them legible.
 *
 * PRIMARY: solid deep coral (#E06B46) fill — white label clears WCAG AA —
 * with a coral gradient overlay for clients that render it. Full-width.
 * SECONDARY: ghost/outline — white fill, 2px coral border, coral label
 * (#C4451C clears AA on white). Same size + shape as primary, visually
 * subordinate. The white fill (not transparent) keeps the coral text and
 * border readable even where a client inverts the canvas.
 */
export function primaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0;">
    <tr>
      <td style="background-color:#E06B46;background:linear-gradient(135deg,#FFA47E 0%,#FF8A65 55%,#E06B46 100%);border-radius:8px;text-align:center;">
        <a href="${href}" style="display:block;padding:14px 28px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

export function secondaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0;">
    <tr>
      <td style="background-color:#FFFFFF;border:2px solid #E06B46;border-radius:8px;text-align:center;">
        <a href="${href}" style="display:block;padding:12px 26px;font-size:15px;font-weight:700;color:#C4451C;text-decoration:none;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

/** Back-compat alias — existing emails call trialButton; it now routes
 *  through the standardized primary button so styling stays in one place. */
export function trialButton(href: string, label: string): string {
  return primaryButton(href, label);
}

/** Subtle inset card used for quotes, recaps, stat blocks. Coral
 *  left-accent. */
export function trialCard(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="background-color:#F9FAFB;border-radius:12px;padding:24px;border:1px solid #E5E7EB;border-left:4px solid #FF8A65;">
        ${inner}
      </td>
    </tr>
  </table>`;
}
