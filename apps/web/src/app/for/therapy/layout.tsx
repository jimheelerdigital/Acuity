import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Therapy Journaling App — Mental Health Between Sessions",
  description:
    "The mental health journaling app that fills the gap between therapy sessions. Track mood, detect emotional patterns, and show up with real data.",
  alternates: {
    canonical: "https://getacuity.io/for/therapy",
  },
  openGraph: {
    title: "AI Therapy Journaling — Mental Health Between Sessions",
    description:
      "The mental health journaling app that fills the gap between therapy sessions. Track mood, detect emotional patterns, and show up with real data.",
    url: "https://getacuity.io/for/therapy",
    images: [{ url: "/og-image.jpg", width: 1200, height: 1200, alt: "Acuity — AI journaling app" }],
  },
  twitter: {
    card: "summary",
    title: "AI Therapy Journaling — Mental Health Between Sessions",
    description:
      "Track mood and emotional patterns between therapy sessions. Show up with 7 days of real data instead of vague feelings.",
    images: ["/og-image.jpg"],
  },
};

export default function TherapyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
