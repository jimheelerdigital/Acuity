/**
 * App access rescue (2026-09-28, per Keenan: "people not actually using the
 * damn app"). One-off to everyone who signed up on the web and never got
 * into their account in the app. Many downloaded it and landed in the app's
 * new-user sign-up instead. This leads with the one-tap signed-in link.
 * From: Keenan (set centrally in sendTrialEmail).
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she gets
 * into the Ripple app, signed in, within 3 days.
 */
import { appBlock, h1, hi, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const appAccessRescue: TrialEmailTemplate = withVariants([
  variant(
    "our_fault",
    "Owns the mistake: the app asked her to sign up again; this button lets her straight in",
    () => "Your Ripple account is ready. Open it in one tap",
    () => "One tap on your phone and Ripple opens signed in. No password.",
    (v) => `
      ${h1("Your account is ready. Here&rsquo;s the easy way in.")}
      ${hi(v)}
      ${para("You signed up for Ripple on our website, but you haven&rsquo;t made it into your account in the app yet. That one&rsquo;s on us. The app was asking people to sign up again instead of letting them straight in.")}
      ${para("This button fixes it. No password, nothing to remember:")}
      ${appBlock(v)}
      ${para("Once you&rsquo;re in, tap record and say what&rsquo;s on your mind. Ripple pulls out your to-dos and keeps track of the rest.")}
    `
  ),
  variant(
    "no_password",
    "Pure convenience: no password needed, one tap opens the app signed in",
    () => "No password needed",
    () => "Tap once on your phone and you're in your Ripple account.",
    (v) => `
      ${h1("No password. One tap.")}
      ${hi(v)}
      ${para("Your Ripple account is waiting for you in the app. You don&rsquo;t need to remember a password or make a new account. Just tap the button below on your phone:")}
      ${appBlock(v)}
      ${para("Then tap record and say three things on your plate this week. That&rsquo;s your first list, made.")}
    `
  ),
  variant(
    "account_waiting",
    "Her account and everything she set up is already waiting; don't start over",
    () => "Don't start over. Your account is waiting",
    () => "Everything you set up is already there. Here's the way back in.",
    (v) => `
      ${h1("Your account is already there. Don&rsquo;t start over.")}
      ${hi(v)}
      ${para("If you opened the Ripple app and it asked you to sign up, skip that. You already have an account, and that&rsquo;s where your membership lives.")}
      ${para("This button takes you straight into it:")}
      ${appBlock(v)}
      ${para("Stuck anywhere? Reply and tell me. I&rsquo;ll sort it out myself.")}
    `
  ),
]);
