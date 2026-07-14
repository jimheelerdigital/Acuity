import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ripple for Therapy — AI Mood Tracking and Pattern Detection Between Sessions",
  description:
    "Track your emotional patterns daily with an AI voice journal. Ripple gives you the data to make therapy more effective — mood tracking, AI pattern detection, and weekly mental health reports for less than one copay.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://getacuity.io/for/therapy" },
  openGraph: {
    title: "Ripple for Therapy — AI Mood Tracking and Pattern Detection Between Sessions",
    description:
      "Track your emotional patterns daily with an AI voice journal. Mood tracking, AI pattern detection, and weekly mental health reports for less than one therapy copay.",
    url: "https://getacuity.io/for/therapy",
    siteName: "Ripple",
    images: [{ url: "/og-image.png?v=3", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ripple for Therapy — AI Mood Tracking and Pattern Detection",
    description:
      "Track your emotional patterns daily with an AI voice journal. Weekly mental health reports for less than one copay.",
    images: ["/og-image.png?v=3"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
