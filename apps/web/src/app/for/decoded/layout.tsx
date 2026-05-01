import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acuity Decoded — Reveal the Subconscious Patterns Running Your Life",
  description:
    "Most people have no idea what's driving their moods, decisions, and habits. Acuity reveals the patterns you can't see from the inside with AI-powered mental pattern detection.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://getacuity.io/for/decoded" },
  openGraph: {
    title: "Acuity Decoded — Reveal the Subconscious Patterns Running Your Life",
    description:
      "Acuity reveals the patterns you can't see from the inside with AI-powered mental pattern detection.",
    url: "https://getacuity.io/for/decoded",
    siteName: "Acuity",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Acuity Decoded — Reveal the Subconscious Patterns Running Your Life",
    description:
      "Acuity reveals the patterns you can't see from the inside with AI-powered mental pattern detection.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
