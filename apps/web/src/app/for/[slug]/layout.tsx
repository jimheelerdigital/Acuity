import type { Metadata } from "next";
import { getPersonaBySlug } from "@/lib/persona-pages";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = getPersonaBySlug(params.slug);
  if (!page) return {};

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
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.metaDescription,
    },
  };
}

export default function Layout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  const page = getPersonaBySlug(params.slug);

  return (
    <>
      {/* SSR content for crawlers — visible text is rendered by the client component */}
      {page && (
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
          <p>{page.ctaHeadline}</p>
          <a href="/auth/signup">Start Free Trial</a>
        </div>
      )}
      {children}
    </>
  );
}
