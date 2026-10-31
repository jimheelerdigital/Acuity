/**
 * /admin/app-onboarding — edit the app's onboarding words, screen order and
 * A/B variants without an app update (2026-10-31, per Keenan). The admin
 * layout gates access; saves go through /api/admin/app-onboarding.
 */
import { APP_ONBOARDING_DEFAULTS, APP_ONBOARDING_SCREEN_LABELS, readOnboardingConfig } from "@/lib/remote-onboarding";

import { OnboardingEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function AppOnboardingPage() {
  const { config, updatedAt } = await readOnboardingConfig();
  return (
    <OnboardingEditor
      initial={config}
      defaults={APP_ONBOARDING_DEFAULTS}
      screenLabels={APP_ONBOARDING_SCREEN_LABELS}
      updatedAt={updatedAt ? updatedAt.toISOString() : null}
    />
  );
}
