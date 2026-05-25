import dynamic from "next/dynamic";
import type { Metadata } from "next";

const OnboardingFunnel = dynamic(
  () =>
    import("@/components/onboarding-funnel").then((m) => ({
      default: m.OnboardingFunnel,
    })),
  { ssr: false },
);

export const metadata: Metadata = {
  title: "Get Started — Acuity",
  description:
    "Start your Acuity journey. Record your first 60-second debrief and see what AI extracts.",
  robots: { index: false, follow: false },
};

export default function StartPage() {
  return <OnboardingFunnel />;
}
