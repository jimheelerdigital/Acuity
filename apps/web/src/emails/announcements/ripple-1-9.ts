/**
 * Ripple 1.9 release announcement — one email, iPhone users only.
 *
 * Audience (built upstream in scripts/ripple-1-9-send.ts): users with iOS app
 * history (devicePlatform or pushTokenPlatform = "ios") who are not
 * unsubscribed. 1.9 is an iOS release and Siri / widgets are iPhone-only, so
 * the single CTA is "Update in the App Store".
 *
 * What's new is everything since the public 1.6.0 (Growth). Verified against
 * the 1.9.0 build branch (feat/1.9.0-final) on 2026-09-29:
 *   - Ask Your Past Self, native in-app (was a browser hand-off) — Pro
 *   - Siri / Shortcuts / Action Button intents (check-in, add habit, add task,
 *     check off a habit, streak, Ask Ripple)
 *   - Home Screen (small/medium) + Lock Screen widgets: streak + today's habits
 *   - Connect your own AI (read-only MCP access, revocable) — Pro, set up on web
 *   - Subscribe screen shows your current plan; monthly can switch to annual
 * NOT mentioned on purpose: Apple Watch (held out of 1.9.0), calendar (not
 * shipped), Obsidian export (behind EXPO_PUBLIC_OBSIDIAN_EXPORT, off in prod).
 *
 * Images are hosted from apps/web/public/email/ripple-1-9/ (served at
 * https://goripple.io/email/ripple-1-9/*). Every image has alt text and the
 * copy stands on its own, so the email still reads with images blocked.
 * The hero is an animated GIF (works in Gmail/Apple Mail; Outlook desktop
 * shows the first frame, which is a complete still).
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

/** App Store listing. The numeric id is canonical; the slug is cosmetic. */
export const RIPPLE_1_9_APP_STORE_URL =
  "https://apps.apple.com/us/app/ripple-ai-voice-journal/id6762633410";

/** Where Pro users set up "Connect your AI". */
const ACCOUNT_URL = "https://goripple.io/account";

export interface Ripple19Vars {
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

export function ripple19Announcement(v: Ripple19Vars): {
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
        <td style="padding-bottom:28px;">
          <a href="${RIPPLE_1_9_APP_STORE_URL}" style="text-decoration:none;">
            <img src="${IMG}/hero.gif" alt="Ripple 1.9 — Siri, widgets, Ask your past self, and bring your own AI" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:18px;" />
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <h1 style="margin:0;font-size:28px;font-weight:800;color:#1a1a1a;line-height:1.25;letter-spacing:-0.5px;">
            Ripple 1.9 is here
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(
        `This update is about meeting you where you already are. Ripple now lives on your Home Screen and Lock Screen, answers to Siri, and can answer questions about your own life right inside the app.`
      )}
      <tr>
        <td style="padding-bottom:28px;">
          ${primaryButton(RIPPLE_1_9_APP_STORE_URL, "Update Ripple")}
        </td>
      </tr>
      ${para(`Here\u2019s what\u2019s new.`)}
      <tr><td style="padding-bottom:12px;"></td></tr>

      ${feature({
        img: `${IMG}/ask.png`,
        alt: "Ask your past self: a question and an answer drawn from your own journal entries, with the entries it came from",
        title: "Ask your past self, now built in",
        pro: true,
        body: `Ask a question about your own life — <em>“When did I last feel really calm?”</em> — and get an answer drawn from your entries, with the exact entries it came from. It now opens right in the app instead of sending you to the browser.`,
      })}

      ${feature({
        img: `${IMG}/siri.png`,
        alt: "Siri: say “Start a Ripple check-in”, add or check off a habit, add a task, check your streak, or ask Ripple",
        title: "Just ask Siri",
        body: `Say <strong>“Start a Ripple check-in”</strong> and you’re recording. You can also add a habit, check one off, add a task, or ask for your streak. It all works in Shortcuts too, and on iPhones with an Action Button you can set one press to start a check-in.`,
      })}

      ${feature({
        img: `${IMG}/widgets.png`,
        alt: "Ripple widgets on the Home Screen and Lock Screen showing a streak and today’s habits",
        title: "Widgets for your Home Screen and Lock Screen",
        body: `See your streak and today’s habits without opening anything. One tap on the widget starts a check-in. To add one, touch and hold an empty spot on your Home Screen, tap <strong>Edit</strong> (or <strong>+</strong>), and search for Ripple.`,
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
                <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">Your subscription screen now shows the plan you’re on, and monthly members can switch to annual right from the app.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      ${para(`It’s all in the latest version. Update and it’ll be waiting for you.`)}
      <tr>
        <td style="padding-bottom:12px;">
          ${primaryButton(RIPPLE_1_9_APP_STORE_URL, "Update in the App Store")}
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
    subject: "Ripple 1.9: Siri, widgets, and Ask your past self",
    html: trialLayout({
      content,
      footer: "marketing",
      unsubscribeUrl: v.unsubscribeUrl,
      preheader:
        "Start a check-in with your voice, see your streak on your Lock Screen, and more.",
    }),
  };
}
