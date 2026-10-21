import type { Metadata } from "next";
import { OG_IMAGE } from "@/lib/seo";

const title = "Voice Journal for Therapy: Support Between Sessions";
const description =
  "Talk to Ripple between therapy sessions. It tracks your mood and habits, notices what keeps coming up, and sends a weekly report to bring to your next session.";

export const metadata: Metadata = {
  title,
  description,
  robots: { index: true, follow: true },
  alternates: { canonical: "https://goripple.io/for/therapy" },
  openGraph: {
    title,
    description,
    url: "https://goripple.io/for/therapy",
    siteName: "Ripple",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description:
      "Bring a clear picture of your week to your next session. Ripple tracks mood, habits and patterns between sessions. It supports therapy, never replaces it.",
    images: [OG_IMAGE.url],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
