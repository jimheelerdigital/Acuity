/**
 * What's New tour (1.9.1, Jimmy: "list + tour"). Same engine as the
 * first-login tour (TourProvider + AttachStep spotlight), its own stops.
 *
 *   - "Show me around": every release item that has a `tour` stop, in
 *     order, then a closing card on the Home settings gear ("find this
 *     again in Profile → What's New").
 *   - Tapping one item: just that stop, with "Back to What's New".
 *
 * Fallbacks when a target isn't on screen for this person:
 *   - TODAY card only renders when they have open tasks → otherwise the
 *     Home header (dashboard step) with copy saying where it will appear.
 *   - Swipe needs a task row → otherwise the Tasks tab button.
 *
 * Pure (no React Native imports).
 */
import type { WhatsNewItem } from "@/lib/whats-new-content";

import { TOUR_STEP_INDEX, WHATS_NEW_STEP_INDEX } from "./steps";

export interface WhatsNewTourCard {
  /** Spotlight step index (an AttachStep target). */
  target: number;
  /** Item this stop explains; null for the closing card. */
  itemId: string | null;
  title: string;
  body: string;
  /** Tasks swipe stop: peek the first row open to show the buttons. */
  peekSwipe?: boolean;
}

export interface WhatsNewTourRequest {
  cards: WhatsNewTourCard[];
  /** One item tapped from the list (shows "Back to What's New"). */
  single: boolean;
}

export interface WhatsNewTourContext {
  /** TODAY card is rendered (person has open tasks). */
  hasOpenTasks: boolean;
  /** At least one task row exists on the Tasks tab's Open list. */
  hasTaskRow: boolean;
}

export function cardForItem(
  item: WhatsNewItem,
  ctx: WhatsNewTourContext
): WhatsNewTourCard | null {
  const t = item.tour;
  if (!t) return null;
  switch (t.target) {
    case "today":
      return ctx.hasOpenTasks
        ? { target: WHATS_NEW_STEP_INDEX.today, itemId: item.id, title: t.title, body: t.body }
        : {
            target: TOUR_STEP_INDEX.dashboard,
            itemId: item.id,
            title: t.title,
            body: "Once you have tasks, your most pressing ones show up right here on Home: overdue, due today, then high priority.",
          };
    case "swipe":
      return ctx.hasTaskRow
        ? {
            target: WHATS_NEW_STEP_INDEX.swipe,
            itemId: item.id,
            title: t.title,
            body: t.body,
            peekSwipe: true,
          }
        : {
            target: TOUR_STEP_INDEX.tasks,
            itemId: item.id,
            title: t.title,
            body: "On Tasks, Goals and Habits, swipe a row left for Edit and Delete. Delete always asks first.",
          };
    case "widgets":
      return { target: WHATS_NEW_STEP_INDEX.widgets, itemId: item.id, title: t.title, body: t.body };
    case "actionButton":
      return { target: WHATS_NEW_STEP_INDEX.actionButton, itemId: item.id, title: t.title, body: t.body };
    case "notifications":
      return { target: WHATS_NEW_STEP_INDEX.notifications, itemId: item.id, title: t.title, body: t.body };
    default:
      return null;
  }
}

export function fullTour(items: WhatsNewItem[], ctx: WhatsNewTourContext): WhatsNewTourRequest {
  const cards = items
    .map((i) => cardForItem(i, ctx))
    .filter((c): c is WhatsNewTourCard => c !== null);
  cards.push({
    target: TOUR_STEP_INDEX.settings,
    itemId: null,
    title: "That's what's new",
    body: "Look again anytime: tap here, then What's New.",
  });
  return { cards, single: false };
}

export function singleStop(item: WhatsNewItem, ctx: WhatsNewTourContext): WhatsNewTourRequest | null {
  const card = cardForItem(item, ctx);
  return card ? { cards: [card], single: true } : null;
}
