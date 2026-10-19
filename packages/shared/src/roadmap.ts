/**
 * Roadmap vocabulary shared by goripple.io/roadmap, the app's Roadmap
 * screens and the admin editor (2026-10-19), so all three label and colour
 * an item the same way.
 *
 * Lifecycle (left → right on the page):
 *   considering — an idea we're weighing; votes decide what moves up
 *   planned     — committed, with a rough timeframe
 *   building    — in progress now
 *   shipped     — in the app; the detail page doubles as release notes
 */

export const ROADMAP_STATUSES = ["building", "planned", "considering", "shipped"] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export function isRoadmapStatus(s: unknown): s is RoadmapStatus {
  return typeof s === "string" && (ROADMAP_STATUSES as readonly string[]).includes(s);
}

export const ROADMAP_STATUS_META: Record<
  RoadmapStatus,
  { label: string; tab: string; blurb: string }
> = {
  building: { label: "Building now", tab: "Building", blurb: "In progress, landing in the next release or two." },
  planned: { label: "Planned", tab: "Planned", blurb: "Committed. Rough timing shown on each one." },
  considering: { label: "Considering", tab: "Vote", blurb: "Ideas we're weighing. Your votes decide what moves up." },
  shipped: { label: "Shipped", tab: "Shipped", blurb: "In the app now. Tap one to see what changed." },
};

/** Votes are open until an item ships. */
export function roadmapVotingOpen(status: RoadmapStatus): boolean {
  return status !== "shipped";
}

export const ROADMAP_CATEGORIES = [
  "journaling",
  "tasks",
  "habits",
  "insights",
  "widgets",
  "account",
] as const;
export type RoadmapCategory = (typeof ROADMAP_CATEGORIES)[number];

export function isRoadmapCategory(s: unknown): s is RoadmapCategory {
  return typeof s === "string" && (ROADMAP_CATEGORIES as readonly string[]).includes(s);
}

/**
 * Label + banner colours per category. `from`/`to` are the card banner
 * gradient; icons are chosen per platform (Ionicons in the app, lucide on
 * the web) from the same key.
 */
export const ROADMAP_CATEGORY_META: Record<
  RoadmapCategory,
  { label: string; from: string; to: string }
> = {
  journaling: { label: "Journaling", from: "#F2785C", to: "#C2412D" },
  tasks: { label: "Tasks", from: "#F5A65B", to: "#E0703A" },
  habits: { label: "Habits & streaks", from: "#7BC67E", to: "#3E9A55" },
  insights: { label: "Insights", from: "#9B8CF2", to: "#6C55D9" },
  widgets: { label: "Widgets & iPhone", from: "#5BB8F5", to: "#2E7FD0" },
  account: { label: "Account", from: "#9AA3B2", to: "#5F6878" },
};

/** Fallback banner for an item with no category yet. */
export const ROADMAP_DEFAULT_BANNER = { from: "#F2785C", to: "#9B8CF2" };
