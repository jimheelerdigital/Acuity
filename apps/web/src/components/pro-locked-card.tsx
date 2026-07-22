"use client";

import {
  FREE_TIER_LOCKED_COPY,
  freeTierUpgradeUrl,
  type FreeTierLockedSurfaceId,
} from "@acuity/shared";

import { HeroCard } from "@/components/acuity";

/**
 * Pro-tier locked card — the v1.1 free-tier conversion surface from
 * `docs/v1-1/free-tier-phase2-plan.md` §B.2. Slice 8 upgrade
 * (2026-05-25): the bespoke violet-tinted card became an atmospheric
 * HeroCard composition so the locked state feels like part of the
 * product, not a blocking error page. The hero blob + tinted surface
 * read as "preserved, not deleted" — matching the post-expiry
 * messaging on the home banner + account card (slices 5 + 7).
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
  baseUrl = "https://app.goripple.io",
  className = "",
}: {
  surfaceId: Exclude<FreeTierLockedSurfaceId, "entry_detail_footer">;
  baseUrl?: string;
  className?: string;
}) {
  const copy = FREE_TIER_LOCKED_COPY[surfaceId];
  const href = freeTierUpgradeUrl(baseUrl, surfaceId);

  return (
    <HeroCard
      variant="primary"
      padding={6}
      className={className}
      data-surface-id={surfaceId}
    >
      {copy.eyebrow && (
        <p
          className="font-mono font-bold uppercase text-acuity-text-ter"
          style={{ fontSize: 10, letterSpacing: "1.4px" }}
        >
          {copy.eyebrow}
        </p>
      )}
      {copy.title && (
        <h3 className="mt-3 font-display text-xl font-bold tracking-tight text-acuity-text sm:text-2xl">
          {copy.title}
        </h3>
      )}
      <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-acuity-text-sec">
        {copy.body}
      </p>
      <div className="mt-5">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-acuity-pill bg-acuity-grad-primary px-5 py-2.5 text-[14px] font-semibold text-white shadow-acuity-glow-primary transition hover:brightness-110 active:scale-[0.98]"
        >
          {copy.ctaLabel}
        </a>
      </div>
    </HeroCard>
  );
}

/**
 * Single-line inline footer variant for entry-detail pages
 * (§B.2.6). Renders below the entry summary with a body-only
 * surface — no eyebrow, no title.
 */
export function ProLockedFooter({
  baseUrl = "https://app.goripple.io",
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
