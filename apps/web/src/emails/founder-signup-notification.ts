/**
 * Founder notification email — sent to Keenan + Jimmy on every new
 * signup. Simple: name, email, signup method, timestamp.
 */

import { trialLayout, trialCard } from "./trial/layout";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;font-size:14px;color:#6b7280;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:14px;color:#1a1a1a;font-weight:500;">${value}</td>
  </tr>`;
}

export interface FounderNotificationVars {
  firstName: string;
  email: string;
  signupMethod: string;
  timestamp: Date;
  campaign?: string | null;
  branch?: string | null;
  paymentStatus?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

export function founderNotificationSubject(v: FounderNotificationVars): string {
  return `\u{1F389} New Ripple signup \u2014 ${v.firstName} (${v.signupMethod})`;
}

export function founderNotificationHtml(v: FounderNotificationVars): string {
  const name = esc(v.firstName);
  const signedUpAt = v.timestamp.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const emailEncoded = encodeURIComponent(v.email);

  const content = `
    <tr>
      <td style="padding-bottom:20px;">
        <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
          A new user just signed up for Ripple.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:24px;">
        ${trialCard(`
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            ${row("Name", name)}
            ${row("Email", esc(v.email))}
            ${row("Signup method", esc(v.signupMethod))}
            ${row("Campaign", v.campaign ? esc(v.campaign) : "direct / organic")}
            ${row("Branch", v.branch ? esc(v.branch) : "unknown")}
            ${row("Payment", v.paymentStatus ? esc(v.paymentStatus) : "TRIAL")}
            ${v.utmSource ? row("UTM Source", esc(v.utmSource)) : ""}
            ${v.utmMedium ? row("UTM Medium", esc(v.utmMedium)) : ""}
            ${v.utmCampaign ? row("UTM Campaign", esc(v.utmCampaign)) : ""}
            ${row("Signed up at", signedUpAt)}
          </table>
        `)}
      </td>
    </tr>
    <tr>
      <td>
        <p style="margin:0;font-size:14px;color:#9ca3af;">\u2014 Ripple bot</p>
      </td>
    </tr>
  `;

  return trialLayout({
    content,
    footer: "transactional",
    preheader: `New signup: ${v.firstName} via ${v.signupMethod}`,
  });
}
