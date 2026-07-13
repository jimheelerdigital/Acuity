import { escapeHtml } from "@/lib/escape-html";
import { MONTHLY_PRICE_CENTS, formatDollars } from "@/lib/pricing";
import { trialButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const PRICE = formatDollars(MONTHLY_PRICE_CENTS);

function statRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:14px 0;border-bottom:1px solid #2A2A3A;">
      <table role="presentation" width="100%"><tr>
        <td style="font-size:14px;color:#6b7280;">${label}</td>
        <td align="right" style="font-size:18px;color:#1a1a1a;font-weight:700;">${value}</td>
      </tr></table>
    </td>
  </tr>`;
}

export const valueRecap: TrialEmailTemplate = {
  subject: () => "12 days in — here's what Ripple has of yours",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);
    const topTheme = v.topTheme ? escapeHtml(v.topTheme) : "—";
    const trialEnd = escapeHtml(v.trialEndsAt);

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            ${name}, here's what Ripple has of yours.
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
            Twelve days of nightly debriefs. This is what's in your account right now.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#13131F;border-radius:12px;padding:8px 24px;">
            ${statRow("Total debriefs", String(v.totalRecordings))}
            ${statRow("Top recurring theme", topTheme)}
            ${statRow("Trial ends", trialEnd)}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
            This is yours. All of it stays if you keep going. Starting ${trialEnd}, it's ${PRICE}/month.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
            No hard sell. Just — keep going.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(appUrl, "Keep going")}
        </td>
      </tr>
      <tr>
        <td>
          <p style="margin:0;font-size:16px;color:#1a1a1a;font-weight:600;">— Jim &amp; Keenan</p>
        </td>
      </tr>
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Twelve days in. Here's what's already in your account.",
    });
  },
};
