"use client";

import { useEffect } from "react";

import { HeroCard, ThemePill } from "@/components/acuity";

import { useOnboarding } from "../onboarding-context";

/**
 * Slice 4 (2026-05-22) — weekly-report priming.
 *
 * Replaces the deleted "life-area priorities" step at this same
 * registry slot (step 7 in flow order). Per audit verdict, the old
 * field was write-only metadata — nothing downstream depended on it.
 *
 * Purpose: prime the new user on the Sunday-morning artifact that
 * drives most acquisitions. Per docs/Acuity_SalesCopy.md §7.2 the
 * weekly report is the hero conversion driver; this step is the
 * onboarding touchpoint where they see what that report actually
 * looks like.
 *
 * Voice: Accountability per §8 — direct, matter-of-fact, specific.
 * No "AI-powered" framing, no abstract clarity claims, no rhetorical
 * questions. Sample report copy uses proper-noun-feeling specifics
 * (week number, mood numerals, theme pills) so the reader can
 * picture the artifact instead of imagining a vague benefit.
 *
 * Read-only step — auto-enables Continue; no captured data.
 */
export function Step6WeeklyReportPriming() {
  const { setCanContinue, setCapturedData } = useOnboarding();

  useEffect(() => {
    setCanContinue(true);
    setCapturedData(null);
  }, [setCanContinue, setCapturedData]);

  return (
    <div className="acuity-fade-up">
      <div className="mb-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          Every Sunday morning
        </span>
      </div>
      <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-acuity-text sm:text-4xl">
        A report like this lands in your inbox.
      </h1>
      <p className="mt-3 text-base leading-relaxed text-acuity-text-sec">
        You talk for a minute each night. Ripple stitches the week into
        a 400-word read on Sunday morning — your patterns, your wins,
        the names that kept coming up.
      </p>

      <div className="mt-8">
        <HeroCard variant="primary" padding={6}>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
              Week 3
            </span>
            <span className="text-acuity-text-ter">·</span>
            <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-acuity-text-quiet">
              Sunday, 8:14am
            </span>
          </div>

          <p className="mt-4 font-display text-xl font-medium leading-snug text-acuity-text">
            “Your VP came up three times this week — twice positive,
            once after Thursday's review.”
          </p>

          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-acuity-line pt-5">
            <Stat label="Entries" value="6 / 7" />
            <Stat label="Mood arc" value="6.8 → 7.4" />
            <Stat label="Tasks done" value="9 / 12" />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <ThemePill theme="career" size="s" />
            <ThemePill theme="family" size="s" />
            <ThemePill theme="sleep" size="s" />
          </div>

          <p className="mt-5 text-sm leading-relaxed text-acuity-text-sec">
            Your sleep mentions dropped from 4 last week to 1 this
            week. Mood on those nights averaged 7.2 — up from 5.8 in
            week 1.
          </p>
        </HeroCard>
      </div>

      <p className="mt-6 text-center text-sm leading-relaxed text-acuity-text-ter">
        Real reports use your own words and the names you actually
        mention. Above is a sample.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
        {label}
      </div>
      <div className="mt-1 font-display text-base font-bold tracking-tight text-acuity-text">
        {value}
      </div>
    </div>
  );
}
