import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getPostBySlug, getAllSlugs, BLOG_POSTS } from "@/lib/blog-posts";
import { OG_IMAGE } from "@/lib/seo";
import { cleanHook, splitAtMiddleH2, withHeadingIds, type TocItem } from "@/lib/blog-visuals";

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
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
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

function dynamicDates(post: DynamicPost): { published: string; modified: string } {
  const published = (post.publishedAt ?? post.distributedAt ?? post.createdAt).toISOString();
  const modified = post.updatedAt.toISOString();
  return { published, modified: modified > published ? modified : published };
}

const OG_IMAGE_ABSOLUTE = `https://goripple.io${OG_IMAGE.url}`;

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
        images: [OG_IMAGE],
      },
      twitter: {
        card: "summary_large_image",
        title: staticPost.title,
        description: staticPost.metaDescription,
        images: [OG_IMAGE.url],
      },
    };
  }

  // Try dynamic
  const dynamicPost = await getDynamicPost(params.slug);
  if (!dynamicPost) return {};

  const description = cleanHook(
    extractMetaDescription(dynamicPost.finalBody ?? dynamicPost.body),
    dynamicPost.finalBody ?? dynamicPost.body
  );
  const { published, modified } = dynamicDates(dynamicPost);

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
      publishedTime: published,
      modifiedTime: modified,
      authors: ["Keenan Assaraf"],
      images: dynamicPost.heroImageUrl
        ? [{ url: dynamicPost.heroImageUrl, width: 1792, height: 1024, alt: dynamicPost.title }]
        : [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: dynamicPost.title,
      description,
      images: [dynamicPost.heroImageUrl ?? OG_IMAGE.url],
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
        image: OG_IMAGE_ABSOLUTE,
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
  const { published, modified } = dynamicDates(post);

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description,
        image: post.heroImageUrl ?? OG_IMAGE_ABSOLUTE,
        datePublished: published,
        dateModified: modified,
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
    <nav aria-label="Breadcrumb" className="mb-6 text-[14px] font-semibold text-[#57514B]">
      <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
        <li>
          <Link href="/" className="inline-flex min-h-11 items-center hover:text-[#1B1815]">
            Home
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link href="/blog" className="inline-flex min-h-11 items-center hover:text-[#1B1815]">
            Blog
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="max-w-[14rem] truncate text-[#1B1815] sm:max-w-md">
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

/** Static posts store blocks; render them to the same HTML shape as DB posts. */
function staticPostHtml(post: NonNullable<ReturnType<typeof getPostBySlug>>): string {
  return post.content
    .map((block) => (block.tag === "html" ? block.text : `<${block.tag}>${block.text}</${block.tag}>`))
    .join("\n");
}

export default async function BlogPostPage({ params }: Props) {
  // Try static post first
  const staticPost = getPostBySlug(params.slug);
  if (staticPost) {
    return (
      <>
        <BlogJsonLdStatic post={staticPost} />
        <PostView
          slug={staticPost.slug}
          title={staticPost.title}
          eyebrow={staticPost.targetKeyword}
          hook={staticPost.excerpt}
          publishedAt={staticPost.publishedAt}
          readingTime={staticPost.readingTime}
          heroImageUrl={staticPost.heroImage ?? null}
          heroAlt={staticPost.heroAlt ?? staticPost.title}
          html={staticPostHtml(staticPost)}
          relatedText={`${staticPost.title} ${staticPost.targetKeyword ?? ""}`}
        />
      </>
    );
  }

  // Try dynamic post
  const dynamicPost = await getDynamicPost(params.slug);
  if (!dynamicPost) notFound();

  // Trimmed posts: nothing routes to a 410 handler, so they 404.
  if (dynamicPost.status === "TRIMMED") {
    notFound();
  }

  // Legacy pruned posts redirect to the best-performing live post
  if (dynamicPost.redirectTo && dynamicPost.status.startsWith("PRUNED_")) {
    permanentRedirect(`/blog/${dynamicPost.redirectTo}`);
  }

  const htmlBody = sanitizeHtml(dynamicPost.finalBody ?? dynamicPost.body).replace(
    /^\s*<meta[^>]*>\s*/i,
    ""
  );
  const wordCount = htmlBody.replace(/<[^>]+>/g, " ").split(/\s+/).length;

  return (
    <>
      <BlogJsonLdDynamic post={dynamicPost} />
      <FaqJsonLd faqSchema={dynamicPost.faqSchema} />
      <PostView
        slug={dynamicPost.slug}
        title={dynamicPost.title}
        eyebrow={dynamicPost.targetKeyword}
        hook={cleanHook(dynamicPost.hook, htmlBody)}
        publishedAt={dynamicDates(dynamicPost).published}
        readingTime={`${Math.max(1, Math.round(wordCount / 250))} min read`}
        heroImageUrl={dynamicPost.heroImageUrl}
        heroAlt={dynamicPost.title}
        html={htmlBody}
        relatedText={`${dynamicPost.title} ${dynamicPost.targetKeyword ?? ""}`}
      />
    </>
  );
}

// ─── Post layout (2026-10 redesign) ─────────────────────────────────────────

function PostView(props: {
  slug: string;
  title: string;
  eyebrow: string | null;
  hook: string;
  publishedAt: string;
  readingTime: string;
  heroImageUrl: string | null;
  heroAlt: string;
  html: string;
  relatedText: string;
}) {
  const { html, toc } = withHeadingIds(props.html);
  const [first, second] = splitAtMiddleH2(html);
  const date = new Date(props.publishedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <article className="pb-24">
      <div aria-hidden="true" className="rb-progress" />
      <header className="relative overflow-hidden px-5 pb-10 pt-8 min-[900px]:pb-14 min-[900px]:pt-12">
        <div aria-hidden="true" className="absolute right-[-160px] top-[-160px] h-[420px] w-[420px] rounded-full bg-[#FDE6DC] min-[900px]:right-[-120px] min-[900px]:h-[620px] min-[900px]:w-[620px]" />
        <div className="relative mx-auto max-w-[760px]">
          <Breadcrumbs title={props.title} />
          {props.eyebrow && (
            <p className="mb-4 text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#B9472A]">{props.eyebrow}</p>
          )}
          <h1 className="m-0 text-[36px] font-extrabold leading-[1.08] tracking-[-0.035em] text-[#1B1815] min-[900px]:text-[52px]">
            {props.title}
          </h1>
          {props.hook && (
            <p className="mt-5 text-[18px] leading-[1.6] text-[#4A443E] min-[900px]:text-[20px]">{props.hook}</p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] font-semibold text-[#57514B]">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F27A55] text-[14px] font-extrabold text-[#1B1815]">
              K
            </span>
            <span className="text-[#1B1815]">By Keenan Assaraf</span>
            <span aria-hidden="true">·</span>
            <time dateTime={props.publishedAt}>{date}</time>
            <span aria-hidden="true">·</span>
            <span>{props.readingTime}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1000px] px-5">
        {props.heroImageUrl ? (
          <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[28px] bg-[#F3EEE8] shadow-[0_30px_70px_rgba(60,40,20,0.14)]">
            <Image src={props.heroImageUrl} alt={props.heroAlt} fill className="object-cover" sizes="(max-width: 1000px) 100vw, 1000px" priority />
          </div>
        ) : (
          <HeroArt />
        )}
      </div>

      <div className="mx-auto mt-12 max-w-[720px] px-5">
        {toc.length >= 3 && <Toc items={toc} />}
        <div className="rb-article" dangerouslySetInnerHTML={{ __html: first }} />
        {second && <MidCta />}
        {second && <div className="rb-article" dangerouslySetInnerHTML={{ __html: second }} />}
        <BlogCta />
      </div>
      <div className="mx-auto max-w-[1000px] px-5">
        <RelatedPosts currentSlug={props.slug} currentText={props.relatedText} />
      </div>
    </article>
  );
}

/** Shown when a post has no hero image yet: brand rings instead of an empty gap. */
function HeroArt() {
  return (
    <div aria-hidden="true" className="relative aspect-[3/1] w-full overflow-hidden rounded-[28px] bg-[#F27A55]">
      {[120, 200, 280, 360].map((r) => (
        <span
          key={r}
          className="absolute left-1/2 top-1/2 rounded-full border-2 border-white/30"
          style={{ width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r }}
        />
      ))}
    </div>
  );
}

function Toc({ items }: { items: TocItem[] }) {
  return (
    <details open className="group mb-10 rounded-[22px] border border-[#EEE7DE] bg-white px-6 py-5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#57514B]">
        In this article
        <span aria-hidden="true" className="text-[20px] text-[#B9472A] transition-transform group-open:rotate-45">+</span>
      </summary>
      <ol className="m-0 mt-2 grid list-none gap-1 p-0">
        {items.map((t, i) => (
          <li key={t.id}>
            <a href={`#${t.id}`} className="flex min-h-11 items-baseline gap-3 py-1 text-[16px] font-semibold leading-snug text-[#1B1815] no-underline hover:text-[#B9472A]">
              <span className="w-5 shrink-0 text-[13px] font-extrabold text-[#B9472A]">{i + 1}</span>
              {t.text}
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}

function MidCta() {
  return (
    <aside className="my-12 flex flex-col gap-4 rounded-[24px] bg-[#1B1815] p-6 text-white min-[700px]:flex-row min-[700px]:items-center min-[700px]:justify-between min-[700px]:p-7">
      <div>
        <p className="m-0 text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#F7A386]">Try it on your own week</p>
        <p className="m-0 mt-2 text-[18px] font-bold leading-[1.4]">Say what&apos;s on your mind. Ripple turns it into your to-do list, habits and patterns.</p>
      </div>
      <a href="/start" className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-[#F27A55] px-6 text-[16px] font-extrabold text-[#1B1815] no-underline">
        Start free week
      </a>
    </aside>
  );
}

// ─── Shared CTA ─────────────────────────────────────────────────────────────

function BlogCta() {
  return (
    <>
      <div className="relative mt-16 overflow-hidden rounded-[30px] bg-[#F27A55] px-6 py-12 text-center min-[700px]:px-10">
        {[110, 180, 250].map((r) => (
          <span
            key={r}
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border-2 border-white/25"
            style={{ width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r }}
          />
        ))}
        <h2 className="relative m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] text-[#1B1815] min-[700px]:text-[38px]">
          Say it once. Ripple remembers.
        </h2>
        <p className="relative mx-auto mt-3 max-w-md text-[17px] font-semibold leading-[1.5] text-[#2B211C]">
          Talk it out and Ripple pulls out your tasks, tracks your habits and mood, and shows you your patterns each week.
        </p>
        <a href="/start" className="relative mt-6 inline-flex h-14 items-center justify-center rounded-full bg-[#1B1815] px-8 text-[17px] font-extrabold text-white no-underline">
          Start your free week
        </a>
        <p className="relative mt-3 text-[14px] font-semibold text-[#2B211C]">7-day free trial · Cancel anytime</p>
        <p className="relative mt-4 text-[15px]">
          <Link href="/voice-journaling" className="font-bold text-[#1B1815] underline underline-offset-4">
            New to voice journaling? Start with the guide
          </Link>
        </p>
      </div>
      <div className="mt-10 text-center">
        <Link href="/blog" className="inline-flex min-h-11 items-center text-[15px] font-bold text-[#57514B] hover:text-[#1B1815]">
          ← More articles
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
  let candidates: Array<{ slug: string; title: string; keyword: string; image: string | null }> = [];

  try {
    const { prisma } = await import("@/lib/prisma");
    const pieces = await prisma.contentPiece.findMany({
      where: {
        type: "BLOG",
        status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] },
        slug: { not: null },
      },
      orderBy: { distributedAt: "desc" },
      select: { slug: true, title: true, targetKeyword: true, heroImageUrl: true },
    });
    candidates = pieces.map((p) => ({
      slug: p.slug!,
      title: p.title,
      keyword: p.targetKeyword ?? "",
      image: p.heroImageUrl,
    }));
  } catch {
    // DB unavailable — fall through to static posts
  }

  for (const post of BLOG_POSTS) {
    candidates.push({
      slug: post.slug,
      title: post.title,
      keyword: post.targetKeyword ?? "",
      image: post.heroImage ?? null,
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
    <section className="mt-20">
      <h2 className="m-0 mb-6 text-[28px] font-extrabold tracking-[-0.03em] text-[#1B1815]">Keep reading</h2>
      <div className="grid gap-5 min-[700px]:grid-cols-3">
        {related.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group flex flex-col overflow-hidden rounded-[24px] border border-[#EEE7DE] bg-white no-underline transition-transform hover:-translate-y-1"
          >
            <div className="relative aspect-[3/2] w-full bg-[#FDE6DC]">
              {post.image && (
                <Image src={post.image} alt="" fill className="object-cover" sizes="(max-width: 700px) 100vw, 320px" />
              )}
            </div>
            <h3 className="m-0 p-5 text-[17px] font-extrabold leading-snug text-[#1B1815] group-hover:text-[#B9472A]">
              {post.title}
            </h3>
          </Link>
        ))}
      </div>
    </section>
  );
}
