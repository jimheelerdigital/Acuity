/**
 * "You're all set" for a paid web customer whose Sign in with Apple made a
 * second account that we then linked automatically (2026-10-07, per Keenan:
 * the rescue email told Kevin to avoid Sign in with Apple even though Apple
 * sign-in already opened his paid account). Goes to the PAID address with
 * the one-tap link (APP_ACCESS_EMAIL_KEYS). See lib/apple-duplicate-catch.ts.
 */
import { appBlock, h1, hi, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const appleDuplicateLinked: TrialEmailTemplate = withVariants([
  variant(
    "linked_sign_in_again",
    "Reassuring and short: we fixed it, sign out and back in with Apple (or tap the button)",
    () => "You're all set: your Ripple membership is ready in the app",
    () => "Sign out and back in with Apple, or tap below, and your membership will be there.",
    (v) => `
      ${h1("You&rsquo;re all set.")}
      ${hi(v)}
      ${para("Thank you for joining Ripple! When you opened the app and tapped <strong>Sign in with Apple</strong>, it started a second, empty account, so your membership didn&rsquo;t show up there. We&rsquo;ve fixed that: your Apple sign-in now opens the account you paid for.")}
      ${para("To see it, either <strong>sign out of the app and sign back in with Apple</strong>, or tap the button below on your phone. It opens Ripple already signed into your membership.")}
      ${appBlock(v)}
      ${para("If anything still looks off, just reply and I&rsquo;ll sort it out.")}
    `
  ),
]);
