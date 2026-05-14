import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acuity for Founders — The 60-Second Daily Debrief for High Performers",
  description:
    "Every night you go to bed with 40 unfinished thoughts. Acuity is the AI journal that extracts tasks, tracks goals, and writes your weekly report automatically. The daily journal app built for founders and executives.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://getacuity.io/for/founders" },
  openGraph: {
    title: "Acuity for Founders — The 60-Second Daily Debrief for High Performers",
    description:
      "The AI journal that extracts tasks, tracks goals, and writes your weekly report automatically. The daily journal app built for founders and executives.",
    url: "https://getacuity.io/for/founders",
    siteName: "Acuity",
    images: [{ url: "/og-image.png?v=2", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Acuity for Founders — The 60-Second Daily Debrief for High Performers",
    description:
      "The AI journal that extracts tasks, tracks goals, and writes your weekly report automatically. Built for founders.",
    images: ["/og-image.png?v=2"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
