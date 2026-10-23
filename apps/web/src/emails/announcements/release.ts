/**
 * Generic release announcement (Miro: "Formalize email cadence to announce
 * product releases", 2026-10-23).
 *
 * Every release used to need a bespoke email file + send script
 * (ripple-1-9.ts, android-launch.ts). Now a release is one entry in
 * ./releases.ts and the same template + scripts/release-announce-send.ts
 * handle it. Bespoke emails are still fine for a big launch.
 *
 * Voice per docs/acuity-positioning.md: a mirror, not a coach. No prices.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, trialLayout, para } from "@/emails/trial/layout";

/** App Store listing (numeric id is canonical). */
export const APP_STORE_URL = "https://apps.apple.com/us/app/ripple-ai-voice-journal/id6762633410";
/** Google Play listing. */
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity";

export type ReleaseFeature = {
  title: string;
  /** Trusted HTML (written by us in releases.ts). */
  body: string;
  pro?: boolean;
  /** Optional hosted image (https://goripple.io/email/...). */
  img?: { src: string; alt: string };
};

export type ReleaseEmail = {
  version: string;
  /** Which store's users get it, and where the button points. */
  platform: "ios" | "android";
  subject: string;
  preheader: string;
  headline: string;
  intro: string;
  features: ReleaseFeature[];
  /** Small items, one line each, in an "Also in this update" box. */
  also?: string[];
};

export type ReleaseVars = { firstName: string | null; unsubscribeUrl: string };

function featureBlock(f: ReleaseFeature): string {
  const pro = f.pro
    ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#FFE7DC;color:#C4451C;font-size:11px;font-weight:700;letter-spacing:0.6px;vertical-align:middle;">PRO</span>`
    : "";
  const img = f.img
    ? `<tr><td style="padding-bottom:18px;"><img src="${f.img.src}" alt="${escapeHtml(f.img.alt)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:18px;" /></td></tr>`
    : "";
  return `${img}
      <tr>
        <td style="padding-bottom:8px;">
          <h2 style="margin:0;font-size:20px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.2px;">${escapeHtml(f.title)}${pro}</h2>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${f.body}</p>
        </td>
      </tr>`;
}

export function releaseAnnouncement(r: ReleaseEmail, v: ReleaseVars): { subject: string; html: string } {
  const first = (v.firstName ?? "").trim();
  const greeting = first && first.toLowerCase() !== "friend" ? `Hi ${escapeHtml(first)},` : "Hi there,";
  const storeUrl = r.platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
  const storeName = r.platform === "ios" ? "the App Store" : "Google Play";
  const also =
    r.also && r.also.length > 0
      ? `<tr>
        <td style="padding-bottom:28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:#FFF7F4;border-radius:12px;padding:20px 22px;border:1px solid #FFE4D9;">
                <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#C4451C;">Also in this update</p>
                ${r.also.map((line) => `<p style="margin:0 0 4px;font-size:15px;color:#374151;line-height:1.7;">${line}</p>`).join("")}
              </td>
            </tr>
          </table>
        </td>
      </tr>`
      : "";

  const content = `
      <tr>
        <td style="padding-bottom:20px;">
          <h1 style="margin:0;font-size:28px;font-weight:800;color:#1a1a1a;line-height:1.25;letter-spacing:-0.5px;">${escapeHtml(r.headline)}</h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(r.intro)}
      <tr>
        <td style="padding-bottom:28px;">
          ${primaryButton(storeUrl, "Update Ripple")}
        </td>
      </tr>
      ${r.features.map(featureBlock).join("\n")}
      ${also}
      ${para(`It’s all in the latest version. Update and it’ll be waiting for you.`)}
      <tr>
        <td style="padding-bottom:12px;">
          ${primaryButton(storeUrl, `Update in ${storeName}`)}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;text-align:center;">If you have automatic updates on, you may already have it. Just open Ripple.</p>
        </td>
      </tr>
      ${para(`Thanks for being here. If you try any of this, hit reply and tell me what you think. I read every one.`)}
      ${keenanSignature()}
    `;

  return {
    subject: r.subject,
    html: trialLayout({ content, footer: "marketing", unsubscribeUrl: v.unsubscribeUrl, preheader: r.preheader }),
  };
}
