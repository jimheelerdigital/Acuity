import { emailLayout } from "./layout";

export function magicLinkEmail(url: string): { subject: string; html: string } {
  return {
    subject: "Sign in to Ripple",
    html: emailLayout({
      title: "Sign in to Ripple",
      preheader: "Tap the button to sign in. No password needed.",
      intro:
        "Click the button below to sign in. This link expires in 24 hours and can only be used once.",
      ctaLabel: "Sign in to Ripple",
      ctaUrl: url,
    }),
  };
}

/**
 * Funnel version (2026-09-28): sent automatically right after checkout on the
 * web funnel, before she has the app. Install first, then tap the button on
 * the phone and the app opens signed in. No password. The token is only
 * consumed when the app redeems it, so tapping before installing is harmless.
 */
export function funnelAppAccessEmail(url: string, opts: { appStoreUrl: string; playStoreUrl: string }): { subject: string; html: string } {
  return {
    subject: "Your Ripple is ready. Open it on your phone",
    html: emailLayout({
      title: "Your Ripple is ready",
      preheader: "Get the app, then tap to sign in. No password.",
      intro:
        `Two quick steps on your phone and you're in:<br /><br />` +
        `<strong>1. Get the app.</strong> <a href="${opts.appStoreUrl}" style="color:#E06B46;">App Store</a> or <a href="${opts.playStoreUrl}" style="color:#E06B46;">Google Play</a>.<br /><br />` +
        `<strong>2. Tap the button below on your phone.</strong> Ripple opens already signed in, with your first debrief waiting.`,
      ctaLabel: "Open Ripple",
      ctaUrl: url,
      footnote: "This link works for 3 days and signs you in once. Tapping it before you install is fine; just tap it again after.",
    }),
  };
}
