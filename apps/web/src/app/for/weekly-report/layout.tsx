import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acuity Weekly Report — Every Sunday, AI Writes Your Week Back to You",
  description:
    "From your daily voice journal: your wins, your patterns, what you said you'd do versus what actually happened. A 400-word AI-written weekly report delivered every Sunday from your daily debrief entries.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://getacuity.io/for/weekly-report" },
  openGraph: {
    title: "Acuity Weekly Report — Every Sunday, AI Writes Your Week Back to You",
    description:
      "From your daily voice journal: your wins, your patterns, what you said you'd do versus what happened. An AI-written weekly report, every Sunday.",
    url: "https://getacuity.io/for/weekly-report",
    siteName: "Acuity",
    images: [{ url: "/og-image.png?v=2", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Acuity Weekly Report — Every Sunday, AI Writes Your Week Back to You",
    description:
      "From your daily voice journal: your wins, your patterns, what you said you'd do versus what happened. An AI-written weekly report.",
    images: ["/og-image.png?v=2"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
