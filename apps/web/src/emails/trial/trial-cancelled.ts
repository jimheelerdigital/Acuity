/**
 * Cancelled during the free trial (2026-10-01, per Keenan). Sent from the
 * Stripe webhook when a trialing subscription is set to cancel at period end.
 * One short personal note: no pressure, access continues, no charge, and one
 * question with one-tap answers (prefilled reply emails to Keenan). The answers
 * tell us why trials don't convert.
 * Three versions, Jev picks (lib/email-jev.ts). Goal: she taps an answer.
 */
import { h1, hi, para, row, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

const REPLY_TO = "keenan@heelerdigital.com";

function answers(): string {
  const opts = [
    "I didn't use it enough",
    "It wasn't what I expected",
    "It's too expensive",
    "Something didn't work",
    "Something else",
  ];
  const btn = (label: string) =>
    `<a href="mailto:${REPLY_TO}?subject=${encodeURIComponent(`Why I cancelled: ${label}`)}" style="display:block;margin:0 0 8px;padding:12px 16px;border:1px solid #FFE4D9;border-radius:12px;background:#FFF7F4;color:#C4451C;font-size:15px;font-weight:600;text-decoration:none;">${label.replace("'", "&rsquo;")}</a>`;
  return row(opts.map(btn).join(""), 24);
}

const reassure = para("You won&rsquo;t be charged, and you keep full access until your free week ends.");

export const trialCancelled: TrialEmailTemplate = withVariants([
  variant(
    "one_question",
    "Short and respectful: confirms no charge, asks one question with tap-to-answer options",
    () => "you're all set (one quick question)",
    () => "You won't be charged. Can I ask what didn't work?",
    (v) => `
      ${hi(v)}
      ${para("Your Ripple trial is cancelled, so nothing to worry about there.")}
      ${reassure}
      ${para("Could you tell me why? Tap whichever is closest. It opens a reply to me, and I read every one.")}
      ${answers()}
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
      ${para("I&rsquo;m building Ripple and I&rsquo;d really like to know what got in the way. One tap is plenty:")}
      ${answers()}
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
      ${para("And if you have a second, tell me what made you cancel:")}
      ${answers()}
    `
  ),
]);
