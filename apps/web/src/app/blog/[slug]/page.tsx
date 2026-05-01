import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getPostBySlug, getAllSlugs, BLOG_POSTS } from "@/lib/blog-posts";

export const revalidate = 300; // 5 minutes

interface Props {
  params: { slug: string };
}

// ─── Data fetching ──────────────────────────────────────────────────────────

interface DynamicPost {
  slug: string;
  title: string;
  body: string;
  hook: string;
  cta: string;
  targetKeyword: string | null;
  distributedAt: Date | null;
  finalBody: string | null;
  status: string;
  redirectTo: string | null;
}

async function getDynamicPost(slug: string): Promise<DynamicPost | null> {
  try {
    const { prisma } = await import("@/lib/prisma");
    return await prisma.contentPiece.findFirst({
      where: {
        slug,
        type: "BLOG",
        status: {
          in: [
            "DISTRIBUTED",
            "AUTO_PUBLISHED",
            "PRUNED_DAY7",
            "PRUNED_DAY30",
            "PRUNED_DAY90",
          ],
        },
      },
      select: {
        slug: true,
        title: true,
        body: true,
        hook: true,
        cta: true,
        targetKeyword: true,
        distributedAt: true,
        finalBody: true,
        status: true,
        redirectTo: true,
      },
    }) as DynamicPost | null;
  } catch {
    return null;
  }
}

// ─── Static params (for hardcoded posts) ────────────────────────────────────

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

// ─── Metadata ───────────────────────────────────────────────────────────────

function extractMetaDescription(html: string): string {
  const match = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
  );
  if (match) return match[1];
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 155) + (text.length > 155 ? "…" : "");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Try static first
  const staticPost = getPostBySlug(params.slug);
  if (staticPost) {
    return {
      title: staticPost.title,
      description: staticPost.metaDescription,
      alternates: { canonical: `https://getacuity.io/blog/${staticPost.slug}` },
      openGraph: {
        title: staticPost.title,
        description: staticPost.metaDescription,
        url: `https://getacuity.io/blog/${staticPost.slug}`,
        type: "article",
        publishedTime: staticPost.publishedAt,
        modifiedTime: staticPost.updatedAt,
      },
      twitter: {
        card: "summary_large_image",
        title: staticPost.title,
        description: staticPost.metaDescription,
      },
    };
  }

  // Try dynamic
  const dynamicPost = await getDynamicPost(params.slug);
  if (!dynamicPost) return {};

  const description = extractMetaDescription(
    dynamicPost.finalBody ?? dynamicPost.body
  );
  const publishedAt = dynamicPost.distributedAt?.toISOString() ?? new Date().toISOString();

  return {
    title: dynamicPost.title,
    description,
    alternates: {
      canonical: `https://getacuity.io/blog/${dynamicPost.slug}`,
    },
    openGraph: {
      title: dynamicPost.title,
      description,
      url: `https://getacuity.io/blog/${dynamicPost.slug}`,
      type: "article",
      publishedTime: publishedAt,
      authors: ["Keenan Assaraf"],
    },
    twitter: {
      card: "summary_large_image",
      title: dynamicPost.title,
      description,
    },
  };
}

// ─── JSON-LD ────────────────────────────────────────────────────────────────

function BlogJsonLdStatic({
  post,
}: {
  post: NonNullable<ReturnType<typeof getPostBySlug>>;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description: post.metaDescription,
        image: "https://getacuity.io/og-image.png",
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
        author: {
          "@type": "Person",
          name: "Keenan Assaraf",
          url: "https://getacuity.io",
        },
        publisher: {
          "@type": "Organization",
          name: "Acuity",
          url: "https://getacuity.io",
          logo: {
            "@type": "ImageObject",
            url: "https://getacuity.io/AcuityLogo.png",
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `https://getacuity.io/blog/${post.slug}`,
        },
        keywords: post.targetKeyword,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://getacuity.io" },
          { "@type": "ListItem", position: 2, name: "Blog", item: "https://getacuity.io/blog" },
          { "@type": "ListItem", position: 3, name: post.title, item: `https://getacuity.io/blog/${post.slug}` },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

function BlogJsonLdDynamic({ post }: { post: DynamicPost }) {
  const description = extractMetaDescription(
    post.finalBody ?? post.body
  );
  const publishedAt =
    post.distributedAt?.toISOString() ?? new Date().toISOString();

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description,
        image: "https://getacuity.io/og-image.png",
        datePublished: publishedAt,
        dateModified: publishedAt,
        author: {
          "@type": "Person",
          name: "Keenan Assaraf",
          url: "https://getacuity.io",
        },
        publisher: {
          "@type": "Organization",
          name: "Acuity",
          url: "https://getacuity.io",
          logo: {
            "@type": "ImageObject",
            url: "https://getacuity.io/AcuityLogo.png",
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `https://getacuity.io/blog/${post.slug}`,
        },
        keywords: post.targetKeyword ?? "",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://getacuity.io" },
          { "@type": "ListItem", position: 2, name: "Blog", item: "https://getacuity.io/blog" },
          { "@type": "ListItem", position: 3, name: post.title, item: `https://getacuity.io/blog/${post.slug}` },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ─── Sanitizer ──────────────────────────────────────────────────────────────

function sanitizeHtml(html: string): string {
  // Strip script tags (JSON-LD and any others) — they go in <head> via dedicated components.
  // The body HTML is generated by our own content factory pipeline, not user-submitted.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "");
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function BlogPostPage({ params }: Props) {
  // Try static post first
  const staticPost = getPostBySlug(params.slug);
  if (staticPost) {
    return (
      <>
        <BlogJsonLdStatic post={staticPost} />
        <article className="pt-32 pb-24 px-6">
          <div className="mx-auto max-w-3xl">
            <div className="mb-12">
              <Link
                href="/blog"
                className="inline-flex items-center gap-1.5 text-sm text-[#A0A0B8] hover:text-[#7C5CFC] transition-colors mb-8"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Back to blog
              </Link>
              <div className="flex items-center gap-3 text-sm text-[#A0A0B8] mb-6">
                <time dateTime={staticPost.publishedAt}>
                  {new Date(staticPost.publishedAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </time>
                <span className="text-white/20">|</span>
                <span>{staticPost.readingTime}</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl leading-[1.1] mb-6">
                {staticPost.title}
              </h1>
              <p className="text-lg text-[#A0A0B8] leading-relaxed">
                {staticPost.excerpt}
              </p>
            </div>
            <div className="h-px bg-white/10 mb-12" />
            <div className="prose-custom">
              {staticPost.content.map((block, i) => {
                switch (block.tag) {
                  case "h2":
                    return (
                      <h2
                        key={i}
                        className="text-2xl font-bold tracking-tight mt-12 mb-4 text-white"
                        dangerouslySetInnerHTML={{ __html: block.text }}
                      />
                    );
                  case "h3":
                    return (
                      <h3
                        key={i}
                        className="text-xl font-semibold mt-8 mb-3 text-white"
                        dangerouslySetInnerHTML={{ __html: block.text }}
                      />
                    );
                  case "p":
                    return (
                      <p
                        key={i}
                        className="text-base text-[#A0A0B8] leading-[1.8] mb-5"
                        dangerouslySetInnerHTML={{ __html: block.text }}
                      />
                    );
                }
              })}
            </div>
            <BlogCta />
            <RelatedPosts currentSlug={staticPost.slug} />
          </div>
        </article>
      </>
    );
  }

  // Try dynamic post
  const dynamicPost = await getDynamicPost(params.slug);
  if (!dynamicPost) notFound();

  // Pruned posts redirect to the best-performing live post
  if (dynamicPost.redirectTo && dynamicPost.status.startsWith("PRUNED_")) {
    permanentRedirect(`/blog/${dynamicPost.redirectTo}`);
  }

  const htmlBody = sanitizeHtml(dynamicPost.finalBody ?? dynamicPost.body);
  const publishedAt =
    dynamicPost.distributedAt?.toISOString() ?? new Date().toISOString();
  const wordCount = htmlBody.replace(/<[^>]+>/g, " ").split(/\s+/).length;
  const readingTime = `${Math.max(1, Math.round(wordCount / 250))} min read`;

  return (
    <>
      <BlogJsonLdDynamic post={dynamicPost} />
      <article className="pt-32 pb-24 px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-12">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm text-[#A0A0B8] hover:text-[#7C5CFC] transition-colors mb-8"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to blog
            </Link>
            <div className="flex items-center gap-3 text-sm text-[#A0A0B8] mb-6">
              <time dateTime={publishedAt}>
                {new Date(publishedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
              <span className="text-white/20">|</span>
              <span>{readingTime}</span>
              <span className="text-white/20">|</span>
              <span>By Keenan Assaraf</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl leading-[1.1] mb-6">
              {dynamicPost.title}
            </h1>
            <p className="text-lg text-[#A0A0B8] leading-relaxed">
              {dynamicPost.hook}
            </p>
          </div>
          <div className="h-px bg-white/10 mb-12" />
          <div
            className="prose prose-invert prose-lg max-w-none prose-headings:text-white prose-headings:font-bold prose-p:text-[#A0A0B8] prose-p:leading-[1.8] prose-a:text-[#7C5CFC] prose-strong:text-white prose-li:text-[#A0A0B8] prose-blockquote:border-[#7C5CFC]/40 prose-blockquote:text-[#A0A0B8]"
            dangerouslySetInnerHTML={{ __html: htmlBody }}
          />
          <BlogCta />
          <RelatedPosts currentSlug={params.slug} />
        </div>
      </article>
    </>
  );
}

// ─── Shared CTA ─────────────────────────────────────────────────────────────

function BlogCta() {
  return (
    <>
      <div className="mt-16 rounded-xl border border-[#7C5CFC]/30 bg-[#13131F] p-8 sm:p-10 text-center">
        <h2 className="text-2xl font-bold mb-3">
          Brain dump daily. Get your life back.
        </h2>
        <p className="text-[#A0A0B8] mb-6 max-w-md mx-auto">
          Try Acuity free for 14 days. 60 seconds a night. No typing. Just
          talk.
        </p>
        <Link
          href="/?utm_campaign=blog"
          className="inline-flex items-center gap-2 rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-95"
        >
          Try Acuity free for 14 days
        </Link>
        <p className="mt-3 text-xs text-[#A0A0B8]">
          No credit card required &middot; Cancel anytime
        </p>
      </div>
      <div className="mt-12 text-center">
        <Link
          href="/blog"
          className="text-sm text-[#A0A0B8] hover:text-[#7C5CFC] transition-colors"
        >
          &larr; More articles
        </Link>
      </div>
    </>
  );
}

function RelatedPosts({ currentSlug }: { currentSlug: string }) {
  const related = BLOG_POSTS.filter((p) => p.slug !== currentSlug).slice(0, 3);
  if (related.length === 0) return null;

  return (
    <div className="mt-16">
      <h2 className="text-xl font-bold mb-6 text-white">Related articles</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {related.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group rounded-lg border border-white/10 bg-[#13131F] p-5 transition hover:border-[#7C5CFC]/40"
          >
            <p className="text-xs text-[#A0A0B8] mb-2">{post.readingTime}</p>
            <h3 className="text-sm font-semibold text-white group-hover:text-[#7C5CFC] transition-colors leading-snug">
              {post.title}
            </h3>
          </Link>
        ))}
      </div>
    </div>
  );
}
