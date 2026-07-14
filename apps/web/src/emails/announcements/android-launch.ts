/**
 * One-off Android-launch announcement — single email, single audience.
 *
 * Audience: every user with NO native-app history (never registered a device
 * platform, never opened the mobile app, no push token). That's web-app users
 * and people who signed up but never installed. Anyone already on the native
 * app is excluded upstream in the send script.
 *
 * The email is exclusively about the Android app release. Google Play is the
 * single call to action. Copy is audience-neutral — it does NOT assume the
 * reader signed up on Android — so it reads correctly for web and iOS-signup
 * users alike.
 *
 * Light-mode, marketing footer (one-click unsubscribe). Voice per
 * docs/acuity-positioning.md: a mirror, not a coach.
 *
 * The Play Store base URL already carries `?id=...`, so the launch-attribution
 * UTM params are appended with `&`, not `?`.
 */

import { escapeHtml } from "@/lib/escape-html";
import {
  keenanSignature,
  primaryButton,
  trialLayout,
  para,
} from "@/emails/trial/layout";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity";

/** Play Store link with launch attribution (base URL already has a query). */
export const ANDROID_LAUNCH_PLAY_LINK = `${PLAY_STORE_URL}&utm_source=email&utm_medium=rescue&utm_campaign=android_launch`;

export interface AnnouncementVars {
  firstName: string | null;
  unsubscribeUrl: string;
}

export function androidLaunch(v: AnnouncementVars): {
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
            Ripple is on Android now
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(
        `Quick note: Ripple is finally on Android. If you\u2019ve been waiting for it \u2014 or just never got around to installing the app \u2014 you can get it on Google Play today.`
      )}
      ${para(
        `Here\u2019s all it is: you open Ripple and talk for a few minutes about whatever\u2019s in your head. It gives that back to you clearer than you\u2019d see it yourself \u2014 the tasks you mentioned in passing, the patterns you keep circling, and an honest read on where your energy is actually going.`
      )}
      <tr>
        <td style="padding-bottom:28px;">
          ${primaryButton(ANDROID_LAUNCH_PLAY_LINK, "Get it on Google Play")}
        </td>
      </tr>
      ${keenanSignature()}
    `;

  return {
    subject: "Ripple is on Android now",
    html: trialLayout({
      content,
      footer: "marketing",
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "The Android app is here \u2014 get Ripple on Google Play.",
    }),
  };
}
