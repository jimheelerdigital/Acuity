/**
 * Founder notification email — sent to Keenan + Jimmy on every new
 * signup. Contains full attribution data and live counts.
 *
 * Uses the same trialLayout shell for brand consistency.
 */

import { trialLayout, trialButton, trialCard } from "./trial/layout";

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
    <td style="padding:6px 12px 6px 0;font-size:14px;color:#A0A0B8;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:14px;color:#FFFFFF;font-weight:500;">${value}</td>
  </tr>`;
}

export interface FounderNotificationVars {
  firstName: string;
  lastName: string;
  email: string;
  foundingMemberNumber: number | null;
  isFoundingMember: boolean;
  trialDays: number;
  signupUtmSource: string | null;
  signupUtmCampaign: string | null;
  signupLandingPath: string | null;
  signupReferrer: string | null;
  createdAt: Date;
  signupsTodayCount: number;
  foundingMembersClaimedCount: number;
}

export function founderNotificationSubject(v: FounderNotificationVars): string {
  const source = v.signupUtmSource || "direct";
  return `\u{1F389} New Acuity signup \u2014 ${v.firstName} (${source})`;
}

export function founderNotificationHtml(v: FounderNotificationVars): string {
  const name = esc(v.firstName);
  const last = v.lastName ? esc(v.lastName) : "(no last name)";
  const source = esc(v.signupUtmSource) || "direct";
  const campaign = esc(v.signupUtmCampaign) || "\u2014";
  const landing = esc(v.signupLandingPath) || "/";
  const referrer = esc(v.signupReferrer) || "\u2014";
  const fmLabel = v.foundingMemberNumber
    ? `#${v.foundingMemberNumber}`
    : "\u2014 (cap reached)";
  const trialLabel = `${v.trialDays} days`;
  const emailEncoded = encodeURIComponent(v.email);

  const signedUpAt = v.createdAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const content = `
    <tr>
      <td style="padding-bottom:20px;">
        <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
          A new user just signed up for Acuity.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:24px;">
        ${trialCard(`
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            ${row("Name", `${name} ${last}`)}
            ${row("Email", esc(v.email))}
            ${row("Founding Member", fmLabel)}
            ${row("Trial length", trialLabel)}
          </table>
        `)}
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#13131F;border-radius:12px;padding:16px 20px;">
          <tr><td style="padding:4px 0;">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#7C5CFC;">Attribution</p>
          </td></tr>
          ${row("Source", source)}
          ${row("Campaign", campaign)}
          ${row("Landing page", landing)}
          ${row("Referrer", referrer)}
          ${row("Signed up at", signedUpAt)}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#13131F;border-radius:12px;padding:16px 20px;">
          <tr><td style="padding:4px 0;">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#7C5CFC;">Counts</p>
          </td></tr>
          ${row("Signups today", String(v.signupsTodayCount))}
          ${row("Founding Members claimed", `${v.foundingMembersClaimedCount} / 100`)}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:28px;">
        ${trialButton(`https://www.getacuity.io/admin?tab=users&select=${emailEncoded}`, "View in Admin Dashboard")}
      </td>
    </tr>
    <tr>
      <td>
        <p style="margin:0;font-size:14px;color:#666;">\u2014 Acuity bot</p>
      </td>
    </tr>
  `;

  return trialLayout({
    content,
    unsubscribeUrl: "#",
    preheader: `New signup: ${v.firstName} from ${source}`,
  });
}
