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
import { trialButton, trialLayout } from "./trial/layout";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const WEB_APP_URL = "https://www.getacuity.io/home";
const HEADSHOT_URL =
  "https://www.getacuity.io/email/keenan-updated-headshot.png";

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
      ${para("It's Keenan — I'm one of the people who built Acuity, and I wanted to say hi properly.")}
      ${para("I'll keep this short, because I know your head's probably full enough already. That's kind of the whole point of Acuity: you talk through your day for a few spoken minutes, and it quietly catches the things you'd otherwise lose — the tasks, the patterns, the stuff that's been weighing on you that you can't quite name.")}
      ${para("Here's how to start:")}
      <tr>
        <td style="padding-bottom:4px;">
          ${trialButton(APP_STORE_URL, "Get the iPhone app")}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(WEB_APP_URL, "Open the web app")}
        </td>
      </tr>
      ${para("On Android? It's coming — we're building it now. Just reply to this email and I'll personally let you know the second it's ready.")}
      ${para("One honest thing before you go: Acuity gets better the more you use it. The first debrief gives you a little. A week in, it starts surfacing patterns you didn't see. A month in, you can watch your life actually take shape across the things that matter. It compounds — quietly, in the background — but only if you keep showing up for a few minutes at a time.")}
      ${para("You don't have to be consistent to start. You just have to start. Talk through today, and let it do the rest.")}
      ${para("I read every reply to this email, so if anything's confusing or you just want to tell me what's on your mind — write back. A real person (me) will see it.")}
      <tr>
        <td style="padding-bottom:12px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">Talk soon,</p>
        </td>
      </tr>
      <tr>
        <td>
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle" style="padding-right:12px;">
                <img src="${HEADSHOT_URL}" alt="Keenan, co-founder of Acuity" width="52" height="52" style="display:block;width:52px;height:52px;border-radius:50%;" />
              </td>
              <td valign="middle">
                <p style="margin:0;font-size:16px;color:#1a1a1a;font-weight:600;">Keenan</p>
                <p style="margin:0;font-size:13px;color:#6b7280;">Co-founder, Acuity</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
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
