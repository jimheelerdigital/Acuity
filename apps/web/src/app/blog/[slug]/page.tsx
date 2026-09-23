import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getPostBySlug, getAllSlugs, BLOG_POSTS } from "@/lib/blog-posts";
import { BlogCtaButtons } from "@/components/blog-try-button";

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
  heroImageUrl: string | null;
  faqSchema: unknown;
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
            "TRIMMED",
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
        heroImageUrl: true,
        faqSchema: true,
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
      alternates: { canonical: `https://goripple.io/blog/${staticPost.slug}` },
      openGraph: {
        title: staticPost.title,
        description: staticPost.metaDescription,
        url: `https://goripple.io/blog/${staticPost.slug}`,
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
      canonical: `https://goripple.io/blog/${dynamicPost.slug}`,
    },
    openGraph: {
      title: dynamicPost.title,
      description,
      url: `https://goripple.io/blog/${dynamicPost.slug}`,
      type: "article",
      publishedTime: publishedAt,
      authors: ["Keenan Assaraf"],
      ...(dynamicPost.heroImageUrl
        ? { images: [{ url: dynamicPost.heroImageUrl, width: 1792, height: 1024 }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: dynamicPost.title,
      description,
      ...(dynamicPost.heroImageUrl ? { images: [dynamicPost.heroImageUrl] } : {}),
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
        image: "https://goripple.io/og-image.png?v=3",
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
        author: {
          "@type": "Person",
          name: "Keenan Assaraf",
          url: "https://goripple.io",
        },
        publisher: {
          "@type": "Organization",
          name: "Ripple",
          url: "https://goripple.io",
          logo: {
            "@type": "ImageObject",
            url: "https://goripple.io/icon-512.png",
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `https://goripple.io/blog/${post.slug}`,
        },
        keywords: post.targetKeyword,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://goripple.io" },
          { "@type": "ListItem", position: 2, name: "Blog", item: "https://goripple.io/blog" },
          { "@type": "ListItem", position: 3, name: post.title, item: `https://goripple.io/blog/${post.slug}` },
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
        image: post.heroImageUrl ?? "https://goripple.io/og-image.png?v=3",
        datePublished: publishedAt,
        dateModified: publishedAt,
        author: {
          "@type": "Person",
          name: "Keenan Assaraf",
          url: "https://goripple.io",
        },
        publisher: {
          "@type": "Organization",
          name: "Ripple",
          url: "https://goripple.io",
          logo: {
            "@type": "ImageObject",
            url: "https://goripple.io/icon-512.png",
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `https://goripple.io/blog/${post.slug}`,
        },
        keywords: post.targetKeyword ?? "",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://goripple.io" },
          { "@type": "ListItem", position: 2, name: "Blog", item: "https://goripple.io/blog" },
          { "@type": "ListItem", position: 3, name: post.title, item: `https://goripple.io/blog/${post.slug}` },
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

/**
 * FAQPage structured data from the stored faqSchema field.
 *
 * Historical bug: the generation prompt asked Claude to embed FAQPage
 * JSON-LD inside the body HTML, but sanitizeHtml() strips every <script>
 * tag — so no dynamic post ever shipped FAQ schema. Rendering from the
 * structured faqSchema column is the reliable path.
 */
function FaqJsonLd({ faqSchema }: { faqSchema: unknown }) {
  if (!Array.isArray(faqSchema) || faqSchema.length === 0) return null;

  const questions = faqSchema.filter(
    (q): q is { question: string; answer: string } =>
      typeof q === "object" &&
      q !== null &&
      typeof (q as { question?: unknown }).question === "string" &&
      typeof (q as { answer?: unknown }).answer === "string"
  );
  if (questions.length === 0) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: q.answer },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ─── Breadcrumbs ────────────────────────────────────────────────────────────
// Visible trail matching the BreadcrumbList JSON-LD above.

function Breadcrumbs({ title }: { title: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-8 text-sm text-acuity-text-sec">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/" className="hover:text-acuity-primary transition-colors">
            Home
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li>
          <Link href="/blog" className="hover:text-acuity-primary transition-colors">
            Blog
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li
          aria-current="page"
          className="truncate max-w-[14rem] sm:max-w-md text-acuity-text"
        >
          {title}
        </li>
      </ol>
    </nav>
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
              <Breadcrumbs title={staticPost.title} />
              <div className="flex items-center gap-3 text-sm text-acuity-text-sec mb-6">
                <time dateTime={staticPost.publishedAt}>
                  {new Date(staticPost.publishedAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </time>
                <span className="text-acuity-line-strong">|</span>
                <span>{staticPost.readingTime}</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl leading-[1.1] mb-6">
                {staticPost.title}
              </h1>
              <p className="text-lg text-acuity-text leading-relaxed">
                {staticPost.excerpt}
              </p>
            </div>
            <div className="h-px bg-acuity-line mb-12" />
            <div className="prose-custom">
              {staticPost.content.map((block, i) => {
                switch (block.tag) {
                  case "h2":
                    return (
                      <h2
                        key={i}
                        className="text-2xl font-bold tracking-tight mt-12 mb-4 text-acuity-text"
                        dangerouslySetInnerHTML={{ __html: block.text }}
                      />
                    );
                  case "h3":
                    return (
                      <h3
                        key={i}
                        className="text-xl font-semibold mt-8 mb-3 text-acuity-text"
                        dangerouslySetInnerHTML={{ __html: block.text }}
                      />
                    );
                  case "p":
                    return (
                      <p
                        key={i}
                        className="text-base text-acuity-text leading-[1.8] mb-5"
                        dangerouslySetInnerHTML={{ __html: block.text }}
                      />
                    );
                }
              })}
            </div>
            <BlogCta />
            <RelatedPosts
              currentSlug={staticPost.slug}
              currentText={`${staticPost.title} ${staticPost.targetKeyword ?? ""}`}
            />
          </div>
        </article>
      </>
    );
  }

  // Try dynamic post
  const dynamicPost = await getDynamicPost(params.slug);
  if (!dynamicPost) notFound();

  // Trimmed posts return 410 Gone via /api/blog-gone/[slug] route handler.
  // If the request reaches here (middleware bypass), fall through to notFound().
  if (dynamicPost.status === "TRIMMED") {
    notFound();
  }

  // Legacy pruned posts redirect to the best-performing live post
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
      <FaqJsonLd faqSchema={dynamicPost.faqSchema} />
      <article className="pt-32 pb-24 px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-12">
            <Breadcrumbs title={dynamicPost.title} />
            <div className="flex items-center gap-3 text-sm text-acuity-text-sec mb-6">
              <time dateTime={publishedAt}>
                {new Date(publishedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
              <span className="text-acuity-line-strong">|</span>
              <span>{readingTime}</span>
              <span className="text-acuity-line-strong">|</span>
              <span>By Keenan Assaraf</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl leading-[1.1] mb-6">
              {dynamicPost.title}
            </h1>
            <p className="text-lg text-acuity-text leading-relaxed">
              {dynamicPost.hook}
            </p>
          </div>
          {dynamicPost.heroImageUrl && (
            <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden mb-12">
              <Image
                src={dynamicPost.heroImageUrl}
                alt={dynamicPost.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 768px"
                priority
              />
            </div>
          )}
          {!dynamicPost.heroImageUrl && (
            <div className="h-px bg-acuity-line mb-12" />
          )}
          <div
            className="acuity-blog-prose prose prose-base max-w-none prose-headings:text-acuity-text prose-headings:font-bold prose-h2:text-2xl prose-h2:tracking-tight prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-p:text-acuity-text prose-p:text-base prose-p:leading-[1.8] prose-p:mb-5 prose-a:text-acuity-primary prose-strong:text-acuity-text prose-li:text-acuity-text prose-li:text-base prose-blockquote:border-acuity-primary/40 prose-blockquote:text-acuity-text-sec prose-th:text-acuity-text prose-td:text-acuity-text prose-table:text-acuity-text"
            dangerouslySetInnerHTML={{ __html: htmlBody }}
          />
          <BlogCta />
          <RelatedPosts
            currentSlug={params.slug}
            currentText={`${dynamicPost.title} ${dynamicPost.targetKeyword ?? ""}`}
          />
        </div>
      </article>
    </>
  );
}

// ─── Shared CTA ─────────────────────────────────────────────────────────────

function BlogCta() {
  return (
    <>
      <div className="mt-16 rounded-xl border border-acuity-primary/30 bg-acuity-card-bg p-8 sm:p-10 text-center">
        <h2 className="text-2xl font-bold mb-3">
          Say it once. Ripple remembers.
        </h2>
        <p className="text-acuity-text-sec mb-6 max-w-md mx-auto">
          Talk through your day and Ripple pulls out the tasks, tracks
          your goals, and shows you your patterns each week. Free for 7
          days.
        </p>
        <BlogCtaButtons />
        <p className="mt-3 text-xs text-acuity-text-sec">
          No credit card required &middot; Cancel anytime
        </p>
      </div>
      <div className="mt-12 text-center">
        <Link
          href="/blog"
          className="text-sm text-acuity-text-sec hover:text-acuity-primary transition-colors"
        >
          &larr; More articles
        </Link>
      </div>
    </>
  );
}

const RELATED_STOPWORDS = new Set([
  "how", "why", "what", "when", "the", "a", "an", "to", "for", "of", "and",
  "with", "your", "you", "can", "use", "using", "in", "on", "vs", "is",
]);

function keywordTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length > 2 && !RELATED_STOPWORDS.has(w))
  );
}

/**
 * Related posts drawn from the FULL post pool (dynamic + static),
 * ranked by keyword overlap with the current post.
 *
 * The old version only ever linked the first 3 hardcoded static posts,
 * so 140+ auto-published posts received zero internal links from other
 * articles — starving them of the link equity Google uses to decide
 * what deserves indexing.
 */
async function RelatedPosts({
  currentSlug,
  currentText,
}: {
  currentSlug: string;
  currentText: string;
}) {
  let candidates: Array<{ slug: string; title: string; keyword: string }> = [];

  try {
    const { prisma } = await import("@/lib/prisma");
    const pieces = await prisma.contentPiece.findMany({
      where: {
        type: "BLOG",
        status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] },
        slug: { not: null },
      },
      orderBy: { distributedAt: "desc" },
      select: { slug: true, title: true, targetKeyword: true },
    });
    candidates = pieces.map((p) => ({
      slug: p.slug!,
      title: p.title,
      keyword: p.targetKeyword ?? "",
    }));
  } catch {
    // DB unavailable — fall through to static posts
  }

  for (const post of BLOG_POSTS) {
    candidates.push({
      slug: post.slug,
      title: post.title,
      keyword: post.targetKeyword ?? "",
    });
  }

  const seen = new Set<string>([currentSlug]);
  const currentTokens = keywordTokens(currentText);

  const related = candidates
    .filter((c) => {
      if (seen.has(c.slug)) return false;
      seen.add(c.slug);
      return true;
    })
    .map((c, i) => {
      const tokens = keywordTokens(`${c.title} ${c.keyword}`);
      let overlap = 0;
      for (const t of tokens) if (currentTokens.has(t)) overlap++;
      // Small recency bias so ties favor newer posts (list is newest-first)
      return { ...c, score: overlap - i * 0.001 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (related.length === 0) return null;

  return (
    <div className="mt-16">
      <h2 className="text-xl font-bold mb-6 text-acuity-text">Related articles</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {related.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group rounded-lg border border-acuity-line bg-acuity-card-bg p-5 transition hover:border-acuity-primary/40"
          >
            <h3 className="text-sm font-semibold text-acuity-text group-hover:text-acuity-primary transition-colors leading-snug">
              {post.title}
            </h3>
          </Link>
        ))}
      </div>
    </div>
  );
}
