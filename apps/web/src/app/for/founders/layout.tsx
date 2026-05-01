import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acuity for Founders — The 60-Second Nightly Debrief for High Performers",
  description:
    "Every night you go to bed with 40 unfinished thoughts. Acuity captures every task, tracks every goal, and writes your weekly debrief automatically. Built for founders and executives.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://getacuity.io/for/founders" },
  openGraph: {
    title: "Acuity for Founders — The 60-Second Nightly Debrief for High Performers",
    description:
      "Acuity captures every task, tracks every goal, and writes your weekly debrief automatically. Built for founders and executives.",
    url: "https://getacuity.io/for/founders",
    siteName: "Acuity",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Acuity for Founders — The 60-Second Nightly Debrief for High Performers",
    description:
      "Acuity captures every task, tracks every goal, and writes your weekly debrief automatically. Built for founders.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
