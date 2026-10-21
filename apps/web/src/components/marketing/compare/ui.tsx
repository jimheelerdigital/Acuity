/**
 * Shared building blocks for the comparison pages (2026-10-21):
 * /best-ai-journaling-apps, /compare, /compare/[slug], /alternatives/[slug].
 *
 * Server components in the 2026-10 site look (cream #FBF8F4, ink #1B1815,
 * CTA #B9472A, coral #F27A55, violet #6D5EF0, mint #237A5C, Manrope via
 * font-display, 24–28px cards, uppercase coral eyebrows). No highlight bars
 * behind text: emphasis is weight or colour only. Pages sit inside
 * ContentShell (site-chrome) via each route's layout.
 *
 * Copy rules (docs/acuity-positioning.md): no recording-duration claims, no
 * time-of-day framing, never claim Ripple treats, diagnoses, cures or
 * replaces therapy, never "no card required".
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";

import s from "@/components/marketing/home-v2/home-v2.module.css";
import { OG_IMAGE } from "@/lib/seo";

export const SITE_URL = "https://goripple.io";
export const UPDATED_LABEL = "Updated October 21, 2026";
export const UPDATED_ISO = "2026-10-21";

export const WRAP = "mx-auto w-full max-w-[1200px] px-4 min-[900px]:px-10";
export const NARROW = "mx-auto w-full max-w-[880px] px-4 min-[900px]:px-10";
export const EYEBROW = "text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#B9472A]";
export const H2 = "m-0 font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.035em] min-[900px]:text-[44px]";
export const H3 = "m-0 font-display text-[21px] font-extrabold leading-[1.2] tracking-[-0.02em] min-[900px]:text-[24px]";
export const BODY = "m-0 text-[17px] leading-[1.7] text-[#4A443E] min-[900px]:text-[18px]";
export const LINK = "font-semibold text-[#B9472A] underline decoration-[1.5px] underline-offset-[3px] hover:text-[#8F3519]";

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

export type Faq = { q: string; a: string };
export type Crumb = { name: string; href: string };

/** Metadata in the site pattern. `title` is the full string incl. " | Ripple" (≤60 chars). */
export function pageMetadata({ path, title, description }: { path: string; title: string; description: string }): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "Ripple",
      type: "article",
      images: [{ url: OG_IMAGE.url, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: OG_IMAGE.alt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

export function breadcrumbLd(crumbs: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE_URL}${c.href === "/" ? "" : c.href}`,
    })),
  };
}

export function faqLd(faqs: Faq[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function JsonLd({ graph }: { graph: object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }) }}
    />
  );
}

export function Arrow({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[14px] font-semibold text-[#57514B]">
      <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href} className="flex items-center gap-2">
              {last ? (
                <span aria-current="page" className="text-[#1B1815]">
                  {c.name}
                </span>
              ) : (
                <>
                  <a href={c.href} className="inline-flex min-h-11 items-center text-[#57514B] underline-offset-4 hover:underline">
                    {c.name}
                  </a>
                  <span aria-hidden="true">/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Hero: breadcrumbs, eyebrow, the page's only H1, lede, updated date and the bias disclosure. */
export function PageHero({
  crumbs,
  eyebrow,
  h1,
  h1Accent,
  lede,
  disclosure,
  children,
}: {
  crumbs: Crumb[];
  eyebrow: string;
  h1: string;
  h1Accent?: string;
  lede: string[];
  disclosure: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden pb-12 pt-4 min-[900px]:pb-20 min-[900px]:pt-8">
      <div aria-hidden="true" className="absolute right-[-160px] top-[-120px] h-[360px] w-[360px] rounded-full bg-[#FDE6DC] min-[900px]:right-[-200px] min-[900px]:top-[-160px] min-[900px]:h-[620px] min-[900px]:w-[620px]" />
      <svg className={cx(s.spin, "pointer-events-none absolute right-[-300px] top-[-260px]")} aria-hidden="true" width="980" height="980" viewBox="0 0 980 980">
        <circle cx="490" cy="490" r="300" fill="none" stroke="#F27A55" strokeOpacity="0.22" strokeWidth="2" strokeDasharray="4 14" />
        <circle cx="490" cy="490" r="420" fill="none" stroke="#6D5EF0" strokeOpacity="0.1" strokeWidth="2" strokeDasharray="40 30" />
      </svg>
      <div className={cx(WRAP, "relative flex flex-col gap-6")}>
        <Breadcrumbs crumbs={crumbs} />
        <div className="flex max-w-[900px] flex-col gap-6">
          <div className={EYEBROW}>{eyebrow}</div>
          <h1 className="m-0 font-display text-[38px] font-extrabold leading-[1.05] tracking-[-0.04em] min-[900px]:text-[64px]">
            {h1}
            {h1Accent && (
              <>
                {" "}
                <span className="text-[#B9472A]">{h1Accent}</span>
              </>
            )}
          </h1>
          {lede.map((p, i) => (
            <p key={i} className={cx("m-0 max-w-[720px] leading-[1.6] text-[#4A443E]", i === 0 ? "text-[18px] min-[900px]:text-[21px]" : "text-[16px] min-[900px]:text-[18px]")}>
              {p}
            </p>
          ))}
          <div className="flex max-w-[760px] flex-col gap-2 rounded-[24px] border border-[#EEE7DE] bg-white p-5 min-[900px]:p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-extrabold uppercase tracking-[0.08em]">
              <time dateTime={UPDATED_ISO} className="text-[#237A5C]">
                {UPDATED_LABEL}
              </time>
              <span aria-hidden="true" className="text-[#D8CDBF]">
                ·
              </span>
              <span className="text-[#57514B]">Disclosure</span>
            </div>
            <p className="m-0 text-[15.5px] leading-[1.6] text-[#4A443E]">{disclosure}</p>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  tone = "cream",
  narrow,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  children?: ReactNode;
  tone?: "cream" | "white" | "peach";
  narrow?: boolean;
}) {
  const bg = tone === "white" ? "border-y border-[#EEE7DE] bg-white" : tone === "peach" ? "bg-[#FFF4EF]" : "";
  return (
    <section id={id} className={cx("scroll-mt-24 py-14 min-[900px]:py-20", bg)}>
      <div className={cx(narrow ? NARROW : WRAP, "flex flex-col gap-8")}>
        <div className="flex max-w-[800px] flex-col gap-4">
          {eyebrow && <div className={EYEBROW}>{eyebrow}</div>}
          <h2 className={H2}>{title}</h2>
          {intro && (typeof intro === "string" ? <p className={BODY}>{intro}</p> : intro)}
        </div>
        {children}
      </div>
    </section>
  );
}

/**
 * Scrollable table in a rounded card. The first column sticks on narrow
 * screens; `highlightCol` tints Ripple's column so the eye can find it.
 */
export function DataTable({
  caption,
  headers,
  rows,
  highlightCol,
  note,
}: {
  caption: string;
  headers: string[];
  rows: ReactNode[][];
  highlightCol?: number;
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-[24px] border border-[#EEE7DE] bg-white">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-[15px] leading-[1.5]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={cx(
                    "whitespace-nowrap px-4 py-3.5 text-[12.5px] font-extrabold uppercase tracking-[0.08em]",
                    i === highlightCol ? "bg-[#B9472A] text-white" : "bg-[#1B1815] text-white",
                    i === 0 && "sticky left-0 z-[1]",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((cell, ci) =>
                  ci === 0 ? (
                    <th key={ci} scope="row" className={cx("sticky left-0 z-[1] border-t border-[#EEE7DE] px-4 py-3.5 align-top font-extrabold text-[#1B1815]", ri % 2 ? "bg-[#FBF8F4]" : "bg-white")}>
                      {cell}
                    </th>
                  ) : (
                    <td key={ci} className={cx("border-t border-[#EEE7DE] px-4 py-3.5 align-top text-[#2B2622]", ci === highlightCol ? "bg-[#FFF4EF] font-semibold" : ri % 2 ? "bg-[#FBF8F4]" : "bg-white")}>
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="m-0 text-[14.5px] leading-[1.6] text-[#57514B]">{note}</p>}
    </div>
  );
}

/** Two cards side by side: what each app does better. */
export function ProsCons({ pros, cons, prosTitle = "Good at", consTitle = "Watch out for" }: { pros: string[]; cons: string[]; prosTitle?: string; consTitle?: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[700px]:grid-cols-2">
      <div className="flex flex-col gap-3 rounded-[22px] bg-[#EAF7F1] p-5">
        <div className="text-[12.5px] font-extrabold uppercase tracking-[0.1em] text-[#1D6B51]">{prosTitle}</div>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {pros.map((p) => (
            <li key={p} className="flex gap-2.5 text-[16px] leading-[1.55] text-[#1B1815]">
              <span aria-hidden="true" className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#237A5C] text-[12px] font-extrabold text-white">
                +
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-3 rounded-[22px] bg-[#FFF4EF] p-5">
        <div className="text-[12.5px] font-extrabold uppercase tracking-[0.1em] text-[#8F3519]">{consTitle}</div>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {cons.map((p) => (
            <li key={p} className="flex gap-2.5 text-[16px] leading-[1.55] text-[#1B1815]">
              <span aria-hidden="true" className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F27A55] text-[13px] font-extrabold text-[#1B1815]">
                −
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A plain card with a title and paragraphs or a list. */
export function Card({ title, children, tone = "white" }: { title: string; children: ReactNode; tone?: "white" | "ink" | "violet" | "mint" | "lilac" | "peach" }) {
  const t = {
    white: "border border-[#EEE7DE] bg-white text-[#1B1815]",
    ink: "bg-[#1B1815] text-white",
    violet: "bg-[#6D5EF0] text-white",
    mint: "bg-[#237A5C] text-white",
    lilac: "bg-[#F2F0FF] text-[#1B1815]",
    peach: "bg-[#FFF4EF] text-[#1B1815]",
  }[tone];
  return (
    <div className={cx("flex min-w-0 flex-col gap-4 rounded-[26px] p-6 min-[900px]:p-8", t)}>
      <h3 className={H3}>{title}</h3>
      {children}
    </div>
  );
}

export function BulletList({ items, dark }: { items: ReactNode[]; dark?: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((it, i) => (
        <li key={i} className={cx("flex gap-3 text-[16px] leading-[1.6]", dark ? "text-white" : "text-[#2B2622]")}>
          <span aria-hidden="true" className={cx("mt-[9px] h-2 w-2 shrink-0 rounded-full", dark ? "bg-[#F7A386]" : "bg-[#F27A55]")} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export function FaqList({ faqs, title = "Questions people ask" }: { faqs: Faq[]; title?: string }) {
  return (
    <section id="faq" className="scroll-mt-24 py-14 min-[900px]:py-20">
      <div className={cx(NARROW, "flex flex-col gap-8")}>
        <div className="flex flex-col gap-4">
          <div className={EYEBROW}>FAQ</div>
          <h2 className={H2}>{title}</h2>
        </div>
        <div className="flex flex-col gap-3">
          {faqs.map((f, i) => (
            <details key={f.q} open={i === 0} className="group rounded-[22px] border border-[#EEE7DE] bg-white open:border-[#1B1815] open:bg-[#1B1815] open:text-white">
              <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-[17px] font-extrabold min-[900px]:px-7 min-[900px]:text-[19px] [&::-webkit-details-marker]:hidden">
                <h3 className="m-0 text-[inherit] font-extrabold">{f.q}</h3>
                <span aria-hidden="true" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#F3EEE8] text-[22px] text-[#B9472A] transition-transform group-open:rotate-45 group-open:bg-[#F27A55] group-open:text-[#1B1815]">
                  +
                </span>
              </summary>
              <p className="m-0 px-5 pb-6 text-[16px] leading-[1.65] text-[#CFC7BE] min-[900px]:pl-7 min-[900px]:pr-16 min-[900px]:text-[17px]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ title, body }: { title: string; body: string }) {
  return (
    <section className="px-3 py-14 min-[900px]:px-0 min-[900px]:py-20">
      <div className="mx-auto w-full max-w-[1200px] min-[900px]:px-10">
        <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-[30px] bg-[#F27A55] px-5 py-14 text-center min-[900px]:rounded-[40px] min-[900px]:px-10 min-[900px]:py-20">
          <span className={s.bigring} />
          <span className={s.bigring} style={{ animationDelay: "1.5s" }} />
          <h2 className="relative m-0 max-w-[860px] font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.04em] text-[#1B1815] min-[900px]:text-[54px]">{title}</h2>
          <p className="relative m-0 max-w-[620px] text-[17px] font-semibold leading-[1.5] text-[#2B211C] min-[900px]:text-[19px]">{body}</p>
          <a href="/start" className="relative inline-flex h-[60px] w-full items-center justify-center gap-2.5 rounded-full bg-[#1B1815] px-9 text-[18px] font-extrabold text-white no-underline shadow-[0_16px_40px_rgba(27,24,21,0.3)] transition-transform hover:-translate-y-0.5 min-[520px]:w-auto">
            Start your free week <Arrow />
          </a>
          <p className="relative m-0 text-[14px] font-bold text-[#2B211C]">7-day free trial · Cancel before day 7 and pay nothing</p>
        </div>
      </div>
    </section>
  );
}

/** Grid of link cards (compare hub, related comparisons). */
export function LinkCards({ items }: { items: { href: string; title: string; blurb: string }[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[640px]:grid-cols-2 min-[1000px]:grid-cols-3">
      {items.map((p) => (
        <li key={p.href}>
          <a href={p.href} className={cx(s.lift, "flex h-full min-h-11 flex-col gap-2 rounded-[24px] border border-[#EEE7DE] bg-white p-6 text-[#1B1815] no-underline")}>
            <span className="flex items-center justify-between gap-3 text-[19px] font-extrabold tracking-[-0.01em]">
              {p.title}
              <span className="text-[#B9472A]">
                <Arrow />
              </span>
            </span>
            <span className="text-[15px] leading-[1.55] text-[#57514B]">{p.blurb}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
