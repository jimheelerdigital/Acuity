import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acuity for Sleep — The 60-Second Brain Dump App That Fixes Racing Thoughts",
  description:
    "Can't sleep because your brain won't stop? Acuity is the brain dump app that gives you 60 seconds to empty your head before bed. AI captures your thoughts so your mind can finally rest.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://getacuity.io/for/sleep" },
  openGraph: {
    title: "Acuity for Sleep — The 60-Second Brain Dump App That Fixes Racing Thoughts",
    description:
      "Can't sleep because your brain won't stop? The brain dump app that gives you 60 seconds to empty your head before bed so your mind can finally rest.",
    url: "https://getacuity.io/for/sleep",
    siteName: "Acuity",
    images: [{ url: "/og-image.png?v=2", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Acuity for Sleep — The 60-Second Brain Dump App That Fixes Racing Thoughts",
    description:
      "Can't sleep because your brain won't stop? The brain dump app that gives you 60 seconds to empty your head before bed.",
    images: ["/og-image.png?v=2"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
