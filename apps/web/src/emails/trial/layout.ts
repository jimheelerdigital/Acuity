/**
 * Shared HTML shell for every email in the trial onboarding sequence
 * (emails/trial/*.ts) and recovery emails. Light-mode design: white
 * canvas, dark text, small left-aligned logo, solid purple accents.
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
  unsubscribeUrl: string;
  preheader?: string;
}

export function trialLayout(opts: TrialLayoutOpts): string {
  const { content, unsubscribeUrl, preheader } = opts;
  const pre = preheader ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Acuity</title>
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${pre}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="padding-bottom:32px;">
              <img src="https://www.getacuity.io/AcuityLogoDark.png" alt="Acuity" width="36" height="36" />
            </td>
          </tr>
          ${content}
          <tr>
            <td style="padding:40px 0 16px;">
              <div style="height:1px;background:#E5E7EB;"></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.7;">
                <a href="https://getacuity.io" style="color:#7C5CFC;text-decoration:none;">getacuity.io</a>
                <span style="margin:0 8px;color:#E5E7EB;">&middot;</span>
                <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe from onboarding emails</a>
              </p>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0;font-size:11px;color:#9ca3af;">
                Acuity &middot; getacuity.io &middot; One minute a day.
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

/** Purple button used across the trial and recovery sequences. */
export function trialButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0;">
    <tr>
      <td style="background-color:#7C5CFC;border-radius:8px;text-align:center;">
        <a href="${href}" style="display:block;padding:14px 28px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

/** Subtle inset card used for quotes, recaps, stat blocks. */
export function trialCard(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="background-color:#F9FAFB;border-radius:12px;padding:24px;border-left:4px solid #7C5CFC;border:1px solid #E5E7EB;border-left:4px solid #7C5CFC;">
        ${inner}
      </td>
    </tr>
  </table>`;
}
