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
  BOOST_BONUS_CENTS,
  CLICK_COOKIE_DAYS,
  COMMISSION_WINDOW_MONTHS,
  CREATOR_PRO_FREE_MONTHS,
  CREATOR_PRO_MIN_PAID_PER_MONTH,
  HOLD_DAYS,
  MILESTONE_TIERS,
  VIEW_BONUS_TIERS,
  VIEW_BONUS_WINDOW_DAYS,
} from "./config";
import { formatCents } from "./money";

export { AGREEMENT_VERSION };

const TOP_VIEW_TIER = VIEW_BONUS_TIERS[VIEW_BONUS_TIERS.length - 1];
function kViews(views: number): string {
  return `${(views / 1000).toLocaleString("en-US")}k`;
}
/** "$25 at 1k+ views, $100 at 10k+ and $200 at 25k+". */
function viewTierText(): string {
  const parts = VIEW_BONUS_TIERS.map((t, i) => `${formatCents(t.bonusCents)} at ${kViews(t.views)}+${i === 0 ? " views" : ""}`);
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export const AGREEMENT_SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: "What you earn",
    body: `You earn 25% of what each customer you refer pays Ripple for ${COMMISSION_WINDOW_MONTHS} months, counted from that customer's first paid payment. Free trials and free accounts pay nothing. The window does not restart if the customer changes plan or platform. Only accounts created after they click your link or enter your code count, and a click counts for ${CLICK_COOKIE_DAYS} days; existing Ripple customers do not.`,
  },
  {
    title: "How revenue is counted",
    body: "Revenue is the price the customer actually paid after any discount and without sales tax. App Store, Google Play and Stripe fees are our cost and are not taken out of your share.",
  },
  {
    title: "View bonuses",
    body: `Each video you post with your link or code earns a bonus on its organic views, measured on day ${VIEW_BONUS_WINDOW_DAYS} after you post: ${viewTierText()}. Only the highest level a video reaches is paid, and the levels don't stack (a video at ${kViews(TOP_VIEW_TIER.views)} views earns ${formatCents(TOP_VIEW_TIER.bonusCents)} in total). We read the platform's view count; if it falls short, send us your Insights screenshot from day ${VIEW_BONUS_WINDOW_DAYS} and we'll pay what it shows. Day ${VIEW_BONUS_WINDOW_DAYS} is when views are measured, not a promised payment date. Paid, bought or botted views don't count, and reposting the same video doesn't earn another bonus. There is no monthly cap and no limit on how many videos can earn one.`,
  },
  {
    title: "Ad selection bonus",
    body: `If we pick one of your videos to run as an ad, you get a one-time ${formatCents(BOOST_BONUS_CENTS)} bonus for that video. It's earned when we pick it, whether or not the ad goes live, and it's separate from view bonuses and commission. Being picked isn't guaranteed.`,
  },
  {
    title: "Monthly customer bonuses",
    body: `Each calendar month you also earn ${MILESTONE_TIERS.map((t, i) => `${i === 0 ? "" : i === MILESTONE_TIERS.length - 1 ? "and another " : "another "}${formatCents(t.bonusCents)} at ${t.customers}`).join(", ")} paying customers you referred (${formatCents(MILESTONE_TIERS.reduce((sum, t) => sum + t.bonusCents, 0))} in total at ${MILESTONE_TIERS[MILESTONE_TIERS.length - 1].customers}). A customer counts in the month of their first paid payment, once it has cleared the ${HOLD_DAYS}-day hold without a refund.`,
  },
  {
    title: "Free Ripple Pro",
    body: `Ripple Pro is free for your first ${CREATOR_PRO_FREE_MONTHS} months, with no signups needed. After that it stays free in any month you refer at least ${CREATOR_PRO_MIN_PAID_PER_MONTH} paying customer; otherwise free Pro ends. Sign up for Ripple with the same email you joined the program with (with Sign in with Apple, choose to share your email).`,
  },
  {
    title: "Joining the program",
    body: "You're enrolled once you've accepted this agreement in your dashboard and connected Stripe for payouts (or given us a PayPal email if Stripe can't onboard you). An invitation on its own isn't enrollment, and bonuses and commission are only paid to enrolled creators. There's no fee to join, no posting minimum, and no guaranteed earnings.",
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
