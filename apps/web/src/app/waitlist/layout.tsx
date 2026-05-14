import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start Your Free Trial — 14-Day Free Trial",
  description:
    "Try Acuity free for 14 days. The AI voice journal app that turns your daily debrief into extracted tasks, goal tracking, mood tracking, pattern detection, and weekly reports. $12.99/mo after trial. No credit card required.",
  alternates: { canonical: "https://getacuity.io/waitlist" },
  openGraph: {
    title: "Start Your Free Trial — 14-Day Free Trial",
    description:
      "Try Acuity free for 14 days. The AI voice journal app that turns your daily debrief into tasks, goal tracking, mood tracking, and weekly reports.",
    url: "https://getacuity.io/waitlist",
    siteName: "Acuity",
    images: [{ url: "/og-image.png?v=2", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Start Your Free Trial — 14-Day Free Trial",
    description:
      "Try Acuity free for 14 days. The AI voice journal that turns your daily debrief into tasks, mood tracking, and weekly reports.",
    images: ["/og-image.png?v=2"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
