/**
 * GET /api/app/onboarding-config?installId=<id>
 *
 * The app's onboarding words and screen order for this install (2026-10-31,
 * per Keenan: change onboarding without an app update). Picks a variant from
 * the config saved at /admin/app-onboarding, sticky per installId.
 *
 * Public on purpose: it runs before the account exists, and it only returns
 * marketing copy. Any failure returns the empty "control" overrides, so the
 * app falls back to its bundled words.
 */
import { NextRequest, NextResponse } from "next/server";

import { pickOnboardingVariant, type OnboardingConfigResponse } from "@acuity/shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const installId = (req.nextUrl.searchParams.get("installId") ?? "").slice(0, 100);
  try {
    const { readOnboardingConfig } = await import("@/lib/remote-onboarding");
    const { config } = await readOnboardingConfig();
    // No install id (older app build): everyone gets the first live variant.
    const variant = installId ? pickOnboardingVariant(config, installId) : config.variants.find((v) => v.weight > 0) ?? config.variants[0];
    const body: OnboardingConfigResponse = { variant: variant.id, overrides: variant.overrides };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.warn("[onboarding-config] falling back to control:", e instanceof Error ? e.message : e);
    const body: OnboardingConfigResponse = { variant: "control", overrides: {} };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  }
}
