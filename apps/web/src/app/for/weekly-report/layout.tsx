import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acuity Weekly Report — Every Sunday, AI Writes Your Week Back to You",
  description:
    "From your own voice notes: your wins, your patterns, what you said you'd do versus what actually happened. A 400-word AI-written narrative of your week, delivered every Sunday.",
  alternates: { canonical: "https://getacuity.io/for/weekly-report" },
  openGraph: {
    title: "Acuity Weekly Report — Every Sunday, AI Writes Your Week Back to You",
    description:
      "Your wins, your patterns, what you said you'd do versus what happened. A 400-word AI narrative of your week, every Sunday.",
    url: "https://getacuity.io/for/weekly-report",
    siteName: "Acuity",
    images: [{ url: "/og-image.jpg", width: 1200, height: 1200 }],
  },
  twitter: {
    card: "summary",
    title: "Acuity Weekly Report — Every Sunday, AI Writes Your Week Back to You",
    description:
      "Your wins, your patterns, what you said you'd do versus what happened. A 400-word AI narrative of your week.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
