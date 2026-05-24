"use client";

import { useEffect, useState } from "react";

import { Card, GradientText, SectionHeader } from "@/components/acuity";

/**
 * TrialStatusCard — slice 5 (2026-05-25). Replaces the existing
 * "Free trial · Ends MM/DD" hint in SubscriptionSection with a
 * richer state-aware card at the top of /account.
 *
 * Four visual states based on (subscriptionStatus, daysRemaining):
 *
 *   1. TRIAL with daysRemaining > 7
 *      Atmospheric Card. Mono "TRIAL" eyebrow. Display "N days
 *      left." Body explains what happens after.
 *
 *   2. TRIAL with daysRemaining 4-7
 *      Same composition; the day count gets gradient-mix tint via
 *      <GradientText> so it pops without screaming.
 *
 *   3. TRIAL with daysRemaining 1-3
 *      WARN_AMBER accent on the count + inline "Continue on web →"
 *      CTA. Atmospheric urgency — visible, not a banner-yell.
 *
 *   4. FREE with trialExpiredAt recent
 *      "TRIAL ENDED" eyebrow. Explains what's locked + what's free.
 *      Continue-on-web CTA. Stays visible indefinitely until the
 *      user upgrades (no auto-dismiss; that decision is theirs).
 *
 * Renders null for everyone else (PRO, never-trialed, FREE long
 * after expiry — the last gets a softer treatment in SubscriptionSection
 * already, no need to double up).
 *
 * Re-computes `daysRemaining` on a 1-minute interval so a user
 * leaving the tab open over the trial-end boundary sees the count
 * tick (and eventually the FREE-post copy after the server's
 * 02:00 UTC cron flips them).
 */

export interface TrialStatusCardProps {
  subscriptionStatus: string;
  trialEndsAt: string | null;
  trialExpiredAt: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const POST_EXPIRY_BANNER_DAYS = 14;
const UPGRADE_HREF = "/upgrade?src=account_trial_card";

function daysFromMs(ms: number): number {
  return Math.max(0, Math.ceil(ms / MS_PER_DAY));
}

export function TrialStatusCard({
  subscriptionStatus,
  trialEndsAt,
  trialExpiredAt,
}: TrialStatusCardProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // FREE-post-expiry: render the locked-state card for ~14 days
  // after the expiration cron stamped trialExpiredAt. Past that,
  // the existing SubscriptionSection handles the long-dormant case
  // (Subscribe CTA, etc.).
  if (subscriptionStatus === "FREE" && trialExpiredAt) {
    const expiredAt = new Date(trialExpiredAt).getTime();
    const daysSinceExpiry = (now - expiredAt) / MS_PER_DAY;
    if (daysSinceExpiry >= 0 && daysSinceExpiry <= POST_EXPIRY_BANNER_DAYS) {
      return <PostExpiryCard />;
    }
    return null;
  }

  if (subscriptionStatus !== "TRIAL" || !trialEndsAt) return null;

  const endMs = new Date(trialEndsAt).getTime();
  const remainingMs = endMs - now;
  const daysRemaining = daysFromMs(remainingMs);

  if (daysRemaining <= 0) {
    // Trial ended but cron hasn't flipped status yet (sub-1h
    // skew buffer + cron runs daily). Show the "ended" copy.
    return <PostExpiryCard />;
  }
  if (daysRemaining <= 3) return <UrgentTrialCard daysRemaining={daysRemaining} />;
  if (daysRemaining <= 7) return <MidTrialCard daysRemaining={daysRemaining} />;
  return <StandardTrialCard daysRemaining={daysRemaining} />;
}

function StandardTrialCard({ daysRemaining }: { daysRemaining: number }) {
  return (
    <Card variant="default" radius="xl" padding={6} className="mb-6">
      <SectionHeader label="Trial" />
      <p className="mt-3 font-display text-3xl font-bold tracking-tight text-acuity-text sm:text-4xl">
        {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-acuity-text-sec">
        After your trial, recording stays yours. Life Matrix, Theme
        Map, and weekly insights move to Pro.
      </p>
    </Card>
  );
}

function MidTrialCard({ daysRemaining }: { daysRemaining: number }) {
  return (
    <Card variant="default" radius="xl" padding={6} className="mb-6">
      <SectionHeader label="Trial" />
      <p className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        <GradientText variant="mix">
          {daysRemaining} {daysRemaining === 1 ? "day" : "days"}
        </GradientText>
        <span className="text-acuity-text"> left</span>
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-acuity-text-sec">
        After your trial, recording stays yours. Life Matrix, Theme
        Map, and weekly insights move to Pro.
      </p>
    </Card>
  );
}

function UrgentTrialCard({ daysRemaining }: { daysRemaining: number }) {
  return (
    <Card variant="default" radius="xl" padding={6} className="mb-6">
      <SectionHeader label="Trial" />
      <p className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        <span style={{ color: "var(--acuity-warn)" }}>
          {daysRemaining} {daysRemaining === 1 ? "day" : "days"}
        </span>
        <span className="text-acuity-text"> left</span>
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-acuity-text-sec">
        After your trial ends, recording stays free. Life Matrix and
        Theme Map lock until you continue on web.
      </p>
      <div className="mt-5">
        <a
          href={UPGRADE_HREF}
          className="inline-flex items-center gap-2 rounded-acuity-pill bg-acuity-grad-primary px-5 py-2.5 text-[14px] font-semibold text-white shadow-acuity-glow-primary transition hover:brightness-110 active:scale-[0.98]"
        >
          Continue on web
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </Card>
  );
}

function PostExpiryCard() {
  return (
    <Card variant="default" radius="xl" padding={6} className="mb-6">
      <SectionHeader label="Trial ended" />
      <p className="mt-3 font-display text-3xl font-bold tracking-tight text-acuity-text sm:text-4xl">
        Your insights are paused
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-acuity-text-sec">
        Recording stays yours. Your data is preserved. Life Matrix,
        Theme Map, and weekly insights are saved exactly where you
        left them — continue on web to bring them back.
      </p>
      <div className="mt-5">
        <a
          href={UPGRADE_HREF}
          className="inline-flex items-center gap-2 rounded-acuity-pill bg-acuity-grad-primary px-5 py-2.5 text-[14px] font-semibold text-white shadow-acuity-glow-primary transition hover:brightness-110 active:scale-[0.98]"
        >
          Continue on web
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </Card>
  );
}
