import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acuity Decoded — See the Patterns You Miss From the Inside",
  description:
    "Most people have no idea what drives their moods, decisions, and habits. Acuity remembers what you said last week and last month, and shows you what you keep coming back to.",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://getacuity.io/for/decoded" },
  openGraph: {
    title: "Acuity Decoded — See the Patterns You Miss From the Inside",
    description:
      "Acuity remembers what you said last week and last month, and shows you what you keep coming back to.",
    url: "https://getacuity.io/for/decoded",
    siteName: "Acuity",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary",
    title: "Acuity Decoded — See the Patterns You Miss From the Inside",
    description:
      "Acuity remembers what you said last week and last month, and shows you what you keep coming back to.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
