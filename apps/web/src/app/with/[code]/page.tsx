/**
 * /with/<CODE> — where a creator's referral link (/c/<CODE>) lands. The
 * normal Ripple homepage with one change (spec 2026-10-22): a line reading
 * "Sent by <first name> · your code <CODE> is saved", so the visitor can type
 * the code in the app if the cookie is lost. The store badges open a small
 * "drop your email and we'll send the link" step (Road 3 of attribution).
 *
 * noindex: these are per-creator duplicates of the homepage.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HomeV2 } from "@/components/marketing/home-v2/HomeV2";
import { firstNameOf } from "@/lib/creators/money";
import {
  displayAnnual,
  displayAnnualAsMonthly,
  displayMonthly,
  displaySavingsPct,
} from "@/lib/pricing";

import { CreatorLanding } from "./creator-landing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Ripple: AI Voice Journal & Habit Tracker App" },
  robots: { index: false, follow: false },
};

export default async function CreatorLandingPage({ params }: { params: { code: string } }) {
  const { resolveCode } = await import("@/lib/creators/codes");
  const creator = await resolveCode(params.code);
  if (!creator) notFound();
  const code = creator.referralCode;
  const name = creator.firstName ?? firstNameOf(creator.displayName, creator.handle);
  return (
    <CreatorLanding code={code} name={name}>
      <HomeV2
        pricing={{
          annual: displayAnnual(),
          monthly: displayMonthly(),
          annualPerMonth: displayAnnualAsMonthly(),
          savingsPct: displaySavingsPct(),
        }}
      />
    </CreatorLanding>
  );
}
