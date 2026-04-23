import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { PLAN_PRO_NAME } from "@acuity/shared";
import { UpgradePlanPicker } from "./upgrade-plan-picker";

export const dynamic = "force-dynamic";

export default async function UpgradePage({
  searchParams,
}: {
  searchParams?: { src?: string };
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin");

  // Analytics event — IMPLEMENTATION_PLAN_PAYWALL §8.3. The `src`
  // query parameter carries the origin (life_audit_body_link |
  // email_cta | mobile_profile | paywall_redirect |
  // lifemap_interstitial | null → "direct").
  try {
    const { track } = await import("@/lib/posthog");
    await track(session.user.id, "upgrade_page_viewed", {
      source: searchParams?.src ?? "direct",
    });
  } catch {
    // Don't block page render on analytics.
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="text-4xl mb-4">⚡</div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            Upgrade to {PLAN_PRO_NAME}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Keep everything you've built so far.
          </p>
        </div>

        {/* Pricing card */}
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6 shadow-sm mb-6">
          <UpgradePlanPicker />

          <ul className="space-y-3 mt-6 mb-2">
            {[
              "Unlimited nightly debriefs",
              "Sunday report every week",
              "Goals tracked across entries",
              "Life Matrix across 6 areas",
              "Mood scored nightly",
              "Priority support",
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-300">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#7C3AED"
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

          <p className="mt-3 text-center text-xs text-zinc-400 dark:text-zinc-500">
            Cancel anytime. No commitment.
          </p>
        </div>

        <a
          href="/home"
          className="block text-center text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 transition"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
