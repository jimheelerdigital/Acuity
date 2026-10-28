/**
 * Cancelled during the free trial (2026-10-01, per Keenan). Sent from the
 * Stripe webhook when a trialing subscription is set to cancel at period end.
 * One short personal note: no pressure, access continues, no charge, and one
 * question with one-tap answers (prefilled reply emails to Keenan). The answers
 * tell us why trials don't convert.
 * Three versions, Jev picks (lib/email-jev.ts). Goal: she taps an answer.
 */
import { CANCEL_REASONS } from "@/lib/cancel-feedback";

import { h1, hi, para, row, variant, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

const REPLY_TO = "keenan@heelerdigital.com";

function answers(v: TrialVars): string {
  // One tap records the answer (lib/cancel-feedback.ts, /why). Falls back to a
  // prefilled reply if the link can't be built.
  const btn = (r: { id: string; label: string }) => {
    const href = v.whyUrl
      ? `${v.whyUrl}&r=${r.id}`
      : `mailto:${REPLY_TO}?subject=${encodeURIComponent(`Why I cancelled: ${r.label}`)}`;
    return `<a href="${href}" style="display:block;margin:0 0 8px;padding:12px 16px;border:1px solid #FFE4D9;border-radius:12px;background:#FFF7F4;color:#C4451C;font-size:15px;font-weight:600;text-decoration:none;">${r.label.replace("'", "&rsquo;")}</a>`;
  };
  return row(CANCEL_REASONS.map(btn).join(""), 24);
}

const reassure = para("You won&rsquo;t be charged, and you keep full access until your free week ends.");

export const trialCancelled: TrialEmailTemplate = withVariants([
  variant(
    "one_question",
    "Short and respectful: confirms no charge, asks one question with tap-to-answer options",
    () => "why wasn't Ripple for you?",
    () => "You won't be charged. One tap tells me what didn't work.",
    (v) => `
      ${hi(v)}
      ${para("Your Ripple trial is cancelled, so nothing to worry about there.")}
      ${reassure}
      ${para("Why wasn&rsquo;t Ripple for you? Tap whichever is closest. One tap is all it takes, and I read every answer.")}
      ${answers(v)}
    `
  ),
  variant(
    "help_me_fix",
    "Founder asking for help making Ripple better; feedback framed as a favor",
    () => "can you help me fix this?",
    () => "One tap tells me what Ripple got wrong for you.",
    (v) => `
      ${h1("Help me make Ripple better?")}
      ${hi(v)}
      ${para("I saw you cancelled your trial. No hard feelings at all.")}
      ${reassure}
      ${para("Why wasn&rsquo;t Ripple for you? I&rsquo;m building it and I&rsquo;d really like to know what got in the way. One tap is plenty:")}
      ${answers(v)}
    `
  ),
  variant(
    "still_yours",
    "Reminds her the trial is still hers to use, then asks the one question",
    () => "your free week is still yours",
    () => "Cancelled, not charged, and you can keep using it until it ends.",
    (v) => `
      ${hi(v)}
      ${para("Got it, your trial is cancelled and you won&rsquo;t be charged.")}
      ${para("Your free week is still yours to use until it ends. If you haven&rsquo;t tried a debrief yet, it&rsquo;s worth one before then: tap record and say what&rsquo;s on your plate.")}
      ${para("And if you have a second: why wasn&rsquo;t Ripple for you?")}
      ${answers(v)}
    `
  ),
]);
