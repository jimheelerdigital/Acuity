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

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
