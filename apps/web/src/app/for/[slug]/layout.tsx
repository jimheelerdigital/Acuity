import type { Metadata } from "next";
import { getPersonaBySlug } from "@/lib/persona-pages";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = getPersonaBySlug(params.slug);
  if (!page) return {};

  return {
    title: page.title,
    description: page.metaDescription,
    alternates: { canonical: `https://getacuity.io/for/${params.slug}` },
    openGraph: {
      title: page.title,
      description: page.metaDescription,
      url: `https://getacuity.io/for/${params.slug}`,
      siteName: "Acuity",
      images: [{ url: "/og-image.jpg", width: 1200, height: 1200 }],
    },
    twitter: {
      card: "summary",
      title: page.title,
      description: page.metaDescription,
    },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
