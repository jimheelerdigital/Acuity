"use client";

import {
  FREE_TIER_LOCKED_COPY,
  freeTierUpgradeUrl,
  type FreeTierLockedSurfaceId,
} from "@acuity/shared";

/**
 * Pro-tier locked card — the v1.1 free-tier conversion surface from
 * `docs/v1-1/free-tier-phase2-plan.md` §B.2.
 *
 * NOT the same component as `LockedFeatureCard` (which gates on
 * EXPERIENTIAL unlocks — "record more to see this"). This card gates
 * on BILLING — FREE post-trial users see it, TRIAL/PRO users do not.
 *
 * Apple Review compliance (Option C — `docs/APPLE_IAP_DECISION.md`):
 *   - "Pro" eyebrow makes the gate explicit (not a broken feature).
 *   - Single CTA "Continue on web →" opens the user's default
 *     browser via plain anchor; never an in-app WebView (would
 *     conflict with §3.1.3(b)).
 *   - No "$", "/mo", "Subscribe", or "Upgrade" tokens. The
 *     free-tier copy file has a unit test enforcing this.
 *
 * Copy is keyed by surface id from the shared copy file so a
 * marketing edit doesn't require touching this component.
 */
export function ProLockedCard({
  surfaceId,
  baseUrl = "https://app.getacuity.io",
  className = "",
}: {
  surfaceId: Exclude<FreeTierLockedSurfaceId, "entry_detail_footer">;
  baseUrl?: string;
  className?: string;
}) {
  const copy = FREE_TIER_LOCKED_COPY[surfaceId];
  const href = freeTierUpgradeUrl(baseUrl, surfaceId);

  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-gradient-to-br from-violet-50/40 to-white p-6 dark:border-white/10 dark:from-violet-950/10 dark:to-[#1E1E2E] ${className}`}
      data-surface-id={surfaceId}
    >
      {copy.eyebrow && (
        <p
          className="font-semibold uppercase text-violet-600 dark:text-violet-400"
          style={{ fontSize: 11, letterSpacing: "0.18em" }}
        >
          {copy.eyebrow}
        </p>
      )}
      {copy.title && (
        <h3 className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {copy.title}
        </h3>
      )}
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        {copy.body}
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {copy.ctaLabel}
      </a>
    </section>
  );
}

/**
 * Single-line inline footer variant for entry-detail pages
 * (§B.2.6). Renders below the entry summary with a body-only
 * surface — no eyebrow, no title.
 */
export function ProLockedFooter({
  baseUrl = "https://app.getacuity.io",
  className = "",
}: {
  baseUrl?: string;
  className?: string;
}) {
  const copy = FREE_TIER_LOCKED_COPY.entry_detail_footer;
  const href = freeTierUpgradeUrl(baseUrl, "entry_detail_footer");
  // The body already ends in "Continue on web →" so we don't need a
  // separate visible CTA. Wrap the entire body in an anchor.
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-surface-id="entry_detail_footer"
      className={`block text-xs text-zinc-500 transition hover:text-violet-600 dark:text-zinc-400 dark:hover:text-violet-300 ${className}`}
    >
      {copy.body}
    </a>
  );
}
