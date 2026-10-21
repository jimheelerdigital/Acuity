import type { Metadata } from "next";
import { OG_IMAGE } from "@/lib/seo";

const title = "Ripple Decoded: The AI Journal That Shows Your Patterns";
const description =
  "Ripple is an AI journal and habit tracker that shows the patterns behind your moods and decisions: talk whenever and see what keeps coming up each week.";

export const metadata: Metadata = {
  title,
  description,
  robots: { index: true, follow: true },
  alternates: { canonical: "https://goripple.io/for/decoded" },
  openGraph: {
    title,
    description,
    url: "https://goripple.io/for/decoded",
    siteName: "Ripple",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description:
      "The AI voice journal that surfaces the patterns you can't see: mood tracking, habit tracking, and a weekly report every Sunday.",
    images: [OG_IMAGE.url],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
