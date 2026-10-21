import type { Metadata } from "next";
import { getPersonaBySlug } from "@/lib/persona-pages";
import { OG_IMAGE } from "@/lib/seo";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = getPersonaBySlug(params.slug);

  if (page) {
    // Persona titles already name Ripple, so skip the "%s | Ripple" template.
    return {
      title: { absolute: page.title },
      description: page.metaDescription,
      robots: { index: true, follow: true },
      alternates: { canonical: `https://goripple.io/for/${params.slug}` },
      openGraph: {
        title: page.title,
        description: page.metaDescription,
        url: `https://goripple.io/for/${params.slug}`,
        siteName: "Ripple",
        images: [OG_IMAGE],
      },
      twitter: {
        card: "summary_large_image",
        title: page.title,
        description: page.metaDescription,
        images: [OG_IMAGE.url],
      },
    };
  }

  // AdLab ad landers: paid-traffic pages, kept out of the index.
  try {
    const { prisma } = await import("@/lib/prisma");
    const lp = await prisma.adLabLandingPage.findUnique({ where: { slug: params.slug } });
    if (lp) {
      return {
        title: lp.metaTitle,
        description: lp.metaDescription,
        robots: { index: false, follow: true },
        alternates: { canonical: `https://goripple.io/for/${params.slug}` },
        openGraph: {
          title: lp.metaTitle,
          description: lp.metaDescription,
          url: `https://goripple.io/for/${params.slug}`,
          siteName: "Ripple",
          images: [OG_IMAGE],
        },
        twitter: {
          card: "summary_large_image",
          title: lp.metaTitle,
          description: lp.metaDescription,
          images: [OG_IMAGE.url],
        },
      };
    }
  } catch {
    // DB not available at build time
  }

  return {};
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
