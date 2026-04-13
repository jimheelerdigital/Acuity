import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Brain Dump Before Bed — Stop Racing Thoughts at Night",
  description:
    "Journaling for better sleep. Dump your racing thoughts in 60 seconds before bed so your brain can let go. AI organizes everything by morning.",
  alternates: {
    canonical: "https://getacuity.io/for/sleep",
  },
  openGraph: {
    title: "Brain Dump Before Bed — Stop Racing Thoughts at Night",
    description:
      "Journaling for better sleep. Dump your racing thoughts in 60 seconds before bed so your brain can let go. AI organizes everything by morning.",
    url: "https://getacuity.io/for/sleep",
    images: [{ url: "/og-image.jpg", width: 1200, height: 1200, alt: "Acuity — AI journaling app" }],
  },
  twitter: {
    card: "summary",
    title: "Brain Dump Before Bed — Stop Racing Thoughts at Night",
    description:
      "Stop racing thoughts at night. A 60-second brain dump before bed so your mind can let go and you wake up clear.",
    images: ["/og-image.jpg"],
  },
};

export default function SleepLayout({ children }: { children: React.ReactNode }) {
  return children;
}
