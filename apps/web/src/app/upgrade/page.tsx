import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { PLAN_PRO_NAME } from "@acuity/shared";
import { Card, HeroCard } from "@/components/acuity";
import { MobileAppBanner } from "@/components/mobile-app-banner";
import { UpgradePlanPicker } from "./upgrade-plan-picker";

export const dynamic = "force-dynamic";

/**
 * /upgrade — atmospheric paywall. Slice 14 (2026-05-22) refresh:
 * canonical primitives, Accountability voice per Acuity_SalesCopy.md
 * §7.2 / §8 ("keep what you've built"). HeroCard variant=mix as the
 * hero block; bullet list inside a default Card; tokenized check SVG
 * stroke instead of the hardcoded `#7C3AED`.
 *
 * Copy adjusted: "Life Matrix across 6 areas" → "Life Matrix across
 * 10 areas" (Phase D vocab).
 */
export default async function UpgradePage({
  searchParams,
}: {
  searchParams?: { src?: string };
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  // Analytics event — IMPLEMENTATION_PLAN_PAYWALL §8.3.
  try {
    const { track } = await import("@/lib/posthog");
    await track(session.user.id, "upgrade_page_viewed", {
      source: searchParams?.src ?? "direct",
    });
  } catch {
    // Don't block page render on analytics.
  }

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <MobileAppBanner />
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="acuity-fade-up w-full max-w-md">
          <div className="mb-6 text-center">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
              Acuity Pro
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-acuity-text">
              Keep what you&rsquo;ve built.
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-acuity-text-sec">
              Your trial is short. The patterns are long. Pro keeps the
              weekly report landing and the matrix updating.
            </p>
          </div>

          <Card variant="default" radius="xl" padding={6} className="mb-4">
            <UpgradePlanPicker />

            <ul className="mt-6 space-y-3">
              {[
                "Unlimited nightly debriefs",
                "Sunday report every week",
                "Goals tracked across entries",
                "Life Matrix across 10 areas",
                "Mood scored nightly",
                "Priority support",
              ].map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-2.5 text-sm text-acuity-text-sec"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--acuity-primary)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            <p className="mt-4 text-center text-xs text-acuity-text-quiet">
              Cancel anytime. No commitment.
            </p>
          </Card>

          <a
            href="/home"
            className="block text-center text-sm text-acuity-text-sec transition hover:text-acuity-text"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
