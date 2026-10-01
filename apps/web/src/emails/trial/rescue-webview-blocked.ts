/**
 * Download Rescue #4 — Webview Blocked
 *
 * Trigger: funnel_inapp_browser_detected fired (stuck in Instagram/Facebook
 *          in-app browser), appFirstOpenedAt null.
 * Subject: "Whoops — here it is"
 *
 * Highest priority rescue email — if a user is webview-blocked, they
 * get this one regardless of other download events.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she gets
 * into the Ripple app, signed in, within 3 days.
 */

import { appBlock, h1, hi, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const rescueWebviewBlocked: TrialEmailTemplate = withVariants([
  variant(
    "browser_blocked",
    "Explains Instagram/Facebook's browser blocked the App Store; this link works",
    () => "Whoops — here it is",
    () => "That last link hit a wall. This one won't.",
    (v) => `
      ${h1("Whoops. Here it is.")}
      ${hi(v)}
      ${para("When you tried to get the app earlier, you were inside Instagram&rsquo;s (or Facebook&rsquo;s) built-in browser, and those block the App Store. It wasn&rsquo;t you, and it wasn&rsquo;t the app.")}
      ${para("You&rsquo;re out of that now. Tap below and it goes straight through:")}
      ${appBlock(v)}
      ${para("Sorry for the runaround.")}
    `
  ),
  variant(
    "not_your_fault",
    "Reassures her it wasn't her fault; short, direct link",
    () => "That wasn't you",
    () => "Instagram's browser blocked the download. This link works.",
    (v) => `
      ${h1("That wasn&rsquo;t you.")}
      ${hi(v)}
      ${para("The download didn&rsquo;t go through because Instagram and Facebook open links in their own browser, which can&rsquo;t open the App Store.")}
      ${para("From your email it works fine:")}
      ${appBlock(v)}
      ${para("Then tap record and say what&rsquo;s on your plate. Ripple does the sorting.")}
    `
  ),
  variant(
    "two_taps",
    "Practical: two taps from here, get the app then open it signed in",
    () => "Two taps and you're in",
    () => "Get the app, then open your account. No password.",
    (v) => `
      ${h1("Two taps and you&rsquo;re in.")}
      ${hi(v)}
      ${para("Your earlier try got stuck in Instagram&rsquo;s browser. From here it&rsquo;s two taps: get the app, then open your account with the steps below. No new account needed.")}
      ${appBlock(v)}
      ${para("If anything still doesn&rsquo;t open, reply and I&rsquo;ll help.")}
    `
  ),
]);
