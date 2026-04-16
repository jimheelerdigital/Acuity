import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acuity for Sleep — The 60-Second Brain Dump That Fixes Racing Thoughts",
  description:
    "Can't sleep because your brain won't stop? Acuity gives you 60 seconds to empty your head before bed. AI captures your thoughts so your mind can finally rest.",
  alternates: { canonical: "https://getacuity.io/for/sleep" },
  openGraph: {
    title: "Acuity for Sleep — The 60-Second Brain Dump That Fixes Racing Thoughts",
    description:
      "Can't sleep because your brain won't stop? Acuity gives you 60 seconds to empty your head before bed so your mind can finally rest.",
    url: "https://getacuity.io/for/sleep",
    siteName: "Acuity",
    images: [{ url: "/og-image.jpg", width: 1200, height: 1200 }],
  },
  twitter: {
    card: "summary",
    title: "Acuity for Sleep — The 60-Second Brain Dump That Fixes Racing Thoughts",
    description:
      "Can't sleep because your brain won't stop? Acuity gives you 60 seconds to empty your head before bed.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
