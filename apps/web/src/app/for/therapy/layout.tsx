import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acuity for Therapy — AI Emotional Pattern Tracking Between Sessions",
  description:
    "Track your emotional patterns nightly with AI. Acuity gives you the data to make therapy more effective — mood tracking, pattern detection, and weekly mental health reports for less than one copay.",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://getacuity.io/for/therapy" },
  openGraph: {
    title: "Acuity for Therapy — AI Emotional Pattern Tracking",
    description:
      "Track your emotional patterns nightly with AI. Mood tracking, pattern detection, and weekly mental health reports for less than one therapy copay.",
    url: "https://getacuity.io/for/therapy",
    siteName: "Acuity",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary",
    title: "Acuity for Therapy — AI Emotional Pattern Tracking",
    description:
      "Track your emotional patterns nightly with AI. Weekly mental health reports for less than one copay.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
