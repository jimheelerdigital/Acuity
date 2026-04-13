import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join the Waitlist — Early Access + First Month Free",
  description:
    "Be first in line for Acuity. Get early access to the AI journaling app that turns your nightly voice brain dump into tasks, insights, and weekly reports.",
  alternates: {
    canonical: "https://getacuity.io/waitlist",
  },
  openGraph: {
    title: "Join the Acuity Waitlist — Early Access + First Month Free",
    description:
      "Be first in line for Acuity. Get early access to the AI journaling app that turns your nightly voice brain dump into tasks, insights, and weekly reports.",
    url: "https://getacuity.io/waitlist",
    images: [{ url: "/og-image.jpg", width: 1200, height: 1200, alt: "Acuity — AI journaling app" }],
  },
  twitter: {
    card: "summary",
    title: "Join the Acuity Waitlist — Early Access + First Month Free",
    description:
      "Be first in line for Acuity. AI journaling that turns a 60-second voice brain dump into tasks, insights, and weekly reports.",
    images: ["/og-image.jpg"],
  },
};

export default function WaitlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
