import { headers } from "next/headers";
import Link from "next/link";

import { Track } from "@/components/mythicals/track";
import { ARCHETYPES, archetypeImageUrl, type ArchetypeSlug } from "@/lib/mythicals/archetypes";
import { basePathFor } from "@/lib/mythicals/site";

const FEATURED: ArchetypeSlug[] = ["storm-dragon", "phoenix", "shadow-fenrir", "kraken"];

export default function MythicalsLanding() {
  const base = basePathFor(headers().get("host"));
  return (
    <>
      <Track type="page_view" />
      <section className="relative isolate overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={archetypeImageUrl("storm-dragon")}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-45"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0b0a09]/40 via-[#0b0a09]/60 to-[#0b0a09]" />
        <div className="mx-auto flex min-h-[78vh] max-w-3xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
          <p className="lm-rise mb-5 text-xs uppercase tracking-[0.35em] text-[var(--lm-gold)]">Twelve creatures. One is yours.</p>
          <h1 className="lm-rise font-lm-display text-[2.4rem] font-bold leading-[1.1] text-[var(--lm-bone)] sm:text-6xl">
            Which Legendary Creature Are You?
          </h1>
          <p className="lm-rise mx-auto mt-6 max-w-md text-base leading-relaxed text-[var(--lm-dim)] sm:text-lg" style={{ animationDelay: "80ms" }}>
            Eight questions about how you fight, lead and love. At the end, the creature that lives in you, with its strengths, its weakness and its lore.
          </p>
          <Link href={`${base}/quiz`} className="lm-btn-gold lm-rise mt-9 px-8 text-lg" style={{ animationDelay: "160ms" }}>
            Take the 60-second quiz
          </Link>
          <p className="mt-6 text-sm text-[var(--lm-dim)]">
            Join the legends at{" "}
            <a href="https://instagram.com/legendarymythicals" target="_blank" rel="noopener noreferrer" className="text-[var(--lm-bone)] underline decoration-[#d9a441]/60 underline-offset-4">
              @legendarymythicals
            </a>
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 className="font-lm-display text-center text-xl text-[var(--lm-bone)] sm:text-2xl">Who answers when you call?</h2>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {FEATURED.map((slug) => {
            const a = ARCHETYPES[slug];
            return (
              <Link
                key={slug}
                href={`${base}/quiz`}
                className="group relative aspect-[9/14] overflow-hidden rounded-xl border border-white/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={archetypeImageUrl(slug)}
                  alt={a.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                  <p className="font-lm-display text-base text-[var(--lm-bone)] sm:text-lg">{a.name}</p>
                  <p className="mt-0.5 text-xs leading-snug text-[var(--lm-dim)]">{a.title}</p>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-10 text-center">
          <Link href={`${base}/quiz`} className="lm-btn-ghost">
            Find your creature
          </Link>
        </div>
      </section>
    </>
  );
}
