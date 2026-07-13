/**
 * One-off Android-launch announcement — Segment A.
 *
 * Audience: users whose signup funnel events show os:android AND who have
 * never recorded a debrief. They signed up (very likely on an Android phone)
 * back when there was no Android app to install, so they hit a wall. This is
 * the "the app is finally here" note.
 *
 * Light-mode, plain, matches the trial/recovery email language. Voice per
 * docs/acuity-positioning.md: a mirror, not a coach. Sent as a marketing
 * email (one-click unsubscribe footer required).
 *
 * The Play Store link is the exact store URL with launch-attribution UTM
 * params appended. NOTE the base URL already carries `?id=...`, so UTM is
 * appended with `&`, not `?`.
 */

import { escapeHtml } from "@/lib/escape-html";
import {
  keenanSignature,
  primaryButton,
  secondaryButton,
  trialLayout,
  para,
} from "@/emails/trial/layout";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity";

/** Play Store link with launch attribution (base URL already has a query). */
export const SEGMENT_A_PLAY_LINK = `${PLAY_STORE_URL}&utm_source=email&utm_medium=rescue&utm_campaign=android_launch`;

/** Web-app link, also UTM-tagged so web starts stay attributable. */
const WEB_APP_LINK =
  "https://getacuity.io/home?utm_source=email&utm_medium=rescue&utm_campaign=android_launch";

export interface AnnouncementVars {
  firstName: string | null;
  unsubscribeUrl: string;
}

export function androidLaunchA(v: AnnouncementVars): {
  subject: string;
  html: string;
} {
  const rawFirst = (v.firstName ?? "").trim();
  const greeting =
    rawFirst && rawFirst.toLowerCase() !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

  const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Acuity is on Android now
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(
        `When you signed up for Acuity, there was one thing missing: an Android app. You did the hard part and then hit a wall \u2014 and I\u2019m sorry it took us this long to fix it.`
      )}
      ${para(
        `It\u2019s live now. Acuity is on Google Play, so you can finally use the thing you signed up for.`
      )}
      ${para(
        `Here\u2019s all it is: you open the app and talk for a few minutes about whatever\u2019s in your head. Acuity gives it back to you clearer than you\u2019d see it yourself \u2014 the tasks you mentioned in passing, the patterns you keep circling, and an honest read on where your energy is actually going.`
      )}
      <tr>
        <td style="padding-bottom:8px;">
          ${primaryButton(SEGMENT_A_PLAY_LINK, "Get it on Google Play")}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          ${secondaryButton(WEB_APP_LINK, "Use the web version")}
        </td>
      </tr>
      ${keenanSignature()}
    `;

  return {
    subject: "Acuity is on Android now",
    html: trialLayout({
      content,
      footer: "marketing",
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "The app you signed up for is finally on Google Play.",
    }),
  };
}
