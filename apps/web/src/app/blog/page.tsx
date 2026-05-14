import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { BLOG_POSTS } from "@/lib/blog-posts";

export const revalidate = 300; // 5 minutes

export const metadata: Metadata = {
  title: "Blog — Acuity",
  description:
    "Articles on AI journaling, voice journaling, personal productivity, mood tracking, goal tracking, and building a daily journal habit.",
  alternates: { canonical: "https://getacuity.io/blog" },
  openGraph: {
    title: "Blog — Acuity",
    description:
      "Articles on AI journaling, voice journaling, personal productivity, mood tracking, and building a daily journal habit.",
    url: "https://getacuity.io/blog",
    siteName: "Acuity",
    images: [{ url: "/og-image.png?v=2", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog — Acuity",
    description:
      "Articles on AI journaling, voice journaling, personal productivity, and mood tracking.",
    images: ["/og-image.png?v=2"],
  },
};

interface BlogCard {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  readingTime: string;
  heroImageUrl?: string | null;
}

async function getDynamicPosts(): Promise<BlogCard[]> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const pieces = await prisma.contentPiece.findMany({
      where: {
        type: "BLOG",
        status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] },
        slug: { not: null },
      },
      orderBy: { distributedAt: "desc" },
      select: {
        slug: true,
        title: true,
        hook: true,
        body: true,
        distributedAt: true,
        heroImageUrl: true,
      },
    });

    return pieces.map((p) => {
      const wordCount = p.body.replace(/<[^>]+>/g, " ").split(/\s+/).length;
      const readingTime = `${Math.max(1, Math.round(wordCount / 250))} min read`;
      return {
        slug: p.slug!,
        title: p.title,
        excerpt: p.hook,
        publishedAt: (p.distributedAt ?? new Date()).toISOString(),
        readingTime,
        heroImageUrl: p.heroImageUrl,
      };
    });
  } catch {
    return [];
  }
}

export default async function BlogIndex() {
  const dynamicPosts = await getDynamicPosts();

  // Merge: static posts + dynamic posts, deduplicate by slug, sort newest first
  const staticCards: BlogCard[] = BLOG_POSTS.map((post) => ({
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    publishedAt: post.publishedAt,
    readingTime: post.readingTime,
  }));

  const slugsSeen = new Set<string>();
  const allPosts: BlogCard[] = [];

  // Dynamic posts take priority (they may have the same slug as a static post)
  for (const post of dynamicPosts) {
    if (!slugsSeen.has(post.slug)) {
      slugsSeen.add(post.slug);
      allPosts.push(post);
    }
  }
  for (const post of staticCards) {
    if (!slugsSeen.has(post.slug)) {
      slugsSeen.add(post.slug);
      allPosts.push(post);
    }
  }

  allPosts.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return (
    <main className="pt-32 pb-24 px-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl mb-4">
          Blog
        </h1>
        <p className="text-lg text-[#A0A0B8] mb-16 max-w-2xl">
          Ideas on voice journaling, productivity, mental health, and the
          science of getting your thoughts out of your head.
        </p>

        <div className="grid gap-8 sm:grid-cols-2">
          {allPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group rounded-xl border border-white/10 bg-[#13131F] overflow-hidden transition-all duration-300 hover:border-[#7C5CFC]/40 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#7C5CFC]/5"
            >
              {post.heroImageUrl && (
                <div className="relative w-full aspect-[16/9]">
                  <Image
                    src={post.heroImageUrl}
                    alt={post.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, 50vw"
                  />
                </div>
              )}
              <div className="p-6">
                <div className="flex items-center gap-3 text-xs text-[#A0A0B8] mb-4">
                  <time dateTime={post.publishedAt}>
                    {new Date(post.publishedAt).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                  <span className="text-white/20">|</span>
                  <span>{post.readingTime}</span>
                </div>
                <h2 className="text-lg font-bold leading-snug mb-3 group-hover:text-[#7C5CFC] transition-colors">
                  {post.title}
                </h2>
                <p className="text-sm text-[#A0A0B8] leading-relaxed line-clamp-3">
                  {post.excerpt}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
