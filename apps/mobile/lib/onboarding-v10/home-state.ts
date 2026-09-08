/**
 * Screen 9 (Home) state decisions.
 *
 * Pure and dependency-free so every rule below is testable without the RN
 * module graph. The screen renders what these functions return; it decides
 * nothing itself.
 */

export type PinnedCardKind = "after_first" | "after_second" | null;

/**
 * Which pinned card Home shows, by real debrief count.
 *
 * Spec §4 Screen 9: card after #1, a different card after #2, GONE at #3.
 * The disappearance is the point — a permanent nudge stops being guidance
 * and becomes furniture, and this one has done its job the moment the
 * second debrief exists.
 *
 * Counts below 1 return null: a user with zero debriefs is in the
 * never-empty-dashboard case, which the first-run result already fills.
 */
export function pinnedCardFor(entryCount: number): PinnedCardKind {
  if (entryCount === 1) return "after_first";
  if (entryCount === 2) return "after_second";
  return null;
}

export const PINNED_AFTER_FIRST =
  "One debrief gave you a snapshot. The next one lets Ripple compare.";

/**
 * Copy for the after-#2 card.
 *
 * Spec: "honest progress toward patterns (real state, no fake progress)."
 * So this states what IS true — two debriefs exist and patterns typically
 * appear around here — without a progress bar, a percentage, or a promise
 * that the third debrief will definitely produce one. Patterns emerge from
 * content, not from a counter, and a bar filling to 100% would be a
 * fabricated commitment.
 */
export const PINNED_AFTER_SECOND =
  "Two debriefs in. Ripple can start comparing them — patterns show up once there's enough to connect.";

/** Spec §4 Screen 9 free banner. */
export const FREE_BANNER =
  "Free keeps your debriefs and tasks. Patterns and reports unlock with Ripple.";

export type SubscriptionStatus = "TRIAL" | "PRO" | "FREE" | "PAST_DUE" | string;

export interface TrialCardInput {
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: string | Date | null;
  /** "apple" | "google_play" | "stripe" | "comp" | null */
  subscriptionSource: string | null;
  /** Localized price for the plan they're on, when the store gave us one. */
  localizedPrice: string | null;
}

export interface TrialCardState {
  show: boolean;
  renewalDate: Date | null;
  /**
   * Price to display, or null when we must not show one.
   *
   * ⚠️ NOT merely cosmetic. A subscription bought through the App Store
   * requires the renewal price to be disclosed in-app, and Apple's review
   * guidelines expect it. But a subscription bought on the WEB (Stripe,
   * via the External Purchase Link flow this app already uses for legacy
   * users) must NOT show prices in-app — that is the condition of the
   * entitlement, and violating it is a rejection.
   *
   * So the price is keyed off HOW the user subscribed, not off the fact
   * that they are subscribed. Getting this backwards is a compliance
   * failure in one direction and a rejection in the other.
   */
  price: string | null;
}

const NATIVE_SOURCES = new Set(["apple", "google_play"]);

export function trialCardFor(input: TrialCardInput): TrialCardState {
  const hidden: TrialCardState = { show: false, renewalDate: null, price: null };

  if (input.subscriptionStatus !== "TRIAL") return hidden;
  if (!input.trialEndsAt) return hidden;

  const renewalDate = new Date(input.trialEndsAt);
  if (Number.isNaN(renewalDate.getTime())) return hidden;

  // NATIVE PURCHASES ONLY.
  //
  // This card exists to satisfy the App Store's in-app renewal disclosure
  // for an IAP trial. A Stripe/web trial is governed by the opposite rule
  // — no prices in-app — and is already served by the legacy TrialBanner,
  // which every current subscriber sees today. Returning `show: true` here
  // for a web trial would replace that banner with a card that cannot name
  // a price, i.e. strictly less information, for users who never went
  // through v10 at all.
  //
  // Unknown source fails closed to the legacy banner for the same reason.
  const isNative =
    input.subscriptionSource !== null &&
    NATIVE_SOURCES.has(input.subscriptionSource);
  if (!isNative) return hidden;

  return {
    show: true,
    renewalDate,
    // Still conditional on the store actually giving us a localized string
    // — see the field docs. We never format a price ourselves.
    price: input.localizedPrice,
  };
}

/** e.g. "March 3" — the exact date, never "in 7 days". */
export function formatRenewalDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

/**
 * Trial card line. Exact date always; price only when permitted.
 *
 * Spec §4 Screen 9: "trial-status card, exact renewal date + price." The
 * date is exact rather than a countdown because "3 days left" is what a
 * user reads right before being charged by surprise — a date is something
 * they can put in a calendar.
 */
export function trialCardLine(state: TrialCardState): string | null {
  if (!state.show || !state.renewalDate) return null;
  const date = formatRenewalDate(state.renewalDate);
  return state.price
    ? `Your trial ends ${date}. Renews at ${state.price} unless you cancel.`
    : `Your trial ends ${date}. Cancel any time before then.`;
}

/**
 * Whether the LEGACY TrialBanner should render.
 *
 * The two trial surfaces are mutually exclusive, split by how the user
 * subscribed — which is not an arbitrary tiebreak, it is the same rule that
 * governs whether a price may appear at all:
 *
 *   native (apple / google_play) → V10TrialCard: exact date + renewal price,
 *       which the App Store requires an IAP trial to disclose in-app.
 *   web / unknown                → TrialBanner: countdown + Continue-on-web,
 *       no prices, per the External Purchase Link entitlement this app
 *       already ships under for legacy users.
 *
 * Rendering both would show a countdown and a date for the same trial, in
 * two different visual languages, one of which is forbidden to name a price
 * the other is required to name.
 */
export function showsLegacyTrialBanner(input: TrialCardInput): boolean {
  return !trialCardFor(input).show;
}

/**
 * Whether Home should show free-tier locks.
 *
 * PAST_DUE deliberately does NOT lock: a failed payment is a billing
 * problem, and stripping someone's features mid-retry punishes them for a
 * card expiry. This matches the entitlement resolver's grace behaviour.
 */
export function showsFreeLocks(status: SubscriptionStatus): boolean {
  return status === "FREE";
}
