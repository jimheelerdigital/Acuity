"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/* ═══════════════════════════════════════════════════
   Shared testimonial carousel — used by homepage
   and /for/[slug] landing pages
   ═══════════════════════════════════════════════════ */

export interface CarouselTestimonial {
  quote: string;
  name: string;
  role: string;
  initials: string;
  bgColor: string;
  imageSrc?: string;
}

/** Gender-split fallback headshot pools */
const FALLBACK_FEMALE = [
  "/testimonials/rachel-w.png",
  "/testimonials/nina-s.png",
  "/testimonials/maya-p.png",
  "/testimonials/emma-r.png",
  "/testimonials/lisa-t.png",
  "/testimonials/aisha-n.png",
  "/testimonials/sofia-g.png",
  "/testimonials/sarah-k.png",
];
const FALLBACK_MALE = [
  "/testimonials/alex-m.png",
  "/testimonials/tom-h.png",
  "/testimonials/james-c.png",
  "/testimonials/chris-b.png",
  "/testimonials/daniel-j.png",
  "/testimonials/mike-d.png",
  "/testimonials/ryan-f.png",
  "/testimonials/kevin-l.png",
];

const FEMALE_NAMES = new Set([
  "sarah", "jamie", "priya", "emma", "nina", "maya", "lisa", "aisha", "sofia",
  "rachel", "jessica", "jennifer", "amanda", "ashley", "stephanie", "nicole",
  "elizabeth", "heather", "megan", "emily", "anna", "maria", "laura", "kate",
  "katherine", "olivia", "ava", "sophia", "isabella", "mia", "charlotte",
  "amelia", "harper", "evelyn", "abigail", "ella", "lily", "grace", "chloe",
  "natalie", "hannah", "zoe", "riley", "leah", "audrey", "savannah", "claire",
  "samantha", "victoria", "madison", "diana", "andrea", "carmen", "rosa",
  "fatima", "anika", "devi", "pooja", "neha", "riya", "ananya", "shreya",
  "mei", "yuki", "hana", "lin", "wei", "jing", "suki", "kim", "ji", "yuna",
]);

/** Pick a deterministic gender-appropriate fallback headshot */
export function pickFallbackHeadshot(name: string): string {
  const firstName = name.split(" ")[0].toLowerCase();
  const pool = FEMALE_NAMES.has(firstName) ? FALLBACK_FEMALE : FALLBACK_MALE;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return pool[Math.abs(hash) % pool.length];
}

/** The shared set of testimonials used across all pages */
export const STATIC_CAROUSEL_TESTIMONIALS: CarouselTestimonial[] = [
  {
    quote: "I used to let tasks pile up in my head until 2 AM. Now I debrief into Ripple and actually sleep.",
    name: "Sarah K.",
    role: "Product manager",
    initials: "SK",
    bgColor: "bg-pink-500",
    imageSrc: "/testimonials/sarah-k.png",
  },
  {
    quote: "The weekly reports are unreal. It\u2019s like having a therapist and a project manager rolled into one AI.",
    name: "Marcus T.",
    role: "Product manager",
    initials: "MT",
    bgColor: "bg-sky-600",
    imageSrc: "/testimonials/marcus-t.png",
  },
  {
    quote: "I\u2019ve tried every journaling app. This is the first one that stuck because I just talk.",
    name: "Jamie L.",
    role: "Designer",
    initials: "JL",
    bgColor: "bg-rose-500",
    imageSrc: "/testimonials/jamie-l.png",
  },
  {
    quote: "I mentioned \u2018morning routine\u2019 12 times in two weeks but never built one. Seeing that in my report changed everything.",
    name: "Priya R.",
    role: "Consultant",
    initials: "PR",
    bgColor: "bg-emerald-600",
    imageSrc: "/testimonials/priya-r.png",
  },
  {
    quote: "My partner noticed the difference before I did. I\u2019m actually present when I get home now.",
    name: "David K.",
    role: "Engineer",
    initials: "DK",
    bgColor: "bg-amber-600",
    imageSrc: "/testimonials/david-k.png",
  },
];

/** Build carousel testimonials from a page-specific testimonial + shared static ones */
export function buildTestimonialsWithLeader(testimonial: { quote: string; name: string; detail: string }): CarouselTestimonial[] {
  const parts = testimonial.name.split(" ");
  const initials = parts.length >= 2
    ? (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase()
    : testimonial.name.slice(0, 2).toUpperCase();
  return [
    { quote: testimonial.quote, name: testimonial.name, role: testimonial.detail, initials, bgColor: "bg-[#7C5CFC]", imageSrc: pickFallbackHeadshot(testimonial.name) },
    ...STATIC_CAROUSEL_TESTIMONIALS,
  ];
}

/* ═══════════════════════════════════════════════════
   TestimonialCarousel — auto-scrolls on desktop,
   horizontal peek on mobile
   ═══════════════════════════════════════════════════ */

export function TestimonialCarousel({ testimonials }: { testimonials: CarouselTestimonial[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 640) return;

    let offset = 0;
    let animId: number;
    const speed = 1.13;

    function step() {
      if (!paused) {
        offset += speed;
        const singleSetWidth = testimonials.length * 272;
        if (offset >= singleSetWidth) offset -= singleSetWidth;
        if (track) track.style.transform = `translateX(-${offset}px)`;
      }
      animId = requestAnimationFrame(step);
    }
    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [paused, testimonials.length]);

  const doubled = [...testimonials, ...testimonials];

  return (
    <section className="pt-6 pb-10 sm:pt-8 sm:pb-12 overflow-hidden">
      {/* Desktop: horizontal scrolling carousel */}
      <div
        className="hidden sm:block"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="relative">
          <div
            ref={trackRef}
            className="flex gap-3 will-change-transform"
            style={{ width: "max-content" }}
          >
            {doubled.map((t, i) => (
              <TestimonialCard key={`${t.name}-${i}`} testimonial={t} />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: horizontal peek (1.5 cards visible) */}
      <div className="sm:hidden flex gap-3 px-4 overflow-x-auto no-scrollbar snap-x snap-mandatory">
        {testimonials.map((t) => (
          <TestimonialCard key={t.name} testimonial={t} />
        ))}
      </div>
    </section>
  );
}

function TestimonialCard({ testimonial: t }: { testimonial: CarouselTestimonial }) {
  return (
    <div className="w-[230px] sm:w-[260px] shrink-0 snap-start rounded-lg border border-white/10 bg-[#1E1C1A] p-3.5 sm:p-4">
      <div className="flex items-center gap-0.5 mb-2">
        {[...Array(5)].map((_, i) => (
          <svg key={i} className="h-3 w-3 text-[#7C5CFC]" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <blockquote className="text-xs text-[#B0A898] leading-relaxed mb-3">
        &ldquo;{t.quote}&rdquo;
      </blockquote>
      <div className="flex items-center gap-2">
        {t.imageSrc ? (
          <Image src={t.imageSrc} alt={t.name} width={28} height={28} className="h-7 w-7 rounded-full object-cover" loading="lazy" />
        ) : (
          <div className={`flex h-7 w-7 items-center justify-center rounded-full ${t.bgColor} text-[9px] font-bold text-white`}>
            {t.initials}
          </div>
        )}
        <div>
          <div className="text-xs font-semibold text-white">{t.name}</div>
          <div className="text-[10px] text-[#B0A898]/60">{t.role}</div>
        </div>
      </div>
    </div>
  );
}
