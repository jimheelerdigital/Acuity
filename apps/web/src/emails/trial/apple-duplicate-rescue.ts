/**
 * URGENT rescue for "paid on the web, then Sign in with Apple made a second,
 * empty account" (2026-10-01; lib/apple-duplicate-catch.ts). Goes to the PAID
 * address, so the one-tap link (APP_ACCESS_EMAIL_KEYS) opens the app signed
 * into the account that has the membership. Written so it still makes sense
 * if the guess was wrong: it only tells a paying customer how to get in.
 * Goal: she gets into the app on the paid account.
 */
import { appBlock, h1, hi, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const appleDuplicateRescue: TrialEmailTemplate = withVariants([
  variant(
    "membership_on_this_email",
    "Urgent and plain: your membership is on this email, here's the one tap to get into it",
    () => "Action needed: your Ripple membership is on this email",
    () => "If you signed into the app with Apple, tap here to get to the account you paid for.",
    (v) => `
      ${h1("Your membership is on this email.")}
      ${hi(v)}
      ${para("Thank you for joining Ripple! If you opened the app and tapped <strong>Sign in with Apple</strong>, it may have made a second, empty account, so your membership won&rsquo;t show up there.")}
      ${para("Here&rsquo;s the fix. On your phone, tap the button below. It opens Ripple already signed into the account you paid for. No password needed.")}
      ${appBlock(v)}
      ${para("After that, skip <strong>Sign in with Apple</strong> and use this email address if the app ever asks you to sign in again. If anything looks off, just reply and I&rsquo;ll sort it out.")}
    `
  ),
]);
