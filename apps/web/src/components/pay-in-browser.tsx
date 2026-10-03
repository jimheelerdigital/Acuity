"use client";

/**
 * Paywall extras (2026-09-30, per Keenan: "add the button in the paywall and
 * trust line and make sure it links properly").
 *
 * PayInBrowserButton — REMOVED 2026-10-03. It opened Stripe checkout in the
 * phone's real browser from Instagram/Facebook via x-safari-https:// and
 * intent:// links, on a black button with Apple's logo ("Pay with Apple Pay
 * in Safari"). Google Safe Browsing then flagged /start-bwk and
 * /start-test-bwk as "social engineering": in-app-browser escapes and
 * look-alike Apple Pay buttons are classic phishing signals. Usage was 33
 * views, 2 taps, 0 purchases. Kept as a no-op so the paywalls compile.
 * Don't bring back browser-escape links or a fake Apple/Google Pay button.
 *
 * PaywallTrustLine — one line under the main button.
 */

export function PayInBrowserButton(_props: {
  interval: "monthly" | "yearly";
  funnel: string;
  track: (event: string, value?: string) => void;
  className?: string;
}) {
  return null;
}

export function PaywallTrustLine({ className }: { className?: string }) {
  return (
    <p className={`text-center text-[12.5px] font-medium text-acuity-text-sec ${className ?? ""}`}>
      Cancel anytime in 2 taps &middot; we remind you on day 4
    </p>
  );
}
