import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getPostBySlug, getAllSlugs } from "@/lib/blog-posts";

interface Props {
  params: { slug: string };
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getPostBySlug(params.slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.metaDescription,
    alternates: { canonical: `https://getacuity.io/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.metaDescription,
      url: `https://getacuity.io/blog/${post.slug}`,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.metaDescription,
    },
  };
}

function BlogJsonLd({ post }: { post: NonNullable<ReturnType<typeof getPostBySlug>> }) {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description: post.metaDescription,
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
        author: {
          "@type": "Organization",
          name: "Acuity",
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
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://getacuity.io",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Blog",
            item: "https://getacuity.io/blog",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: post.title,
            item: `https://getacuity.io/blog/${post.slug}`,
          },
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

export default function BlogPostPage({ params }: Props) {
  const post = getPostBySlug(params.slug);
  if (!post) notFound();

  return (
    <>
      <BlogJsonLd post={post} />
      <article className="pt-32 pb-24 px-6">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
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
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl leading-[1.1] mb-6">
              {post.title}
            </h1>
            <p className="text-lg text-[#A0A0B8] leading-relaxed">
              {post.excerpt}
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/10 mb-12" />

          {/* Content */}
          <div className="prose-custom">
            {post.content.map((block, i) => {
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

          {/* CTA */}
          <div className="mt-16 rounded-xl border border-[#7C5CFC]/30 bg-[#13131F] p-8 sm:p-10 text-center">
            <h2 className="text-2xl font-bold mb-3">
              Ready to try it tonight?
            </h2>
            <p className="text-[#A0A0B8] mb-6 max-w-md mx-auto">
              Join the Acuity waitlist and get your first month completely free.
              60 seconds. No typing. Just talk.
            </p>
            <Link
              href="/waitlist?utm_campaign=blog"
              className="inline-flex items-center gap-2 rounded-full bg-[#7C5CFC] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-95"
            >
              Join the waitlist &mdash; first month free
            </Link>
            <p className="mt-3 text-xs text-[#A0A0B8]">
              No credit card required &middot; Cancel anytime
            </p>
          </div>

          {/* Back to blog */}
          <div className="mt-12 text-center">
            <Link
              href="/blog"
              className="text-sm text-[#A0A0B8] hover:text-[#7C5CFC] transition-colors"
            >
              &larr; More articles
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
