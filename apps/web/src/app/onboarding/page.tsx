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
 * 8-step onboarding flow entry point. Driven by ?step=N query param.
 *
 * Scaffold only — each step component is a stub with a TODO comment
 * + placeholder copy. Fill in content when the onboarding spec lands.
 *
 * New users route here after createUser (via lib/auth.ts events), and
 * /dashboard redirects unfinished onboarding here too (so a user who
 * closes the browser mid-flow resumes where they left off).
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

  // Short-circuit users who've already finished.
  const { prisma } = await import("@/lib/prisma");
  const onboarding = await prisma.userOnboarding.findUnique({
    where: { userId: session.user.id },
  });
  if (onboarding?.completedAt) {
    redirect("/dashboard");
  }

  const requestedStep = Number(searchParams?.step ?? "1");
  const step = clampStep(requestedStep);

  // If the DB knows a later currentStep than the URL requests, honor
  // the URL (back-navigation must work). Only update DB when moving
  // forward past the previous high-water mark.
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

  const StepComponent = ONBOARDING_STEPS[step].Component;

  return (
    <OnboardingShell step={step} totalSteps={ONBOARDING_STEPS.length}>
      <StepComponent />
    </OnboardingShell>
  );
}

function clampStep(n: number): OnboardingStepNumber {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 8) return 8;
  return n as OnboardingStepNumber;
}
