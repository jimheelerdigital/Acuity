import { COMPARE_COPY } from "@/components/marketing/compare/copy";
import {
  BODY,
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
import { APPS, COMPARE_SLUGS, RIPPLE, priceSummary } from "@/lib/compare-data";

export const revalidate = 86400;

const TITLE = "Compare Ripple With Other Journal Apps | Ripple";
const DESCRIPTION =
  "Honest side-by-side comparisons of Ripple with Rosebud, Day One, Mindsera, Daylio, Finch and more: prices, features, and who each app suits best in 2026.";

export const metadata = pageMetadata({ path: "/compare", title: TITLE, description: DESCRIPTION });

const CRUMBS = [
  { name: "Home", href: "/" },
  { name: "Compare", href: "/compare" },
];

const FAQS = [
  {
    q: "Are these comparisons written by Ripple?",
    a: "Yes. We make Ripple, so we have a stake in the outcome. To keep the pages useful, every competitor fact comes from that company's own website, pricing page or app store listing as checked on October 21, 2026, and each page has a section on where the other app is the better choice.",
  },
  {
    q: "Which app should I compare Ripple with first?",
    a: "Compare it with whatever you use now. If you write long entries, Day One is the closest habit to yours. If you want an AI to talk back, look at Rosebud or Mindsera. If you track mood with taps, look at Daylio.",
  },
  {
    q: "How is Ripple different from most journaling apps?",
    a: "Most journaling apps stop at the entry. Ripple reads what you said or typed and turns it into a to-do list with the dates you mentioned, checks off habits you mention, tracks mood over time, points out patterns, scores your life areas in the Life Matrix and sends a weekly report every Sunday.",
  },
  {
    q: "Does Ripple have a free plan?",
    a: `No. Ripple has one plan, ${RIPPLE.pricing.monthly} a month or ${RIPPLE.pricing.yearly} a year, with a 7-day free trial. Several of the apps compared here have free tiers, and we say so on each page.`,
  },
  {
    q: "How often are these pages updated?",
    a: "We re-check prices and features when a competitor changes them and at least every few months. The date at the top of each page shows the last check.",
  },
];

export default function CompareHub() {
  return (
    <main>
      <JsonLd
        graph={[
          { "@type": "CollectionPage", "@id": `${SITE_URL}/compare#webpage`, url: `${SITE_URL}/compare`, name: "Compare Ripple with other journal apps", description: DESCRIPTION, dateModified: "2026-10-21" },
          breadcrumbLd(CRUMBS),
          faqLd(FAQS),
        ]}
      />
      <PageHero
        crumbs={CRUMBS}
        eyebrow="Comparisons"
        h1="Compare Ripple with other"
        h1Accent="journal apps."
        lede={[
          "Ripple is an AI life optimizer: a habit tracker, voice journal and insight tool. You talk or type whenever, and it turns what you said into tasks, habit check-offs, a mood line, patterns and a weekly report. That makes it a different kind of app from a classic diary or an AI chat journal.",
          "Each page below puts Ripple next to one app, with a plain verdict, a feature table and a section on where the other app wins.",
        ]}
        disclosure="We make Ripple. Here's how we compared: every competitor fact on these pages comes from the company's own website, pricing page or app store listing, checked on October 21, 2026. Where we could not find something, we say “not stated” instead of guessing."
      />

      <Section eyebrow="Ripple vs" title="Pick a comparison" tone="white">
        <LinkCards
          items={COMPARE_SLUGS.map((s) => {
            const c = COMPARE_COPY[s];
            return { href: `/compare/${s}`, title: `Ripple vs ${APPS[c.competitor].name}`, blurb: c.hubLine };
          })}
        />
      </Section>

      <Section
        eyebrow="Prices at a glance"
        title="What each app costs"
        intro={
          <p className={BODY}>
            Checked October 21, 2026. Prices change and can differ by country and app store. For the full ranked list with features, see{" "}
            <a className={LINK} href="/best-ai-journaling-apps">
              the best AI journaling apps
            </a>
            .
          </p>
        }
      >
        <DataTable
          caption="Journal app prices"
          headers={["App", "Free tier", "Paid price", "Source"]}
          highlightCol={undefined}
          rows={[RIPPLE, ...COMPARE_SLUGS.map((s) => APPS[COMPARE_COPY[s].competitor])].map((a) => [
            a.name,
            a.pricing.free,
            priceSummary(a),
            <a key={a.key} className={LINK} href={a.pricing.sourceUrl} target="_blank" rel="noopener noreferrer">
              {a.key === "ripple" ? "goripple.io" : new URL(a.pricing.sourceUrl).hostname.replace(/^www\./, "")}
            </a>,
          ])}
        />
      </Section>

      <FaqList faqs={FAQS} />
      <FinalCta title="Try Ripple next to what you use now." body="Keep your current app and run Ripple alongside it for the free week. You will know quickly which one you open." />
    </main>
  );
}
