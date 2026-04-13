import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nightly Debrief App for Founders — AI Productivity Journal",
  description:
    "The executive brain dump app for founders and high performers. 60-second nightly debrief that extracts tasks, tracks goals, and writes your weekly report.",
  alternates: {
    canonical: "https://getacuity.io/for/founders",
  },
  openGraph: {
    title: "Nightly Debrief App for Founders — AI Productivity Journal",
    description:
      "The executive brain dump app for founders and high performers. 60-second nightly debrief that extracts tasks, tracks goals, and writes your weekly report.",
    url: "https://getacuity.io/for/founders",
    images: [{ url: "/og-image.jpg", width: 1200, height: 1200, alt: "Acuity — AI journaling app" }],
  },
  twitter: {
    card: "summary",
    title: "Nightly Debrief App for Founders — AI Productivity Journal",
    description:
      "60-second nightly debrief for founders. AI extracts tasks, tracks goals, and writes your weekly performance report.",
    images: ["/og-image.jpg"],
  },
};

export default function FoundersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
