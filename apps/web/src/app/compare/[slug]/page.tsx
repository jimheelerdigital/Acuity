import { notFound } from "next/navigation";

import { COMPARE_COPY } from "@/components/marketing/compare/copy";
import {
  BulletList,
  Card,
  DataTable,
  FaqList,
  FinalCta,
  JsonLd,
  LINK,
  LinkCards,
  PageHero,
  SITE_URL,
  Section,
  breadcrumbLd,
  faqLd,
  pageMetadata,
} from "@/components/marketing/compare/ui";
import { APPS, COMPARE_SLUGS, RIPPLE, comparisonRows, type CompareSlug } from "@/lib/compare-data";

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPARE_SLUGS.map((slug) => ({ slug }));
}

function getCopy(slug: string) {
  return (COMPARE_SLUGS as readonly string[]).includes(slug) ? COMPARE_COPY[slug as CompareSlug] : undefined;
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const c = getCopy(params.slug);
  if (!c) return {};
  return pageMetadata({ path: `/compare/${params.slug}`, title: c.title, description: c.description });
}

export default function ComparePage({ params }: { params: { slug: string } }) {
  const c = getCopy(params.slug);
  if (!c) notFound();
  const app = APPS[c.competitor];
  const path = `/compare/${params.slug}`;
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Compare", href: "/compare" },
    { name: `Ripple vs ${app.name}`, href: path },
  ];
  const others = COMPARE_SLUGS.filter((s) => s !== params.slug).slice(0, 6);

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
          faqLd(c.faqs),
        ]}
      />
      <PageHero
        crumbs={crumbs}
        eyebrow={`Ripple vs ${app.name}`}
        h1={c.h1}
        lede={c.verdict}
        disclosure={
          <>
            We make Ripple, so read this with that in mind. We compared the two apps using {app.name}&rsquo;s own website, pricing page and app store listing (checked October 21, 2026), and we say plainly where {app.name} is the better pick. Prices and features change, so check{" "}
            <a className={LINK} href={app.pricing.sourceUrl} target="_blank" rel="noopener noreferrer">
              {app.name}&rsquo;s pricing
            </a>{" "}
            before you decide.
          </>
        }
      />

      <Section id="side-by-side" eyebrow="Side by side" title={`${app.name} and Ripple, feature by feature`} intro={c.tableIntro} tone="white">
        <DataTable
          caption={`Ripple vs ${app.name} comparison`}
          headers={["", app.name, "Ripple"]}
          highlightCol={2}
          rows={comparisonRows(app, RIPPLE).map((r) => [r.label, r.them, r.ripple])}
          note={
            <>
              Checked October 21, 2026. Prices change. Sources:{" "}
              <a className={LINK} href={app.pricing.sourceUrl} target="_blank" rel="noopener noreferrer">
                {app.name}
              </a>
              , <a className={LINK} href="/#pricing">Ripple</a>. &ldquo;Not stated&rdquo; means we could not find it on {app.name}&rsquo;s own pages.
            </>
          }
        />
      </Section>

      <Section id="where-they-win" eyebrow={`Where ${app.name} wins`} title={c.theyWinTitle}>
        <div className="grid grid-cols-1 gap-4 min-[800px]:grid-cols-2">
          {c.theyWin.map((w) => (
            <Card key={w.title} title={w.title} tone="white">
              <p className="m-0 text-[16px] leading-[1.65] text-[#4A443E]">{w.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="where-ripple-wins" eyebrow="Where Ripple wins" title={c.rippleWinsTitle} tone="peach">
        <div className="grid grid-cols-1 gap-4 min-[800px]:grid-cols-2">
          {c.rippleWins.map((w, i) => (
            <Card key={w.title} title={w.title} tone={i === 0 ? "ink" : "white"}>
              <p className={i === 0 ? "m-0 text-[16px] leading-[1.65] text-[#CFC7BE]" : "m-0 text-[16px] leading-[1.65] text-[#4A443E]"}>{w.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="who-should-pick" eyebrow="Who should pick which" title="The short version">
        <div className="grid grid-cols-1 gap-4 min-[800px]:grid-cols-2">
          <Card title={`Pick ${app.name} if`} tone="lilac">
            <BulletList items={c.pickThem} />
          </Card>
          <Card title="Pick Ripple if" tone="mint">
            <BulletList items={c.pickRipple} dark />
          </Card>
        </div>
      </Section>

      <Section id="switching" eyebrow="Switching" title={`Switching from ${app.name} to Ripple`} tone="white" narrow>
        <div className="flex flex-col gap-4">
          {c.switching.map((p, i) => (
            <p key={i} className="m-0 text-[17px] leading-[1.7] text-[#4A443E]">
              {p}
            </p>
          ))}
          {c.alternativesSlug && (
            <p className="m-0 text-[17px] leading-[1.7] text-[#4A443E]">
              Looking at more than two options? See{" "}
              <a className={LINK} href={`/alternatives/${c.alternativesSlug}`}>
                the best {app.name} alternatives
              </a>{" "}
              or our full list of{" "}
              <a className={LINK} href="/best-ai-journaling-apps">
                the best AI journaling apps
              </a>
              .
            </p>
          )}
          {!c.alternativesSlug && (
            <p className="m-0 text-[17px] leading-[1.7] text-[#4A443E]">
              Looking at more than two options? See our full list of{" "}
              <a className={LINK} href="/best-ai-journaling-apps">
                the best AI journaling apps
              </a>
              .
            </p>
          )}
        </div>
      </Section>

      <FaqList faqs={c.faqs} title={`Ripple vs ${app.name}: questions people ask`} />

      <Section eyebrow="More comparisons" title="Other apps people compare with Ripple">
        <LinkCards
          items={others.map((s) => {
            const o = COMPARE_COPY[s];
            return { href: `/compare/${s}`, title: `Ripple vs ${APPS[o.competitor].name}`, blurb: o.hubLine };
          })}
        />
      </Section>

      <FinalCta title={c.cta.title} body={c.cta.body} />
    </main>
  );
}
