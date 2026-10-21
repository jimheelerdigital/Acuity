/**
 * Metadata + JSON-LD builders for the SEO landing pages. Plain functions, no
 * React, so page.tsx can `export const metadata = seoMetadata(...)`.
 */
import type { Metadata } from "next";

import { PRODUCT_CATEGORY } from "@/lib/positioning";
import { displayAnnual, displayAnnualAsMonthly, displayMonthly } from "@/lib/pricing";

import type { SeoLandingContent, SeoSlug } from "./types";

export const SITE_URL = "https://goripple.io";
export const OG = { url: "/og-image.png?v=4", width: 1200, height: 630 };

/** Every SEO landing page plus the two hubs, for the Related block. */
export const RELATED_PAGES: { slug: SeoSlug | "voice-journaling" | "blog"; href: string; title: string; blurb: string }[] = [
  { slug: "habit-tracker-app", href: "/habit-tracker-app", title: "Habit tracker app", blurb: "Mention it and it’s checked off. Skip it and Ripple notices." },
  { slug: "ai-journal-app", href: "/ai-journal-app", title: "AI journal app", blurb: "A journal that does the follow-up: to-dos, habits, mood, patterns." },
  { slug: "brain-dump-app", href: "/brain-dump-app", title: "Brain dump app", blurb: "Say it in any order. Ripple sorts it for you." },
  { slug: "mental-load", href: "/mental-load", title: "The mental load", blurb: "What it is, and how to stop holding it all in your head." },
  { slug: "mood-tracker-app", href: "/mood-tracker-app", title: "Mood tracker app", blurb: "Your mood, read from your own words. Nothing to fill in." },
  { slug: "voice-journaling", href: "/voice-journaling", title: "Voice journaling guide", blurb: "How journaling by talking works, and how to start." },
  { slug: "blog", href: "/blog", title: "The Ripple blog", blurb: "Practical reads on habits, the mental load and getting unstuck." },
];

/** title must be ≤60 chars INCLUDING " | Ripple"; description 150–160. */
export function seoMetadata({ slug, title, description }: { slug: SeoSlug; title: string; description: string }): Metadata {
  const full = `${title} | Ripple`;
  return {
    title: { absolute: full },
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      title: full,
      description,
      url: `/${slug}`,
      siteName: "Ripple",
      type: "website",
      images: [OG],
    },
    twitter: {
      card: "summary_large_image",
      title: full,
      description,
      images: [OG.url],
    },
  };
}

export function buildJsonLd(c: SeoLandingContent) {
  const url = `${SITE_URL}/${c.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: c.pageName,
        description: c.description,
        inLanguage: "en",
        isPartOf: { "@type": "WebSite", name: "Ripple", url: SITE_URL },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        about: { "@id": `${url}#app` },
        primaryImageOfPage: { "@type": "ImageObject", url: `${SITE_URL}${OG.url}` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${url}#app`,
        name: "Ripple",
        description: `Ripple is ${PRODUCT_CATEGORY}. You talk or type whenever something is on your mind, and it turns what you said into your to-do list, tracks your habits and mood, shows what keeps coming up, scores your life areas and sends a weekly report.`,
        url: SITE_URL,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Web, iOS, Android",
        sameAs: "https://apps.apple.com/app/id6762633410",
        offers: {
          "@type": "Offer",
          price: displayAnnual().replace("$", ""),
          priceCurrency: "USD",
          name: "Ripple Pro (yearly)",
          description: "7-day free trial. Unlimited debriefs, to-dos, habits, mood, patterns, Life Matrix and a weekly report.",
          url: `${SITE_URL}/start`,
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: c.crumb, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: c.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

/** Price answer for each page's FAQ, built from the live display tier. */
export function priceFaqAnswer(): string {
  return `${displayAnnual()} a year (that’s ${displayAnnualAsMonthly()} a month) or ${displayMonthly()} a month, with a 7-day free trial. Nothing is charged today, we email you a reminder on day 4, and you can cancel any time before day 7 and pay nothing.`;
}
