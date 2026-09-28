/**
 * App access rescue (2026-09-28, per Keenan: "people not actually using the
 * damn app"). One-off to everyone who signed up on the web and never got
 * into their account in the app. Many downloaded it and landed in the app's
 * new-user sign-up instead. This leads with the one-tap signed-in link.
 * From: Keenan (set centrally in sendTrialEmail).
 */
import { escapeHtml } from "@/lib/escape-html";
import { appAccessBlock, keenanSignature, trialLayout, para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const appAccessRescue: TrialEmailTemplate = {
  subject: () => "Your Ripple account is ready. Open it in one tap",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst ? `Hi ${escapeHtml(rawFirst)},` : "Hi there,";
    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Your account is ready. Here&rsquo;s the easy way in.
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para("You signed up for Ripple on our website, but it looks like you haven&rsquo;t made it into your account in the app yet. That one&rsquo;s on us. The app was asking people to sign up again instead of letting them straight in.")}
      ${para("This button fixes that. No password, nothing to remember:")}
      <tr><td style="padding-bottom:12px;">${appAccessBlock(v)}</td></tr>
      ${para("Once you&rsquo;re in, tap the mic and say whatever&rsquo;s on your mind. Ripple pulls out your to-dos and keeps track of the rest.")}
      ${keenanSignature()}
    `;
    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "One tap on your phone and Ripple opens signed in. No password.",
    });
  },
};
