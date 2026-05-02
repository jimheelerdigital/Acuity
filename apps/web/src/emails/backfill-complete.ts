/**
 * Backfill-complete email — sent at the end of the v1.1 slice 5
 * "Process my history" Inngest run. One email per backfill, per
 * docs/v1-1/free-tier-phase2-plan.md §A.5.
 *
 * Subject: "Acuity processed your past entries"
 * Body shape:
 *   Hey {{name}},
 *
 *   We extracted themes, tasks, and goal flags from {{recentCount}}
 *   of your recordings. They're live on your dashboard now.
 *
 *   {{#if olderCount}}
 *   You have {{olderCount}} older entries (recorded more than 60
 *   days ago) that we didn't process this round. If you'd like
 *   those extracted too, you can kick off a second pass from your
 *   account settings: getacuity.io/account
 *   {{/if}}
 *
 *   — Acuity
 *
 * Same brand layout as the other transactional emails in this dir.
 */

export interface BackfillCompleteVars {
  firstName: string;
  recentCount: number;
  olderCount: number;
  /** Origin used in the /account link. Defaults to production. */
  baseUrl?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function backfillCompleteSubject(): string {
  return "Acuity processed your past entries";
}

export function backfillCompleteHtml(v: BackfillCompleteVars): string {
  const name = esc(v.firstName || "there");
  const baseUrl = (v.baseUrl ?? "https://app.getacuity.io").replace(/\/+$/, "");
  const recentLine = `We extracted themes, tasks, and goal flags from ${v.recentCount} of your recordings. They're live on your dashboard now.`;
  const olderBlock =
    v.olderCount > 0
      ? `<p style="margin:16px 0 0;font-size:15px;line-height:1.55;color:#374151;">You have ${v.olderCount} older ${v.olderCount === 1 ? "entry" : "entries"} (recorded more than 60 days ago) that we didn't process this round. If you'd like ${v.olderCount === 1 ? "it" : "those"} extracted too, you can kick off a second pass from your <a href="${baseUrl}/account#integrations" style="color:#7C3AED;text-decoration:underline;">account settings</a>.</p>`
      : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Acuity processed your past entries</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E5E5EB;border-radius:12px;">
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.55;">Hey ${name},</p>
              <p style="margin:0;font-size:15px;line-height:1.55;color:#374151;">${esc(recentLine)}</p>
              ${olderBlock}
              <p style="margin:24px 0 0;font-size:15px;color:#9CA3AF;">— Acuity</p>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0;font-size:11px;color:#9CA3AF;">
          You're receiving this because you upgraded to Acuity Pro and asked
          us to process your past recordings.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
