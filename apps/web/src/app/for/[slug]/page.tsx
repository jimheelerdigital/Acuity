import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getPersonaBySlug } from "@/lib/persona-pages";
import { prisma } from "@/lib/prisma";

import { StaticPersonaPage } from "./static-persona-client";
import { DynamicLandingPageView } from "./dynamic-landing-client";
import { AttributionSetter } from "./attribution-client";

/** Shape of a DB-driven landing page from AdLab */
export interface DynamicLandingPage {
  slug: string;
  heroHeadline: string;
  heroSubheadline: string;
  painPoints: string[];
  valuePropHeadline: string;
  valueProps: string[];
  testimonialQuote: string | null;
  testimonialName: string | null;
  closingHeadline: string | null;
  ctaText: string;
  metaTitle: string;
  metaDescription: string;
}

/**
 * /for/[slug] — Server component.
 *
 * All data is fetched server-side so the hero headline, CTA, and social
 * proof are in the initial HTML response. No JS required to see them.
 * Interactive elements (animations, carousels) hydrate after first paint.
 */
export default async function PersonaLandingPage({ params }: { params: { slug: string } }) {
  const staticPage = getPersonaBySlug(params.slug);

  if (staticPage) {
    return (
      <>
        <AttributionSetter slug={params.slug} />
        <StaticPersonaPage page={staticPage} slug={params.slug} />
      </>
    );
  }

  // Fetch dynamic landing page data server-side
  let dynamicPage: DynamicLandingPage | null = null;
  try {
    const lp = await prisma.adLabLandingPage.findUnique({
      where: { slug: params.slug },
    });
    if (lp) {
      dynamicPage = {
        slug: lp.slug,
        heroHeadline: lp.heroHeadline,
        heroSubheadline: lp.heroSubheadline,
        painPoints: lp.painPoints as string[],
        valuePropHeadline: lp.valuePropHeadline,
        valueProps: lp.valueProps as string[],
        testimonialQuote: lp.testimonialQuote,
        testimonialName: lp.testimonialName,
        closingHeadline: lp.closingHeadline ?? null,
        ctaText: lp.ctaText,
        metaTitle: lp.metaTitle,
        metaDescription: lp.metaDescription,
      };
    }
  } catch (err) {
    console.error("[for/slug] DB fetch failed:", err);
  }

  if (dynamicPage) {
    const ctaHref = `/start?ref=${params.slug}&utm_source=meta&utm_medium=paid&utm_campaign=${params.slug}`;
    return (
      <>
        <AttributionSetter slug={params.slug} />
        <DynamicLandingPageView page={dynamicPage} slug={params.slug} ctaHref={ctaHref} />
      </>
    );
  }

  // Not found — no static or dynamic page for this slug
  notFound();
}
