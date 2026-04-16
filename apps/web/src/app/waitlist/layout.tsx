import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join the Acuity Waitlist — First Month Free",
  description:
    "Be first in line for Acuity, the AI journaling app that turns 60-second nightly voice brain dumps into extracted tasks, mood tracking, pattern detection, and weekly AI reports. First month free.",
  alternates: { canonical: "https://getacuity.io/waitlist" },
  openGraph: {
    title: "Join the Acuity Waitlist — First Month Free",
    description:
      "Be first in line for Acuity, the AI journaling app that turns nightly voice brain dumps into tasks, mood tracking, and weekly AI reports.",
    url: "https://getacuity.io/waitlist",
    siteName: "Acuity",
    images: [{ url: "/og-image.jpg", width: 1200, height: 1200 }],
  },
  twitter: {
    card: "summary",
    title: "Join the Acuity Waitlist — First Month Free",
    description:
      "Be first in line for Acuity. 60-second nightly voice brain dumps turned into tasks, mood tracking, and weekly AI reports.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
