import type { Metadata } from "next";
import { getPersonaBySlug } from "@/lib/persona-pages";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = getPersonaBySlug(params.slug);

  if (page) {
    return {
      title: page.title,
      description: page.metaDescription,
      robots: { index: true, follow: true },
      alternates: { canonical: `https://getacuity.io/for/${params.slug}` },
      openGraph: {
        title: page.title,
        description: page.metaDescription,
        url: `https://getacuity.io/for/${params.slug}`,
        siteName: "Acuity",
        images: [{ url: "/og-image.png?v=3", width: 1200, height: 630 }],
      },
      twitter: { card: "summary_large_image", title: page.title, description: page.metaDescription },
    };
  }

  // Check DB for AdLab-generated landing page
  try {
    const { prisma } = await import("@/lib/prisma");
    const lp = await prisma.adLabLandingPage.findUnique({ where: { slug: params.slug } });
    if (lp) {
      return {
        title: lp.metaTitle,
        description: lp.metaDescription,
        robots: { index: true, follow: true },
        alternates: { canonical: `https://getacuity.io/for/${params.slug}` },
        openGraph: {
          title: lp.metaTitle,
          description: lp.metaDescription,
          url: `https://getacuity.io/for/${params.slug}`,
          siteName: "Acuity",
          images: [{ url: "/og-image.png?v=3", width: 1200, height: 630 }],
        },
        twitter: { card: "summary_large_image", title: lp.metaTitle, description: lp.metaDescription },
      };
    }
  } catch {
    // DB not available at build time
  }

  return {};
}

export default async function Layout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  const page = getPersonaBySlug(params.slug);

  // SSR content for crawlers
  if (page) {
    return (
      <>
        <div aria-hidden="true" className="sr-only">
          <h1>{page.headline}</h1>
          <p>{page.subheadline}</p>
          <h2>{page.solutionHeadline}</h2>
          <p>{page.solutionBody}</p>
          <h2>Features</h2>
          <ul>
            {page.features.map((f) => (
              <li key={f.title}><strong>{f.title}</strong>: {f.description}</li>
            ))}
          </ul>
          <blockquote>{page.testimonial.quote} — {page.testimonial.name}</blockquote>
          <a href="/auth/signup">Start Free Trial</a>
        </div>
        {children}
      </>
    );
  }

  // For dynamic pages, try to render SSR content from DB
  try {
    const { prisma } = await import("@/lib/prisma");
    const lp = await prisma.adLabLandingPage.findUnique({ where: { slug: params.slug } });
    if (lp) {
      return (
        <>
          <div aria-hidden="true" className="sr-only">
            <h1>{lp.heroHeadline}</h1>
            <p>{lp.heroSubheadline}</p>
            <h2>{lp.valuePropHeadline}</h2>
            <ul>
              {lp.valueProps.map((v) => <li key={v}>{v}</li>)}
            </ul>
            {lp.testimonialQuote && <blockquote>{lp.testimonialQuote}</blockquote>}
            <a href="/auth/signup">{lp.ctaText}</a>
          </div>
          {children}
        </>
      );
    }
  } catch {
    // DB not available at build time
  }

  return <>{children}</>;
}
