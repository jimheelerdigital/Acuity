/**
 * Ripple 1.9 release announcement — Android edition. One email, Android users
 * only. Companion to ripple-1-9.ts (iPhone).
 *
 * Audience (built upstream in scripts/ripple-1-9-android-send.ts): users with
 * Android app history and NO iOS history, not unsubscribed — so nobody who
 * got the iPhone email gets this one too.
 *
 * What's new is everything since the public Android 1.5.0 (Play production,
 * versionCode 40), verified against feat/1.9-android on 2026-10-13:
 *   - Habits (EXPO_PUBLIC_HABITS was off in the 1.5.0 build, on in 1.9)
 *   - Ask Your Past Self, native in-app (was a browser hand-off) — Pro
 *   - Home-screen widget: streak + today's habits, tap to start a check-in
 *   - Long-press app shortcuts (New Debrief, Ask Ripple, Habits)
 *   - Connect your own AI (read-only MCP access, revocable) — Pro, set up on web
 *   - Subscribe screen shows your current plan
 * NOT mentioned on purpose: Siri / Action Button / Lock Screen widgets
 * (iPhone-only), Apple Watch, calendar, Obsidian export (off in prod).
 *
 * Images: reuses the platform-neutral ask.png + ai.png from
 * /email/ripple-1-9/. The hero GIF and siri/widgets images show iPhone UI,
 * so Habits and the widget are text sections here.
 *
 * Voice per docs/acuity-positioning.md: a mirror, not a coach. No prices.
 */

import { escapeHtml } from "@/lib/escape-html";
import {
  keenanSignature,
  primaryButton,
  trialLayout,
  para,
} from "@/emails/trial/layout";

const IMG = "https://goripple.io/email/ripple-1-9";

/** Google Play listing. */
export const RIPPLE_1_9_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity";

/** Where Pro users set up "Connect your AI". */
const ACCOUNT_URL = "https://goripple.io/account";

export interface Ripple19AndroidVars {
  firstName: string | null;
  unsubscribeUrl: string;
}

function image(src: string, alt: string): string {
  return `<tr>
        <td style="padding-bottom:18px;">
          <img src="${src}" alt="${alt}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:18px;" />
        </td>
      </tr>`;
}

function feature(opts: {
  img: string;
  alt: string;
  title: string;
  pro?: boolean;
  body: string;
}): string {
  const proPill = opts.pro
    ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#FFE7DC;color:#C4451C;font-size:11px;font-weight:700;letter-spacing:0.6px;vertical-align:middle;">PRO</span>`
    : "";
  return `${image(opts.img, opts.alt)}
      <tr>
        <td style="padding-bottom:8px;">
          <h2 style="margin:0;font-size:20px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.2px;">${opts.title}${proPill}</h2>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:36px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${opts.body}</p>
        </td>
      </tr>`;
}

/** A feature section without an image (for features with no Android art). */
function textFeature(opts: { title: string; body: string }): string {
  return `<tr>
        <td style="padding-bottom:8px;">
          <h2 style="margin:0;font-size:20px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.2px;">${opts.title}</h2>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:36px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${opts.body}</p>
        </td>
      </tr>`;
}

export function ripple19AndroidAnnouncement(v: Ripple19AndroidVars): {
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
        <td style="padding-bottom:20px;">
          <h1 style="margin:0;font-size:28px;font-weight:800;color:#1a1a1a;line-height:1.25;letter-spacing:-0.5px;">
            Ripple 1.9 is here
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(
        `This is a big one for Android. Ripple now tracks your habits, sits on your home screen, and can answer questions about your own life right inside the app.`
      )}
      <tr>
        <td style="padding-bottom:28px;">
          ${primaryButton(RIPPLE_1_9_PLAY_URL, "Update Ripple")}
        </td>
      </tr>
      ${para(`Here\u2019s what\u2019s new.`)}
      <tr><td style="padding-bottom:12px;"></td></tr>

      ${textFeature({
        title: "Habits",
        body: `Pick a few habits and check them off right from Home. Ripple keeps your streak, and when you mention a habit in a check-in, it can tick it off for you.`,
      })}

      ${feature({
        img: `${IMG}/ask.png`,
        alt: "Ask your past self: a question and an answer drawn from your own journal entries, with the entries it came from",
        title: "Ask your past self, now built in",
        pro: true,
        body: `Ask a question about your own life — <em>“When did I last feel really calm?”</em> — and get an answer drawn from your entries, with the exact entries it came from. It now opens right in the app instead of sending you to the browser.`,
      })}

      ${textFeature({
        title: "A home screen widget",
        body: `See your streak and today’s habits without opening anything, and tap the widget to start a check-in. To add it, touch and hold an empty spot on your home screen, tap <strong>Widgets</strong>, and find Ripple. You can also touch and hold the Ripple icon to jump straight to a new debrief.`,
      })}

      ${feature({
        img: `${IMG}/ai.png`,
        alt: "Your Ripple journal connected read-only to your own AI assistant",
        title: "Bring your own AI",
        pro: true,
        body: `Already use an AI assistant? You can now give it read-only access to your journal, so it can answer with your real life in mind. It can’t change anything, and you can turn it off anytime. Set it up from <a href="${ACCOUNT_URL}" style="color:#C4451C;text-decoration:underline;">your account at goripple.io</a>.`,
      })}

      <tr>
        <td style="padding-bottom:28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:#FFF7F4;border-radius:12px;padding:20px 22px;border:1px solid #FFE4D9;">
                <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#C4451C;">Also in this update</p>
                <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">Your subscription screen now shows the plan you’re on, plus a lot of fixes and polish.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      ${para(`It’s all in the latest version. Update and it’ll be waiting for you.`)}
      <tr>
        <td style="padding-bottom:12px;">
          ${primaryButton(RIPPLE_1_9_PLAY_URL, "Update on Google Play")}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;text-align:center;">If you have automatic updates on, you may already have it — just open Ripple.</p>
        </td>
      </tr>
      ${para(`Thanks for being here. If you try any of this, hit reply and tell me what you think — I read every one.`)}
      ${keenanSignature()}
    `;

  return {
    subject: "Ripple 1.9: habits, a home screen widget, and Ask your past self",
    html: trialLayout({
      content,
      footer: "marketing",
      unsubscribeUrl: v.unsubscribeUrl,
      preheader:
        "Track habits, see your streak on your home screen, and ask questions about your own life.",
    }),
  };
}
