import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Pattern Detection Journal — Understand Your Mental Patterns",
  description:
    "The subconscious pattern app that reveals what drives your decisions and emotions. AI detects recurring themes, blind spots, and hidden patterns over time.",
  alternates: {
    canonical: "https://getacuity.io/for/decoded",
  },
  openGraph: {
    title: "AI Pattern Detection Journal — Understand Your Mental Patterns",
    description:
      "The subconscious pattern app that reveals what drives your decisions and emotions. AI detects recurring themes, blind spots, and hidden patterns over time.",
    url: "https://getacuity.io/for/decoded",
    images: [{ url: "/og-image.jpg", width: 1200, height: 1200, alt: "Acuity — AI journaling app" }],
  },
  twitter: {
    card: "summary",
    title: "AI Pattern Detection Journal — Decode Your Mind",
    description:
      "Reveal the subconscious patterns driving your decisions. AI detects recurring themes, blind spots, and hidden patterns over time.",
    images: ["/og-image.jpg"],
  },
};

export default function DecodedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
