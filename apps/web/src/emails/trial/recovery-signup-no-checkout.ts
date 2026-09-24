/**
 * Recovery Email 2 — Signed Up But No Checkout
 *
 * Trigger: web funnel account created (funnel_account_created, or legacy
 *          funnel_signup_completed), no funnel_checkout_started, not Pro.
 *          1–4 hours after signup.
 * Subject: "Your free week of Pro is still here"
 *
 * 2026-09-24: rewritten for the FREE-plan funnel. Funnel signups land on the
 * free plan; the 7-day trial needs a card. Links to /pro-trial, which sends
 * them to their funnel's paywall (the only place the card trial exists).
 * From: Keenan from Ripple <keenan@getacuity.io> (set centrally in sendTrialEmail)
 */

import { escapeHtml } from "@/lib/escape-html";
import { displayMonthly } from "@/lib/pricing";
import { keenanSignature, trialButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const PRICE = displayMonthly();

export const recoverySignupNoCheckout: TrialEmailTemplate = {
  subject: () => "Your free week of Pro is still here",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);
    const trialUrl = `${appUrl}/pro-trial?utm_source=email&utm_medium=recovery&utm_campaign=signup_no_checkout`;

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Your free week of Pro is still here.
          </h1>
        </td>
      </tr>
      ${para(`Hey ${name},`)}
      ${para(`Your Ripple account is set up, and you can record debriefs on the free plan whenever you like.`)}
      ${para(`What you haven\u2019t opened yet is Pro. It turns what you say into a to-do list that writes itself, tracks the habits you\u2019re building, and shows you the patterns you can\u2019t see from inside your own week.`)}
      ${para(`The first 7 days are free. $0 today, we email you before you\u2019re charged, and you can cancel anytime from your account. After that it\u2019s ${PRICE}/month.`)}
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(trialUrl, "Start my free 7 days")}
        </td>
      </tr>
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "7 days of Pro, $0 today. We remind you before you\u2019re charged.",
    });
  },
};
