/**
 * v1.1 free-tier locked-state copy — single source of truth for the
 * §B.2 conversion surfaces (`docs/v1-1/free-tier-phase2-plan.md`).
 *
 * Web (apps/web) and mobile (apps/mobile) both import from here so
 * the strings stay aligned across platforms and a copy edit is one
 * file change, not six.
 *
 * Apple Review compliance (Option C — `docs/APPLE_IAP_DECISION.md:166-169`):
 *   - No "$", no "/mo", no "Subscribe", no "Upgrade".
 *   - Single CTA: "Continue on web →" opening Safari to the upgrade
 *     surface with the per-card `src=` query param so funnel
 *     attribution slices cleanly by surface.
 *   - Locked cards explicitly state "this is a Pro thing" — they're
 *     signposted gates, not broken features.
 */

/**
 * Stable surface identifier. Used as the `src=` query param on the
 * upgrade-page link so PostHog funnels can attribute conversions to
 * the originating card. Add new ids here; never reuse an old one.
 */
export type FreeTierLockedSurfaceId =
  | "pro_pulse_home"
  | "life_matrix_locked"
  | "goals_suggestions_locked"
  | "tasks_empty_state"
  | "theme_map_locked"
  | "entry_detail_footer"
  | "calendar_connect_locked";

export interface FreeTierLockedCopy {
  /** Surface id — used for analytics + the `src=` query param. */
  id: FreeTierLockedSurfaceId;
  /**
   * "Pro" eyebrow above the title. Optional because the entry-
   * detail footer surface is inline and has no eyebrow.
   */
  eyebrow?: string;
  /**
   * Card title. Plain sentence; no marketing flourish. Optional
   * because the entry-detail footer is single-sentence and has no
   * separate title.
   */
  title?: string;
  /**
   * Body copy. Use \n for paragraph breaks within a single card.
   * For the entry-detail footer this is the entire one-line copy.
   */
  body: string;
  /**
   * Visible CTA label. All cards use the same string per Option C
   * compliance — kept here for the few cases where we want to vary
   * (currently none, but trivially editable in one place).
   */
  ctaLabel: string;
}

/**
 * The §B.2 verbatim copy. Editing these strings is the operational
 * lever for the v1.1 locked-state experience — a copy change requires
 * NO code review beyond this file.
 */
export const FREE_TIER_LOCKED_COPY: Record<
  FreeTierLockedSurfaceId,
  FreeTierLockedCopy
> = {
  // §B.2.1 — Pro pulse card on /home (mobile + web)
  pro_pulse_home: {
    id: "pro_pulse_home",
    eyebrow: "Pro",
    title: "Today's prompt, from your journal",
    body: '"What would last week\'s you have wanted today\'s you to follow up on?"\n\nPro reads your recordings and writes prompts that match what you\'ve been working through.',
    ctaLabel: "Continue on web →",
  },

  // §B.2.2 — Life Matrix locked card (insights + /home + /life-matrix)
  life_matrix_locked: {
    id: "life_matrix_locked",
    eyebrow: "Pro",
    title: "Your six life areas",
    body: "Career, Health, Relationships, Finances, Personal, Other — scored from 1 to 10, refreshed as you record. Free keeps the journal. Pro keeps the read.",
    ctaLabel: "Continue on web →",
  },

  // §B.2.3 — Goals suggestions locked card (goals tab)
  goals_suggestions_locked: {
    id: "goals_suggestions_locked",
    eyebrow: "Pro",
    title: "Goals you didn't know you set",
    body: "When you mention something you're working toward, Acuity flags it as a candidate sub-goal. You stay in control — accept the ones that fit, dismiss the rest.",
    ctaLabel: "Continue on web →",
  },

  // §B.2.4 — Tasks empty state (tasks tab)
  tasks_empty_state: {
    id: "tasks_empty_state",
    title: "No tasks here yet",
    body: 'Acuity used to spot these in your recordings — "I should email Sarah", "I want to look into that course" — and queue them up. Pro keeps that running.',
    ctaLabel: "Continue on web →",
  },

  // §B.2.5 — Theme Map locked card (insights + /insights/theme-map)
  theme_map_locked: {
    id: "theme_map_locked",
    eyebrow: "Pro",
    title: "Your themes, mapped",
    body: "Career, sleep, that side project — the threads running through your journal, sized by how often you return to them. Pro draws the map; Free keeps the entries.",
    ctaLabel: "Continue on web →",
  },

  // §B.2.6 — Entry detail footer (mobile + web)
  entry_detail_footer: {
    id: "entry_detail_footer",
    body: "Themes, tasks, and goal flags are a Pro thing. Continue on web →",
    ctaLabel: "Continue on web →",
  },

  // Calendar slice C5b — locked state on /account/integrations + the
  // mobile integrations placeholder screen. FREE post-trial users
  // see this card instead of the connect flow.
  calendar_connect_locked: {
    id: "calendar_connect_locked",
    eyebrow: "Pro",
    title: "Tasks on your calendar",
    body: "Send tasks with due dates straight to your Apple, Google, or Outlook calendar — they show up where you already plan your day. Free keeps the journal. Pro keeps the sync.",
    ctaLabel: "Continue on web →",
  },
};

/**
 * Build the upgrade URL for a given surface id. Same shape both
 * platforms emit so PostHog funnels group cleanly. The base URL is
 * the production web app (Apple-Review-compliant external link).
 */
export function freeTierUpgradeUrl(
  baseUrl: string,
  surfaceId: FreeTierLockedSurfaceId
): string {
  // Trim a trailing slash so we get one canonical shape.
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/upgrade?src=${surfaceId}`;
}
