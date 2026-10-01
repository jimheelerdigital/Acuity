import { headers } from "next/headers";
import Link from "next/link";

import { EmailCapture } from "@/components/mythicals/result-actions";
import { SocialLinks } from "@/components/mythicals/socials";
import { Track } from "@/components/mythicals/track";
import { ARCHETYPE_LIST, archetypeImageUrl, type ArchetypeSlug } from "@/lib/mythicals/archetypes";
import { basePathFor, MYTHICALS_EMBLEM_URL, MYTHICALS_SOCIALS, PORTRAIT_PRICE_CENTS, shopLive } from "@/lib/mythicals/site";

/**
 * Legendary Mythicals home (2026-10-01, per Keenan: "make the website look
 * even more premium and have places for ecom purchases and other potential
 * business ventures. we'll make the quiz a landing page"). The brand's front
 * door: creatures, the quiz, the portrait, the shop (waitlist until the
 * Shopify/Amazon products are wired), partnerships and the socials. The
 * quiz itself lives at /quiz as the ad landing page.
 */

const SHOP: { title: string; blurb: string; img: ArchetypeSlug }[] = [
  { title: "Creature Lamps", blurb: "Dragon, phoenix and kirin lamps that glow like embers.", img: "phoenix" },
  { title: "Art Prints & Canvas", blurb: "Museum-grade prints of every legend in the bestiary.", img: "storm-dragon" },
  { title: "Apparel", blurb: "Wear your creature. Heavyweight tees and hoodies.", img: "shadow-fenrir" },
  { title: "Collectibles", blurb: "Figures, pins and relics for the hoard.", img: "griffin" },
];

const VENTURES = [
  { title: "Brand partnerships", body: "Put your product in front of a fast-growing fantasy audience." },
  { title: "Licensing", body: "License our creatures for games, books, merch and print." },
  { title: "Custom commissions", body: "A legendary creature made for your team, guild or event." },
];

export default function MythicalsHome() {
  const base = basePathFor(headers().get("host"));
  const live = shopLive();
  const follow = MYTHICALS_SOCIALS.filter((s) => s.url);
  return (
    <>
      <Track type="page_view" />

      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={archetypeImageUrl("storm-dragon")}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0b0a09_75%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0b0a09]/30 via-transparent to-[#0b0a09]" />
        <div className="mx-auto flex min-h-[86vh] max-w-3xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={MYTHICALS_EMBLEM_URL}
            alt="Legendary Mythicals emblem"
            width={176}
            height={176}
            className="lm-rise lm-glow mb-8 h-36 w-36 rounded-full sm:h-44 sm:w-44"
          />
          <p className="lm-rise lm-eyebrow mb-5">Creatures of legend · New every day</p>
          <h1 className="lm-rise font-lm-display text-[2.5rem] font-bold leading-[1.08] text-[var(--lm-bone)] sm:text-7xl" style={{ animationDelay: "60ms" }}>
            Every Legend Has a Creature
          </h1>
          <p className="lm-rise mx-auto mt-6 max-w-lg text-base leading-relaxed text-[var(--lm-dim)] sm:text-lg" style={{ animationDelay: "120ms" }}>
            Dragons, phoenixes, krakens and the beasts of a hundred myths. Find the one that lives in you.
          </p>
          <div className="lm-rise mt-9 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "180ms" }}>
            <Link href={`${base}/quiz`} className="lm-btn-gold px-8 text-lg">
              Find your creature
            </Link>
            <a href="#creatures" className="lm-btn-ghost px-8 text-lg">
              Meet the bestiary
            </a>
          </div>
        </div>
      </section>

      {/* Bestiary */}
      <section id="creatures" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-10 sm:px-6">
        <div className="text-center">
          <p className="lm-eyebrow">The Bestiary</p>
          <h2 className="font-lm-display mt-3 text-3xl text-[var(--lm-bone)] sm:text-4xl">Twelve Legends. One Is Yours.</h2>
          <div className="lm-rule mt-5 text-xs">◆</div>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {ARCHETYPE_LIST.map((a) => (
            <Link
              key={a.slug}
              href={`${base}/quiz`}
              className="group relative aspect-[9/14] overflow-hidden rounded-xl border border-white/10 transition hover:border-[#d9a441]/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={archetypeImageUrl(a.slug)}
                alt={a.name}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                <p className="font-lm-display text-base text-[var(--lm-bone)] sm:text-lg">{a.name}</p>
                <p className="mt-0.5 text-xs leading-snug text-[var(--lm-dim)]">{a.title}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Quiz band */}
      <section className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <div className="lm-card grid overflow-hidden md:grid-cols-2">
          <div className="relative min-h-[280px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={archetypeImageUrl("frost-kirin")} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0a09] to-transparent md:bg-gradient-to-r md:from-transparent md:to-[#0f0d0b]" />
          </div>
          <div className="p-7 sm:p-10">
            <p className="lm-eyebrow">The Quiz</p>
            <h2 className="font-lm-display mt-3 text-3xl text-[var(--lm-bone)]">Which Legendary Creature Are You?</h2>
            <p className="mt-4 leading-relaxed text-[var(--lm-dim)]">
              Eight questions about how you fight, lead and love. Your creature, its strengths, its weakness and its lore,
              plus a free HD phone wallpaper.
            </p>
            <Link href={`${base}/quiz`} className="lm-btn-gold mt-7">
              Take the quiz
            </Link>
          </div>
        </div>
      </section>

      {/* Portrait */}
      <section id="portrait" className="mx-auto mt-24 max-w-6xl scroll-mt-20 px-4 sm:px-6">
        <div className="text-center">
          <p className="lm-eyebrow">Legendary Creature Portraits</p>
          <h2 className="font-lm-display mt-3 text-3xl text-[var(--lm-bone)] sm:text-4xl">A Creature That Is Yours Alone</h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[var(--lm-dim)]">
            A one-of-a-kind portrait painted from your quiz answers and named for you, with a lore card of its powers and legend.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            ["I", "Take the quiz", "Your answers decide its element, its temper and its look."],
            ["II", "Name your legend", "Give it the name it will answer to."],
            ["III", "Receive it in minutes", "Your portrait and lore card arrive by email, in full resolution."],
          ].map(([n, t, b]) => (
            <div key={n} className="lm-card p-6 text-center">
              <p className="font-lm-display text-2xl text-[var(--lm-gold)]">{n}</p>
              <p className="mt-2 font-semibold text-[var(--lm-bone)]">{t}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lm-dim)]">{b}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href={`${base}/quiz`} className="lm-btn-gold px-8">
            {live ? `Start my portrait · $${PORTRAIT_PRICE_CENTS / 100}` : "Take the quiz to begin"}
          </Link>
          {!live && <p className="mt-3 text-sm text-[var(--lm-dim)]">Portraits open soon. Your result page will let you claim yours first.</p>}
        </div>
      </section>

      {/* Shop */}
      <section id="shop" className="mx-auto mt-24 max-w-6xl scroll-mt-20 px-4 sm:px-6">
        <div className="text-center">
          <p className="lm-eyebrow">The Hoard</p>
          <h2 className="font-lm-display mt-3 text-3xl text-[var(--lm-bone)] sm:text-4xl">Treasures for the Legends</h2>
          <div className="lm-rule mt-5 text-xs">◆</div>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SHOP.map((p) => (
            <div key={p.title} className="lm-card group overflow-hidden">
              <div className="relative aspect-[4/5] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={archetypeImageUrl(p.img)}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0a09] via-transparent to-transparent" />
                <span className="absolute left-3 top-3 rounded-full border border-[#d9a441]/50 bg-black/60 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--lm-gold)]">
                  Coming soon
                </span>
              </div>
              <div className="p-5">
                <p className="font-lm-display text-lg text-[var(--lm-bone)]">{p.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--lm-dim)]">{p.blurb}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="lm-card mx-auto mt-8 max-w-2xl p-6 text-center sm:p-8">
          <p className="font-lm-display text-xl text-[var(--lm-bone)]">Be first into the Hoard</p>
          <p className="mb-5 mt-2 text-sm text-[var(--lm-dim)]">Get first access and launch pricing when the shop opens.</p>
          <EmailCapture slug="" source="list_shop" cta="Join the list" doneText="You're on the list. We'll tell you the moment it opens." />
        </div>
      </section>

      {/* Ventures */}
      <section className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <p className="lm-eyebrow">Work With the Legends</p>
          <h2 className="font-lm-display mt-3 text-3xl text-[var(--lm-bone)] sm:text-4xl">Partnerships</h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {VENTURES.map((v) => (
            <a
              key={v.title}
              href={`mailto:keenan@heelerdigital.com?subject=${encodeURIComponent(`Legendary Mythicals: ${v.title}`)}`}
              className="lm-card block p-6 transition hover:border-[#d9a441]/50"
            >
              <p className="font-lm-display text-lg text-[var(--lm-bone)]">{v.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lm-dim)]">{v.body}</p>
              <p className="mt-4 text-sm text-[var(--lm-gold)]">Get in touch →</p>
            </a>
          ))}
        </div>
      </section>

      {/* Follow */}
      {follow.length > 0 && (
        <section className="mx-auto mt-24 max-w-3xl px-4 text-center sm:px-6">
          <p className="lm-eyebrow">Follow the Legends</p>
          <h2 className="font-lm-display mt-3 text-3xl text-[var(--lm-bone)]">A New Creature Every Day</h2>
          <p className="mt-3 text-[var(--lm-dim)]">Pick your side in our daily battles, choices and legends.</p>
          <div className="mt-7 flex justify-center">
            <SocialLinks size={22} />
          </div>
        </section>
      )}
    </>
  );
}
