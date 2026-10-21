import type { Metadata } from "next";
import { OG_IMAGE } from "@/lib/seo";

const title = "AI Weekly Report From Your Voice Journal, Every Sunday";
const description =
  "Every Sunday, Ripple writes your week back to you: your wins, your patterns, the habits you kept, and what you said you'd do versus what actually happened.";

export const metadata: Metadata = {
  title,
  description,
  robots: { index: true, follow: true },
  alternates: { canonical: "https://goripple.io/for/weekly-report" },
  openGraph: {
    title,
    description,
    url: "https://goripple.io/for/weekly-report",
    siteName: "Ripple",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description:
      "Your wins, your patterns, and what you said you'd do versus what happened. An AI-written weekly report from your voice journal, every Sunday.",
    images: [OG_IMAGE.url],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
