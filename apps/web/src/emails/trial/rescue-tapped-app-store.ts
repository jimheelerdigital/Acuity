/**
 * Download Rescue #3 — Tapped App Store, Never Opened
 *
 * Trigger: Has funnel_app_store_clicked but appFirstOpenedAt still null,
 *          NOT webview-blocked (no funnel_inapp_browser_detected event).
 * Subject: "Looks like the download didn't finish"
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she gets
 * into the Ripple app, signed in, within 3 days.
 */

import { appBlock, h1, hi, men, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

const WEBVIEW_TIP =
  "One tip: if you&rsquo;re tapping this inside Instagram or Facebook, their built-in browser can block the App Store. Open this email in your Mail app instead and tap the link there.";

export const rescueTappedAppStore: TrialEmailTemplate = withVariants([
  variant(
    "download_didnt_finish",
    "The download probably didn't finish, not her fault; here's the direct link",
    () => "Looks like the download didn’t finish",
    () => "You were one tap away. Here's the direct link.",
    (v) => `
      ${h1("Looks like the download didn&rsquo;t finish")}
      ${hi(v)}
      ${para("You went to get the app, but it looks like it never opened. That happens a lot, and it&rsquo;s usually nothing on your end.")}
      ${para("Here&rsquo;s the direct way in:")}
      ${appBlock(v)}
      ${para(WEBVIEW_TIP)}
    `
  ),
  variant(
    "already_installed",
    "She may already have the app on her phone; open it signed in with one tap",
    () => "Ripple might already be on your phone",
    () => "If it's installed, one tap opens your account.",
    (v) => `
      ${h1("Ripple might already be on your phone.")}
      ${hi(v)}
      ${para("You tapped through to the App Store, so the app may be sitting on your home screen already. If it is, tap the button below on your phone and it opens your account. No password.")}
      ${para("If the app asks you to sign up, skip that. Your account is already made.")}
      ${appBlock(v)}
      ${para(WEBVIEW_TIP)}
    `
  ),
  variant(
    "first_thing_to_say",
    "Gets her past the install by telling her the first thing to say once she's in",
    () => "Once it opens, say this",
    () => "Here's the way in, and the first thing to say.",
    (v) => `
      ${h1("Once it opens, say this.")}
      ${hi(v)}
      ${para("Looks like the app didn&rsquo;t open after the App Store. Here&rsquo;s the way in:")}
      ${appBlock(v)}
      ${para(men(v) ? "Then tap record and say: &ldquo;Here&rsquo;s what I&rsquo;m working on this week.&rdquo; Gym, calls, money, whatever. Ripple turns it into your list and tracks the habits you mention." : "Then tap record and say: &ldquo;Here&rsquo;s what&rsquo;s on my plate this week.&rdquo; Kids, work, the house, whatever. Ripple turns it into your list and tracks the habits you mention.")}
      ${para(WEBVIEW_TIP)}
    `
  ),
]);
