import dynamic from "next/dynamic";
import type { Metadata } from "next";

const TryDebriefFlow = dynamic(
  () =>
    import("@/components/try-debrief-flow").then((m) => ({
      default: m.TryDebriefFlow,
    })),
  { ssr: false },
);

export const metadata: Metadata = {
  title: "Try Acuity — Free",
  description:
    "Record a 60-second voice debrief and see what Acuity extracts — tasks, goals, mood, and patterns. No signup required.",
  robots: { index: false, follow: false },
};

export default function TryPage() {
  return <TryDebriefFlow />;
}
