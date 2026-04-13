import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Weekly Report Journal — Weekly Life Summary & Insights",
  description:
    "Get an AI-written weekly life summary with mood trends, goal progress, and actionable insights. Your life scored across 6 areas and tracked over time.",
  alternates: {
    canonical: "https://getacuity.io/for/weekly-report",
  },
  openGraph: {
    title: "AI Weekly Report Journal — Weekly Life Summary & Insights",
    description:
      "Get an AI-written weekly life summary with mood trends, goal progress, and actionable insights. Your life scored across 6 areas and tracked over time.",
    url: "https://getacuity.io/for/weekly-report",
    images: [{ url: "/og-image.jpg", width: 1200, height: 1200, alt: "Acuity — AI journaling app" }],
  },
  twitter: {
    card: "summary",
    title: "AI Weekly Report Journal — Your Week, Written by AI",
    description:
      "Weekly AI reports, Life Matrix scoring, goal tracking, and mood analysis. Your week summarized in a 400-word narrative.",
    images: ["/og-image.jpg"],
  },
};

export default function WeeklyReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
