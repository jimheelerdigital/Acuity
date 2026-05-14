/**
 * Shared HTML shell for every email in the trial onboarding sequence
 * (emails/trial/*.ts). Matches the dark-mode aesthetic of the app and
 * the existing transactional email templates — #0A0A0F canvas, #13131F
 * inset card, #7C5CFC brand accent.
 *
 * Contract:
 *   - `content` is pre-built HTML that goes inside the main 600px
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
<body style="margin:0;padding:0;background-color:#0A0A0F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${pre}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0F;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="https://www.getacuity.io/AcuityLogo.png" alt="Acuity" width="44" height="44" />
            </td>
          </tr>
          ${content}
          <tr>
            <td style="padding:40px 0 16px;">
              <div style="height:1px;background:linear-gradient(to right,transparent,#2A2A3A,transparent);"></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <p style="margin:0;font-size:12px;color:#A0A0B8;line-height:1.7;">
                <a href="https://getacuity.io" style="color:#7C5CFC;text-decoration:none;">getacuity.io</a>
                <span style="margin:0 8px;color:#2A2A3A;">·</span>
                <a href="${unsubscribeUrl}" style="color:#A0A0B8;text-decoration:underline;">Unsubscribe from onboarding emails</a>
              </p>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0;font-size:11px;color:#666;">
                Acuity · Debrief daily. See your life clearly.
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

/** Purple pill button used across the trial sequence. */
export function trialButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0;">
    <tr>
      <td style="background-color:#7C5CFC;border-radius:999px;">
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
      <td style="background-color:#13131F;border-radius:12px;padding:24px;border-left:4px solid #7C5CFC;">
        ${inner}
      </td>
    </tr>
  </table>`;
}
