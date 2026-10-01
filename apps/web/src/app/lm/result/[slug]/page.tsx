import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmailCapture, PortraitOrder, ShareButtons } from "@/components/mythicals/result-actions";
import { Track } from "@/components/mythicals/track";
import { ARCHETYPES, archetypeImageUrl, archetypeOgUrl, isArchetypeSlug } from "@/lib/mythicals/archetypes";
import { basePathFor, shopLive } from "@/lib/mythicals/site";

type Props = { params: { slug: string }; searchParams: { a?: string } };

export function generateMetadata({ params }: Props): Metadata {
  if (!isArchetypeSlug(params.slug)) return {};
  const a = ARCHETYPES[params.slug];
  const title = `I'm the ${a.name}. Which legendary creature are you?`;
  return {
    title: { absolute: `The ${a.name}: ${a.title} | Legendary Mythicals` },
    description: a.essence,
    alternates: { canonical: `/result/${a.slug}` },
    openGraph: {
      type: "website",
      siteName: "Legendary Mythicals",
      url: `/result/${a.slug}`,
      title,
      description: a.essence,
      images: [{ url: archetypeOgUrl(a.slug), width: 1200, height: 630, alt: a.name }],
    },
    twitter: { card: "summary_large_image", title, description: a.essence, images: [archetypeOgUrl(a.slug)] },
  };
}

export default function ResultPage({ params, searchParams }: Props) {
  if (!isArchetypeSlug(params.slug)) notFound();
  const a = ARCHETYPES[params.slug];
  const base = basePathFor(headers().get("host"));
  // ?a=31024… = this visitor's own answers (fresh from the quiz). Shared
  // links arrive without it and get a "take the quiz" nudge first.
  const answers = (searchParams.a ?? "").slice(0, 8).split("").map(Number).filter((n) => n >= 0 && n < 4);
  const own = answers.length === 8;
  const live = shopLive();

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <Track type="result_view" data={{ slug: a.slug, own }} />
      {!own && (
        <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center">
          <p className="text-sm text-[var(--lm-dim)]">Someone shared their creature with you. Which one are you?</p>
          <Link href={`${base}/quiz`} className="lm-btn-gold py-2.5 text-sm">Take the quiz</Link>
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-12">
        <div className="relative mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_80px_-20px_rgba(196,80,42,0.45)] md:max-w-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={archetypeImageUrl(a.slug)} alt={a.name} className="h-full w-full object-cover" fetchPriority="high" />
        </div>

        <div className="md:pt-4">
          <p className="lm-rise text-xs uppercase tracking-[0.35em] text-[var(--lm-gold)]">{own ? "You are the" : "The"}</p>
          <h1 className="lm-rise font-lm-display mt-2 text-4xl font-bold leading-tight text-[var(--lm-bone)] sm:text-5xl">{a.name}</h1>
          <p className="lm-rise font-lm-display mt-2 text-lg text-[var(--lm-gold)]">{a.title}</p>
          <p className="mt-6 text-lg leading-relaxed text-[var(--lm-bone)]">{a.essence}</p>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--lm-dim)]">Strengths</h2>
              <ul className="mt-3 grid gap-2">
                {a.strengths.map((s) => (
                  <li key={s} className="flex gap-3 text-[var(--lm-bone)]">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rotate-45 bg-[var(--lm-gold)]" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--lm-dim)]">Weakness</h2>
              <p className="mt-3 text-[var(--lm-bone)]">{a.weakness}</p>
            </div>
          </div>

          <blockquote className="mt-8 border-l-2 border-[var(--lm-ember)] pl-4 font-lm-display text-base leading-relaxed text-[var(--lm-dim)]">
            {a.lore}
          </blockquote>

          <div className="mt-8">
            <ShareButtons slug={a.slug} name={a.name} path={`${base}/result/${a.slug}`} />
          </div>

          <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="font-lm-display text-lg text-[var(--lm-bone)]">Get your full creature profile + HD wallpaper</h2>
            <p className="mb-4 mt-1 text-sm text-[var(--lm-dim)]">Sent to your inbox. Unsubscribe any time.</p>
            <EmailCapture slug={a.slug} />
          </div>

          <div id="portrait" className="mt-6 scroll-mt-6 rounded-xl border border-[#d9a441]/30 bg-gradient-to-b from-[#d9a441]/[0.08] to-transparent p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--lm-gold)]">Your Legendary Creature Portrait</p>
            <h2 className="font-lm-display mt-2 text-xl text-[var(--lm-bone)]">A {a.name} that is yours alone</h2>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-[var(--lm-dim)]">
              A one-of-a-kind portrait painted from your answers and named for you, plus a lore card with its powers and
              legend. Delivered by email in minutes. $12.
            </p>
            {live ? (
              <PortraitOrder slug={a.slug} answers={own ? answers : []} />
            ) : (
              <>
                <p className="mb-3 text-sm font-semibold text-[var(--lm-bone)]">Coming soon. Join the list.</p>
                <EmailCapture slug={a.slug} source="shop_waitlist" cta="Join the list" />
              </>
            )}
          </div>

          <p className="mt-8 text-center text-sm text-[var(--lm-dim)] md:text-left">
            <Link href={`${base}/quiz`} className="underline decoration-white/30 underline-offset-4 hover:text-[var(--lm-bone)]">
              Take the quiz again
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
