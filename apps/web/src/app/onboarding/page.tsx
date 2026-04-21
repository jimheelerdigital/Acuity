import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";

import { OnboardingShell } from "./onboarding-shell";
import {
  ONBOARDING_STEPS,
  type OnboardingStepNumber,
} from "./steps/steps-registry";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Welcome to Acuity",
  robots: { index: false, follow: false },
};

/**
 * 8-step onboarding flow entry point. Driven by `?step=N` query param.
 *
 * New users land here after createUser (via lib/auth.ts events). The
 * dashboard also redirects users whose UserOnboarding.completedAt is
 * null back into the flow so a browser close mid-flow resumes where
 * they left off.
 *
 * Completion handling lives in the client shell via
 * POST /api/onboarding/complete, called on step 8's Record CTA or on
 * the Skip-for-now confirmation modal. The shell fires PostHog events
 * at the appropriate boundaries.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: { step?: string };
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/onboarding");
  }

  const { prisma } = await import("@/lib/prisma");
  const onboarding = await prisma.userOnboarding.findUnique({
    where: { userId: session.user.id },
  });

  if (onboarding?.completedAt) {
    redirect("/dashboard");
  }

  const requestedStep = Number(searchParams?.step ?? "1");
  const step = clampStep(requestedStep);

  // Record the first hit (no row yet) and advance the high-water mark
  // on forward nav. Back-nav intentionally does NOT rewind
  // currentStep — that column exists to tell the dashboard the
  // furthest point the user reached, not their current view.
  if (!onboarding) {
    await prisma.userOnboarding.create({
      data: { userId: session.user.id, currentStep: step },
    });
  } else if (step > onboarding.currentStep) {
    await prisma.userOnboarding.update({
      where: { userId: session.user.id },
      data: { currentStep: step },
    });
  }

  const entry = ONBOARDING_STEPS.find((s) => s.step === step);
  if (!entry) {
    // Unreachable given clampStep, but the typesystem wants a safety net.
    redirect("/onboarding?step=1");
  }
  const StepComponent = entry.Component;

  return (
    <OnboardingShell step={step} totalSteps={ONBOARDING_STEPS.length}>
      <StepComponent />
    </OnboardingShell>
  );
}

function clampStep(n: number): OnboardingStepNumber {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 10) return 10;
  return n as OnboardingStepNumber;
}
