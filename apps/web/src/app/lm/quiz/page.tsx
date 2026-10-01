import type { Metadata } from "next";
import { headers } from "next/headers";

import { Quiz } from "@/components/mythicals/quiz";
import { Track } from "@/components/mythicals/track";
import { archetypeImageUrl } from "@/lib/mythicals/archetypes";
import { basePathFor } from "@/lib/mythicals/site";

/**
 * Quiz landing page (2026-10-01): the page ads and bio links point at. A
 * short hero sells the result, and the first question sits right under it,
 * so a visitor can start answering without another click.
 */
export const metadata: Metadata = {
  title: { absolute: "Which Legendary Creature Are You? | Legendary Mythicals" },
  alternates: { canonical: "/quiz" },
};

export default function QuizPage() {
  const base = basePathFor(headers().get("host"));
  return (
    <>
      <Track type="page_view" />
      <section className="relative isolate overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={archetypeImageUrl("storm-dragon")}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_30%] opacity-40"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0b0a09]/30 via-[#0b0a09]/60 to-[#0b0a09]" />
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-14 text-center sm:px-6 sm:pb-14 sm:pt-20">
          <p className="lm-rise lm-eyebrow mb-4">Twelve creatures. One is yours.</p>
          <h1 className="lm-rise font-lm-display text-[2.2rem] font-bold leading-[1.1] text-[var(--lm-bone)] sm:text-6xl">
            Which Legendary Creature Are You?
          </h1>
          <p className="lm-rise mx-auto mt-5 max-w-md text-base leading-relaxed text-[var(--lm-dim)] sm:text-lg" style={{ animationDelay: "80ms" }}>
            Eight questions about how you fight, lead and love. Get your creature, its lore and a free HD wallpaper.
          </p>
          <a href="#quiz" className="lm-btn-gold lm-rise mt-7 px-8" style={{ animationDelay: "140ms" }}>
            Begin
          </a>
        </div>
      </section>
      <section id="quiz" className="scroll-mt-20 px-4 pt-2 sm:px-6">
        <Quiz base={base} />
      </section>
    </>
  );
}
