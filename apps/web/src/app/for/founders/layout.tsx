import type { Metadata } from "next";
import { OG_IMAGE } from "@/lib/seo";

const title = "Ripple for Founders: Talk It Out, Get a Plan";
const description =
  "Founders carry 40 open loops. Talk to Ripple whenever and it pulls out your tasks with dates, tracks your goals and habits, and writes your weekly report.";

export const metadata: Metadata = {
  title,
  description,
  robots: { index: true, follow: true },
  alternates: { canonical: "https://goripple.io/for/founders" },
  openGraph: {
    title,
    description,
    url: "https://goripple.io/for/founders",
    siteName: "Ripple",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description:
      "Talk through your day whenever you have a moment. Ripple turns it into tasks, tracked goals and habits, and a weekly report every Sunday.",
    images: [OG_IMAGE.url],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
