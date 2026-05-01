import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start Your Free Trial — 14-Day Free Trial",
  description:
    "Try Acuity free for 14 days. The AI journaling app that turns 60-second nightly voice brain dumps into extracted tasks, mood tracking, pattern detection, and weekly AI reports. No credit card required.",
  alternates: { canonical: "https://getacuity.io/waitlist" },
  openGraph: {
    title: "Start Your Free Trial — 14-Day Free Trial",
    description:
      "Try Acuity free for 14 days. The AI journaling app that turns nightly voice brain dumps into tasks, mood tracking, and weekly AI reports.",
    url: "https://getacuity.io/waitlist",
    siteName: "Acuity",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Start Your Free Trial — 14-Day Free Trial",
    description:
      "Try Acuity free for 14 days. 60-second nightly voice brain dumps turned into tasks, mood tracking, and weekly AI reports.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
