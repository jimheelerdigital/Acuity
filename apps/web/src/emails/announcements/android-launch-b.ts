/**
 * One-off Android-launch companion send — Segment B (App Store re-nudge).
 *
 * Audience: users who never recorded a debrief, have no app platform
 * registered, and whose signup OS was iOS ("ios" variant) or unknown/desktop
 * ("generic" variant). This isn't an Android-specific note — it's a gentle
 * re-nudge to actually start, sent alongside the Android launch push.
 *
 * Voice per docs/acuity-positioning.md: a mirror, not a coach. Light-mode,
 * marketing footer (one-click unsubscribe). Segment B campaign = ios_renudge.
 *
 *  - "ios" variant: App Store button primary + web-app secondary.
 *  - "generic" variant (unknown/desktop): no OS-specific framing — web app is
 *    primary, and both stores are offered as text links.
 */

import { escapeHtml } from "@/lib/escape-html";
import {
  keenanSignature,
  primaryButton,
  secondaryButton,
  trialLayout,
  para,
} from "@/emails/trial/layout";
import type { AnnouncementVars } from "./android-launch-a";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity";

const UTM = "utm_source=email&utm_medium=rescue&utm_campaign=ios_renudge";

/** App Store URL has no existing query, so UTM is appended with `?`. */
export const SEGMENT_B_APP_STORE_LINK = `${APP_STORE_URL}?${UTM}`;
/** Play Store base URL already carries `?id=...`, so UTM appends with `&`. */
const SEGMENT_B_PLAY_LINK = `${PLAY_STORE_URL}&${UTM}`;
const WEB_APP_LINK = `https://getacuity.io/home?${UTM}`;

export type SegmentBVariant = "ios" | "generic";

export function androidLaunchB(
  v: AnnouncementVars & { variant: SegmentBVariant }
): { subject: string; html: string } {
  const rawFirst = (v.firstName ?? "").trim();
  const greeting =
    rawFirst && rawFirst.toLowerCase() !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

  const ctaBlock =
    v.variant === "ios"
      ? `
      <tr>
        <td style="padding-bottom:8px;">
          ${primaryButton(SEGMENT_B_APP_STORE_LINK, "Download on the App Store")}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          ${secondaryButton(WEB_APP_LINK, "Use the web version")}
        </td>
      </tr>`
      : `
      <tr>
        <td style="padding-bottom:8px;">
          ${primaryButton(WEB_APP_LINK, "Open the web app")}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;">
            Prefer the app? Get it on
            <a href="${SEGMENT_B_APP_STORE_LINK}" style="color:#C4451C;text-decoration:underline;">the App Store</a>
            or
            <a href="${SEGMENT_B_PLAY_LINK}" style="color:#C4451C;text-decoration:underline;">Google Play</a>.
          </p>
        </td>
      </tr>`;

  const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            your first debrief is still waiting
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(
        `A while back you signed up for Acuity \u2014 and then never recorded your first debrief. No judgment; life fills up and good intentions quietly stall.`
      )}
      ${para(
        `But I didn\u2019t want you to miss the point of it. You open Acuity, talk for a few minutes about whatever\u2019s on your mind, and it gives you back a clearer read on your own life \u2014 the tasks you mentioned and forgot, the patterns you can\u2019t see yourself, where your energy is actually going.`
      )}
      ${para(`One debrief and you\u2019ll get what it\u2019s actually about.`)}
      ${ctaBlock}
      ${keenanSignature()}
    `;

  return {
    subject: "your first debrief is still waiting",
    html: trialLayout({
      content,
      footer: "marketing",
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "You signed up for Acuity but never recorded \u2014 here\u2019s the app.",
    }),
  };
}
