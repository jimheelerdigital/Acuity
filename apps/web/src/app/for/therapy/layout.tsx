import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acuity for Therapy — AI Mood Tracking and Pattern Detection Between Sessions",
  description:
    "Track your emotional patterns daily with an AI voice journal. Acuity gives you the data to make therapy more effective — mood tracking, AI pattern detection, and weekly mental health reports for less than one copay.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://getacuity.io/for/therapy" },
  openGraph: {
    title: "Acuity for Therapy — AI Mood Tracking and Pattern Detection Between Sessions",
    description:
      "Track your emotional patterns daily with an AI voice journal. Mood tracking, AI pattern detection, and weekly mental health reports for less than one therapy copay.",
    url: "https://getacuity.io/for/therapy",
    siteName: "Acuity",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Acuity for Therapy — AI Mood Tracking and Pattern Detection",
    description:
      "Track your emotional patterns daily with an AI voice journal. Weekly mental health reports for less than one copay.",
    images: ["/og-image.png"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
