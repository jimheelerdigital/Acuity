import type { Metadata } from "next";
import { OG_IMAGE } from "@/lib/seo";

const title = "A Brain Dump App for Racing Thoughts";
const description =
  "Brain won't stop? Ripple is a brain dump app: talk whenever your head is full and it turns the swirl into a to-do list, tracked habits and mood, and patterns.";

export const metadata: Metadata = {
  title,
  description,
  robots: { index: true, follow: true },
  alternates: { canonical: "https://goripple.io/for/sleep" },
  openGraph: {
    title,
    description,
    url: "https://goripple.io/for/sleep",
    siteName: "Ripple",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description:
      "Talk it out whenever your head is full. Ripple turns racing thoughts into a list, so they have somewhere to go besides your head.",
    images: [OG_IMAGE.url],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
