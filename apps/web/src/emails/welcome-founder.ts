/**
 * welcome_founder — the single welcome email sent once on signup.
 *
 * Replaces the two old welcomes (welcome_day0 + the founder "URGENT:
 * Acuity; Next Steps" inline send), which are both killed. A personal,
 * hand-written note from Keenan with the App Store + web app links and a
 * small circular founder headshot in the signature.
 *
 * Uses the shared trial layout (coral branding, MARKETING footer with
 * one-click unsubscribe). Sent inline from bootstrapNewUser with
 * from/reply-to keenan@getacuity.io (a real monitored inbox — the copy
 * promises replies are read), gated by the email-enabled.ts kill-switch
 * key "welcome_founder".
 *
 * Caller passes a pre-built, tokenized unsubscribeUrl. firstName is
 * escaped here; pass null to fall back to "Hi there,".
 */

import { escapeHtml } from "@/lib/escape-html";
import {
  keenanSignature,
  appStoreAndPlayButtons,
  secondaryButton,
  trialLayout,
} from "./trial/layout";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const WEB_APP_URL = "https://getacuity.io/auth/signin";

export interface WelcomeFounderOpts {
  /** First name from the user record; null falls back to "Hi there,". */
  firstName: string | null;
  /** Tokenized one-click unsubscribe URL for the marketing footer. */
  unsubscribeUrl: string;
}

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

export function welcomeFounderEmail(
  opts: WelcomeFounderOpts
): { subject: string; html: string } {
  const rawFirst = (opts.firstName ?? "").trim();
  const greeting = rawFirst ? `Hi ${escapeHtml(rawFirst)},` : "Hi there,";

  const content = `
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${greeting}</p>
        </td>
      </tr>
      ${para("It's Keenan — I'm one of the people who built Acuity, and I wanted to reach out personally.")}
      ${para("I'll keep this short, because I know your head's probably full enough already. That's kind of the whole point of Acuity: you talk through your day for a few spoken minutes, and it quietly catches the things you'd otherwise lose — the tasks, the patterns, the stuff that's been weighing on you that you can't quite name.")}
      ${para("Here's how to start:")}
      <tr>
        <td style="padding-bottom:4px;">
          ${appStoreAndPlayButtons(APP_STORE_URL)}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          ${secondaryButton(WEB_APP_URL, "Open the web app")}
        </td>
      </tr>
      ${para("Prefer not to install anything? Use the web app right in your browser — same debrief, nothing to download.")}
      ${para("One honest thing before you go: Acuity gets better the more you use it. The first debrief gives you a little. A week in, it starts surfacing patterns you didn't see. A month in, you can watch your life actually take shape across the things that matter. It compounds — quietly, in the background — but only if you keep showing up for a few minutes at a time.")}
      ${para("You don't have to be consistent to start. You just have to start. Talk through today, and let it do the rest.")}
      ${para("I read every reply to this email, so if anything's confusing or you just want to tell me what's on your mind — write back. A real person (me) will see it.")}
      <tr>
        <td style="padding-bottom:12px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">Talk soon,</p>
        </td>
      </tr>
      ${keenanSignature()}
    `;

  return {
    subject: "You're in — here's how to start",
    html: trialLayout({
      content,
      footer: "marketing",
      unsubscribeUrl: opts.unsubscribeUrl,
      preheader:
        "A quick note from Keenan, and the two ways to start your first debrief.",
    }),
  };
}
