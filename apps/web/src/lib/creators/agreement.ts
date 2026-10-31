/**
 * The creator agreement, versioned. A creator must accept the CURRENT
 * version in the dashboard before they can be paid (timestamp + version are
 * stored on UgcCreator). Bump AGREEMENT_VERSION in config.ts whenever the
 * text below changes; everyone then re-accepts.
 *
 * Plain-English draft written from the 2026-10-22 spec. Have a lawyer read
 * it before the first payout.
 */
import {
  AGREEMENT_VERSION,
  COMMISSION_WINDOW_MONTHS,
  HOLD_DAYS,
  MILESTONE_TIERS,
  VIEW_BONUS_TIERS,
  VIEW_BONUS_WINDOW_DAYS,
} from "./config";
import { formatCents } from "./money";

export { AGREEMENT_VERSION };

export const AGREEMENT_SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: "What you earn",
    body: `You earn 25% of what each customer you refer pays Ripple for ${COMMISSION_WINDOW_MONTHS} months, counted from that customer's first paid payment. Free trials and free accounts pay nothing. The window does not restart if the customer changes plan or platform. Only accounts created after they click your link or enter your code count; existing Ripple customers do not.`,
  },
  {
    title: "How revenue is counted",
    body: "Revenue is the price the customer actually paid after any discount, not counting sales tax. App Store, Google Play and Stripe fees are our cost and are not taken out of your share.",
  },
  {
    title: "Bonuses",
    body: `View bonuses: a post with your link or code earns ${VIEW_BONUS_TIERS.map((t) => `${formatCents(t.bonusCents)} at ${(t.views / 1000).toLocaleString("en-US")}k views`).join(", ")} in its first ${VIEW_BONUS_WINDOW_DAYS} days. The highest level a post reaches is its bonus (a post at ${(VIEW_BONUS_TIERS[VIEW_BONUS_TIERS.length - 1].views / 1000).toLocaleString("en-US")}k views earns ${formatCents(VIEW_BONUS_TIERS[VIEW_BONUS_TIERS.length - 1].bonusCents)} in total). Views are counted from the platform's own figure, and bought or botted views don't count. If we pick one of your videos to run as an ad, you get a one-time $100 bonus for that video. Each calendar month you also earn ${MILESTONE_TIERS.map((t) => `${formatCents(t.bonusCents)} at ${t.customers}`).join(", ")} paying customers (each tier paid once per month). Bonuses are never taken back.`,
  },
  {
    title: "When you get paid",
    body: `Each commission waits ${HOLD_DAYS} days after the customer's payment before it can be paid out. Payouts go out every other Friday through Stripe once your payable balance is at least $25; smaller balances roll over to the next payout. We need your Stripe payout setup (or a PayPal email if Stripe can't onboard you) before we can pay you. Stripe collects your tax form; US creators receive a 1099 from Stripe.`,
  },
  {
    title: "Refunds and chargebacks",
    body: "If a customer is refunded or files a chargeback, the commission on that payment is reversed and taken off your next payout. We never send you a bill: a negative balance is covered by future earnings.",
  },
  {
    title: "Using your posts",
    body: "For 12 months after you post, we may run, boost or reuse as an ad any post that carries your Ripple link or code, at no extra cost. You keep ownership of your content.",
  },
  {
    title: "Disclosure",
    body: 'Every post with your link or code must carry "#ad" or the platform\'s paid-partnership label, plus a plain line that you earn a commission from the link. This is a condition of payment.',
  },
  {
    title: "What you can and can't say",
    body: "You can share your credentials and your own experience. You can't say Ripple treats, diagnoses, cures or replaces therapy or any medical care.",
  },
  {
    title: "Fair play",
    body: 'No bidding on "Ripple" or "goripple" in search ads, no coupon or deal sites, no paying or rewarding people to sign up, and no referring yourself or your own accounts. We may end this agreement for fraud, and any unpaid commission is then forfeited.',
  },
  {
    title: "Changes",
    body: "We may change these terms with 30 days' notice. Changes only apply to payments made after the notice period ends.",
  },
];
