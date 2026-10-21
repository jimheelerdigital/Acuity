import { notFound } from "next/navigation";

import { ALTERNATIVES_COPY, COMPARE_COPY } from "@/components/marketing/compare/copy";
import {
  BulletList,
  Card,
  DataTable,
  FaqList,
  FinalCta,
  H3,
  JsonLd,
  LINK,
  PageHero,
  SITE_URL,
  Section,
  breadcrumbLd,
  faqLd,
  pageMetadata,
} from "@/components/marketing/compare/ui";
import { ALTERNATIVE_SLUGS, APPS, priceSummary, triLabel, type AlternativeSlug } from "@/lib/compare-data";

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return ALTERNATIVE_SLUGS.map((slug) => ({ slug }));
}

function getCopy(slug: string) {
  return (ALTERNATIVE_SLUGS as readonly string[]).includes(slug) ? ALTERNATIVES_COPY[slug as AlternativeSlug] : undefined;
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const c = getCopy(params.slug);
  if (!c) return {};
  return pageMetadata({ path: `/alternatives/${params.slug}`, title: c.title, description: c.description });
}

export default function AlternativesPage({ params }: { params: { slug: string } }) {
  const c = getCopy(params.slug);
  if (!c) notFound();
  const app = APPS[c.competitor];
  const path = `/alternatives/${params.slug}`;
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Compare", href: "/compare" },
    { name: `${app.name} alternatives`, href: path },
  ];
  const compareName = COMPARE_COPY[c.compareSlug] ? `Ripple vs ${app.name}` : null;

  return (
    <main>
      <JsonLd
        graph={[
          {
            "@type": "WebPage",
            "@id": `${SITE_URL}${path}#webpage`,
            url: `${SITE_URL}${path}`,
            name: c.h1,
            description: c.description,
            dateModified: "2026-10-21",
            inLanguage: "en",
          },
          breadcrumbLd(crumbs),
          {
            "@type": "ItemList",
            name: `${app.name} alternatives`,
            itemListOrder: "https://schema.org/ItemListOrderAscending",
            numberOfItems: c.picks.length,
            itemListElement: c.picks.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: APPS[p.app].name, url: APPS[p.app].url })),
          },
          faqLd(c.faqs),
        ]}
      />
      <PageHero
        crumbs={crumbs}
        eyebrow={`${app.name} alternatives`}
        h1={c.h1}
        lede={c.lede}
        disclosure={
          <>
            We make Ripple, and it is first on this list, so weigh that. Here&rsquo;s how we compared: each app&rsquo;s facts come from its own website, pricing page or app store listing, checked October 21, 2026. For a straight two-way look, see{" "}
            <a className={LINK} href={`/compare/${c.compareSlug}`}>
              {compareName}
            </a>
            .
          </>
        }
      />

      <Section id="why" eyebrow="Why people look" title={`Why people look for a ${app.name} alternative`} tone="white">
        <div className="grid grid-cols-1 gap-4 min-[800px]:grid-cols-2">
          {c.whyLook.map((w) => (
            <Card key={w.title} title={w.title}>
              <p className="m-0 text-[16px] leading-[1.65] text-[#4A443E]">{w.body}</p>
            </Card>
          ))}
        </div>
        <p className="m-0 max-w-[800px] text-[17px] leading-[1.7] text-[#4A443E]">{c.fairNote}</p>
      </Section>

      <Section id="alternatives" eyebrow="The list" title={`${c.picks.length} ${app.name} alternatives worth a look`}>
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {c.picks.map((p, i) => {
            const a = APPS[p.app];
            return (
              <li key={p.app} className={i === 0 ? "flex flex-col gap-4 rounded-[26px] bg-[#1B1815] p-6 text-white min-[900px]:p-8" : "flex flex-col gap-4 rounded-[26px] border border-[#EEE7DE] bg-white p-6 min-[900px]:p-8"}>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className={i === 0 ? "text-[15px] font-extrabold text-[#F7A386]" : "text-[15px] font-extrabold text-[#B9472A]"}>{String(i + 1).padStart(2, "0")}</span>
                  <h3 className={H3}>{a.name}</h3>
                  <span className={i === 0 ? "text-[14px] font-bold text-[#CFC7BE]" : "text-[14px] font-bold text-[#57514B]"}>{p.label}</span>
                </div>
                <p className={i === 0 ? "m-0 text-[16.5px] leading-[1.65] text-[#E9E3DC]" : "m-0 text-[16.5px] leading-[1.65] text-[#4A443E]"}>{p.why}</p>
                <p className={i === 0 ? "m-0 text-[14.5px] font-semibold text-[#CFC7BE]" : "m-0 text-[14.5px] font-semibold text-[#57514B]"}>
                  {priceSummary(a)} · Free tier: {a.pricing.free}
                </p>
                {p.compareSlug && (
                  <a href={`/compare/${p.compareSlug}`} className={i === 0 ? "self-start text-[15px] font-bold text-[#F7A386] underline underline-offset-4" : `self-start text-[15px] ${LINK}`}>
                    Ripple vs {a.name}, compared
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      </Section>

      <Section eyebrow="At a glance" title="How they line up" tone="white">
        <DataTable
          caption={`${app.name} and alternatives compared`}
          headers={["App", "Voice input", "To-dos from entries", "Habit tracking", "AI chat", "Free tier"]}
          highlightCol={undefined}
          rows={[app, ...c.picks.map((p) => APPS[p.app])].map((a) => [
            a.name,
            triLabel(a.input.voice),
            triLabel(a.taskExtraction),
            triLabel(a.habitTracking),
            triLabel(a.ai.companionChat),
            a.pricing.free,
          ])}
          note="Checked October 21, 2026. “Not stated” means we could not find it on the app’s own pages. Prices and features change."
        />
      </Section>

      <Section eyebrow="Before you switch" title="What to check first" narrow>
        <BulletList items={c.checklist} />
        <p className="m-0 text-[17px] leading-[1.7] text-[#4A443E]">
          Want the bigger picture? Read{" "}
          <a className={LINK} href="/best-ai-journaling-apps">
            the best AI journaling apps in 2026
          </a>
          , or see how Ripple works as an{" "}
          <a className={LINK} href="/ai-journal-app">
            AI journal app
          </a>
          .
        </p>
      </Section>

      <FaqList faqs={c.faqs} title={`${app.name} alternatives: questions people ask`} />
      <FinalCta title={c.cta.title} body={c.cta.body} />
    </main>
  );
}
