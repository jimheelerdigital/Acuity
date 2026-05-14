import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acuity Decoded — AI Pattern Detection for Your Life",
  description:
    "Most people have no idea what's driving their moods, decisions, and habits. Acuity is the AI voice journal that surfaces the patterns you can't see — mood tracking, life pattern detection, and weekly reports from your daily debrief.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://getacuity.io/for/decoded" },
  openGraph: {
    title: "Acuity Decoded — AI Pattern Detection for Your Life",
    description:
      "The AI voice journal that surfaces the patterns you can't see — mood tracking, life pattern detection, and weekly reports from your daily debrief.",
    url: "https://getacuity.io/for/decoded",
    siteName: "Acuity",
    images: [{ url: "/og-image.png?v=2", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Acuity Decoded — AI Pattern Detection for Your Life",
    description:
      "The AI voice journal that surfaces the patterns you can't see — mood tracking, pattern detection, and weekly reports.",
    images: ["/og-image.png?v=2"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
