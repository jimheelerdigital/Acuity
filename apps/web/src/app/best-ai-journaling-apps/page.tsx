import { COMPARE_COPY } from "@/components/marketing/compare/copy";
import {
  BODY,
  BulletList,
  Card,
  DataTable,
  FaqList,
  FinalCta,
  H3,
  JsonLd,
  LINK,
  LinkCards,
  PageHero,
  ProsCons,
  SITE_URL,
  Section,
  breadcrumbLd,
  faqLd,
  pageMetadata,
} from "@/components/marketing/compare/ui";
import { APPS, COMPARE_SLUG_FOR, RIPPLE, priceSummary, triShort, type AppKey } from "@/lib/compare-data";

export const revalidate = 86400;

const PATH = "/best-ai-journaling-apps";
const TITLE = "Best AI Journaling Apps 2026: 11 Compared | Ripple";
const DESCRIPTION =
  "The best AI journaling apps of 2026, compared honestly: Rosebud, Day One, Ripple, Mindsera, Reflection and more, with real prices, features and who each suits.";

export const metadata = pageMetadata({ path: PATH, title: TITLE, description: DESCRIPTION });

const CRUMBS = [
  { name: "Home", href: "/" },
  { name: "Best AI journaling apps", href: PATH },
];

type Entry = { app: AppKey; label: string; paragraphs: string[] };

/**
 * The ranked list. Order reflects how well each app works as an AI journal
 * for most people, not how much we like it. Ripple is deliberately not
 * "best overall": it's best for one job.
 */
const RANKED: Entry[] = [
  {
    app: "rosebud",
    label: "Best AI that talks back and remembers",
    paragraphs: [
      "Rosebud is one of the best-known AI journals. You write or talk, and it asks follow-up questions, offers guided prompts (including IFS-based ones), spots patterns and writes weekly reports. Its long-term memory carries what you said across entries, so it can bring up something from last month.",
      "The catch is price. Rosebud's help center says the free plan was retired on September 30, 2026; the Bloom plan is $12.99 a month or $107.99 a year. Its homepage still says “free to use”, so check the app. On privacy, Rosebud states entries are encrypted in transit and at rest and never used to train AI.",
    ],
  },
  {
    app: "dayone",
    label: "Best journal to keep for life",
    paragraphs: [
      "Day One is the most established journal on this list: photos, video, audio and drawings in entries, apps on iPhone, iPad, Apple Watch, Android, Mac, Windows and web, and end-to-end encryption even on the free Basic plan.",
      "Its AI features (Daily Chat, summaries and deeper prompts) sit on the Gold plan at $74.99 a year; Silver is $49.99 a year. Day One is brilliant at keeping a record. It isn't built to turn entries into tasks or track habits beyond journaling streaks.",
    ],
  },
  {
    app: "ripple",
    label: "Best for turning what you say into tasks and habits",
    paragraphs: [
      "Ripple is our app, so judge this entry with that in mind. It's an AI life optimizer: a habit tracker, voice journal and insight tool. You talk or type whenever something's on your mind, and it turns what you said into a to-do list with the dates you mentioned, checks off habits you mention and notices the ones you skip, tracks mood over time, surfaces patterns, scores your life areas in the Life Matrix and sends a weekly report every Sunday.",
      `It's on iOS, Android and the web, and costs ${RIPPLE.pricing.monthly} a month or ${RIPPLE.pricing.yearly} a year after a 7-day free trial. Honest limits: it's newer and smaller than the big names, there's no free tier, no chat companion, no photo journaling and one plan only. It doesn't make encryption claims.`,
    ],
  },
  {
    app: "mindsera",
    label: "Best for structured thinking",
    paragraphs: [
      "Mindsera calls itself an “AI-powered journal copilot for thinking”, and it earns it: 52+ frameworks and templates, emotion analysis, personality insights, chat with your journal, voice and call modes, and scanning of paper pages.",
      "The free Curious plan includes the journal, habit tracker and templates. Genius is $14.99 a month or $129 a year, the highest monthly price here. Mindsera states entries are encrypted and not used to train AI.",
    ],
  },
  {
    app: "reflection",
    label: "Best value AI coach",
    paragraphs: [
      "Reflection describes itself as “a journal that listens, and talks back.” It has an AI coach, “Ask Your Journal”, 100+ guided programs, weekly and monthly reviews, photos and handwriting scans, and apps on iPhone, Android, Mac and web.",
      "The Free Forever plan includes unlimited entries. Premium is $8 a month or $5.75 a month billed annually, with a 7-day trial. It states AES-256 encryption at rest and no AI training on entries. We didn't find tasks or habit tracking on its pages.",
    ],
  },
  {
    app: "dayora",
    label: "Best free AI journal, if the terms suit you",
    paragraphs: [
      "Dayora gives a lot away free: unlimited entries, a reply to every one, voice with transcription, mood tracking, editable AI memory and relationship insights. Plus is $9 a month or $72 a year.",
      "It's unusually upfront that it may use your entries to train and improve the AI models behind it, which is how it keeps the core free. We found it described as a browser app and didn't find a native app store listing.",
    ],
  },
  {
    app: "stoic",
    label: "Best for structured daily routines",
    paragraphs: [
      "Stoic mixes guided morning and evening journaling with mood trends, habits, a planner, meditation and breathing. It's on iPhone, iPad, Mac, Android and web, accepts voice notes, photos and video, and says journals are stored on your devices.",
      "Pricing is spread across tiers: the App Store lists Premium, an AI tier and a $299 lifetime option. It has a to-do list, but you fill it in yourself.",
    ],
  },
  {
    app: "applejournal",
    label: "Best free option on iPhone",
    paragraphs: [
      "Apple Journal is built into iPhone (iOS 17.2 and later). It suggests moments from your photos, places, music and workouts, accepts photos, video, audio and locations, and Apple says entries are end-to-end encrypted in iCloud.",
      "It's light on AI by design: suggestions and prompts, no summaries we could confirm, no to-dos and no Android or web version.",
    ],
  },
  {
    app: "daylio",
    label: "Best for logging mood without writing",
    paragraphs: [
      "Daylio isn't an AI journal, but many people searching for one end up here. You log mood and activities in a couple of taps, set goals and get charts. It says it doesn't send your data to its servers.",
      "It's free with a Premium upgrade and phone only. If you want something to read your words, it won't.",
    ],
  },
  {
    app: "finch",
    label: "Best gentle, game-like self-care",
    paragraphs: [
      "Finch turns small self-care goals into caring for a virtual pet, with journaling prompts, mood check-ins and habits. It's free with an optional Finch Plus and has one of the highest review counts of any app in the category.",
      "We didn't find AI features stated on its own pages, and it isn't built for tasks.",
    ],
  },
  {
    app: "reflectly",
    label: "Best for guided first steps",
    paragraphs: [
      "Reflectly asks friendly, AI-guided questions and tracks mood, with daily, weekly and monthly overviews. It's typing-first and free to download with Premium.",
      "It's still available and updated on the App Store. It's a gentle starting point if a blank page puts you off, though we found no voice, task or habit features on its pages.",
    ],
  },
];

const FAQS = [
  {
    q: "What is the best AI journaling app in 2026?",
    a: "It depends on the job. Rosebud is a leading AI journal that talks back and remembers. Day One is best for a lifelong record. Reflection is the best value AI coach with a free plan. Ripple is best for turning what you say into tasks and habits. Mindsera is best for structured thinking.",
  },
  {
    q: "Which AI journaling apps are free?",
    a: "Mindsera, Reflection, Day One and Dayora have free plans, and Apple Journal is built into iPhone. Daylio, Finch, Stoic and Reflectly are free to download with paid upgrades. Rosebud's help center says its free plan ended on September 30, 2026. Ripple has a 7-day free trial and no free tier.",
  },
  {
    q: "Which AI journal app turns entries into to-dos?",
    a: "Ripple is built around it: it pulls tasks and the dates you mentioned out of what you said. Rosebud says action items can be added to checklists. We didn't find task extraction stated on the other apps' own pages.",
  },
  {
    q: "Which AI journal is best for voice journaling?",
    a: "Rosebud, Ripple, Mindsera, Reflection, Day One and Dayora all accept voice. Ripple is designed around talking: you talk and it turns that into tasks, habits, mood and patterns. See our voice journaling guide for how it works.",
  },
  {
    q: "Do AI journaling apps use my entries to train AI?",
    a: "It varies, so read each app's terms. Rosebud, Mindsera and Reflection state entries aren't used to train AI. Dayora states it may use entries for training. Ripple doesn't make claims it hasn't verified.",
  },
  {
    q: "Can an AI journal replace therapy?",
    a: "No. Journaling apps can help you get thoughts out of your head and notice patterns, but none of the apps here should be treated as a replacement for a therapist. Ripple doesn't claim to treat, diagnose or replace therapy.",
  },
  {
    q: "How much do AI journaling apps cost?",
    a: `Paid plans we checked range from $8 a month (Reflection) to $14.99 a month (Mindsera). Rosebud is $12.99, Dayora Plus $9 and Ripple ${RIPPLE.pricing.monthly}. Yearly plans run from $49.99 (Day One Silver) to $129 (Mindsera).`,
  },
];

function ListEntry({ e, n }: { e: Entry; n: number }) {
  const a = APPS[e.app];
  const cmp = COMPARE_SLUG_FOR[e.app];
  const isRipple = e.app === "ripple";
  return (
    <article id={a.key} className="flex scroll-mt-24 flex-col gap-5 rounded-[28px] border border-[#EEE7DE] bg-white p-6 min-[900px]:p-9">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="text-[15px] font-extrabold text-[#B9472A]">{String(n).padStart(2, "0")}</span>
        <h3 className="m-0 font-display text-[26px] font-extrabold tracking-[-0.03em] min-[900px]:text-[32px]">{a.name}</h3>
        <span className={isRipple ? "rounded-full bg-[#6D5EF0] px-3 py-1 text-[13px] font-extrabold text-white" : "rounded-full bg-[#F3EEE8] px-3 py-1 text-[13px] font-extrabold text-[#3F3A35]"}>{e.label}</span>
      </div>
      {e.paragraphs.map((p, i) => (
        <p key={i} className="m-0 text-[17px] leading-[1.7] text-[#4A443E]">
          {p}
        </p>
      ))}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[14.5px] font-semibold text-[#57514B]">
        <span>Price: {priceSummary(a)}</span>
        <span>Free tier: {a.pricing.free}</span>
        <span>Platforms: {a.platforms.join(", ")}</span>
        {a.rating && <span>{a.rating}</span>}
      </div>
      <ProsCons pros={a.strengths} cons={a.drawbacks} />
      {cmp && (
        <a href={`/compare/${cmp}`} className={`self-start text-[15.5px] ${LINK}`}>
          Ripple vs {a.name}: full comparison
        </a>
      )}
      {isRipple && (
        <a href="/ai-journal-app" className={`self-start text-[15.5px] ${LINK}`}>
          How Ripple works as an AI journal app
        </a>
      )}
    </article>
  );
}

export default function BestAiJournalingApps() {
  const all = RANKED.map((e) => APPS[e.app]);
  return (
    <main>
      <JsonLd
        graph={[
          {
            "@type": "Article",
            "@id": `${SITE_URL}${PATH}#article`,
            headline: "The best AI journaling apps in 2026, compared honestly",
            description: DESCRIPTION,
            url: `${SITE_URL}${PATH}`,
            datePublished: "2026-10-21",
            dateModified: "2026-10-21",
            author: { "@type": "Organization", name: "Ripple", url: SITE_URL },
            publisher: { "@type": "Organization", name: "Ripple", url: SITE_URL },
            image: `${SITE_URL}/og-image.png?v=4`,
          },
          breadcrumbLd(CRUMBS),
          {
            "@type": "ItemList",
            name: "Best AI journaling apps in 2026",
            itemListOrder: "https://schema.org/ItemListOrderAscending",
            numberOfItems: RANKED.length,
            itemListElement: RANKED.map((e, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: APPS[e.app].name,
              url: `${SITE_URL}${PATH}#${APPS[e.app].key}`,
            })),
          },
          faqLd(FAQS),
        ]}
      />

      <PageHero
        crumbs={CRUMBS}
        eyebrow="Best AI journaling apps 2026"
        h1="The best AI journaling apps in 2026,"
        h1Accent="compared honestly."
        lede={[
          "The best AI journaling app for most people who want an AI to talk back is Rosebud; for a lifelong record it's Day One; for the best free plan it's Reflection; and for turning what you say into tasks and habits it's Ripple. Below are 11 apps with real prices, features and who each one suits.",
          "Every price and feature was checked on each company's own site or app store listing on October 21, 2026.",
        ]}
        disclosure={
          <>
            We make Ripple, and it&rsquo;s on this list. Here&rsquo;s how we compared: we only used facts from each app&rsquo;s own website, pricing page or app store listing, linked below; we wrote &ldquo;not stated&rdquo; where we couldn&rsquo;t confirm something; and we didn&rsquo;t put Ripple first. It&rsquo;s best for one job, and we say what it lacks.
          </>
        }
      />

      <Section id="quick-picks" eyebrow="Quick picks" title="The short answer" intro="If you only read one table, read this one." tone="white">
        <DataTable
          caption="Quick picks: best AI journaling apps by use"
          headers={["App", "Best for", "Price", "Free tier"]}
          rows={RANKED.map((e) => [
            <a key={e.app} href={`#${APPS[e.app].key}`} className="text-[#1B1815] underline-offset-4 hover:underline">
              {APPS[e.app].name}
            </a>,
            e.label,
            priceSummary(APPS[e.app]),
            APPS[e.app].pricing.free,
          ])}
        />
      </Section>

      <Section id="how-we-compared" eyebrow="Method" title="How we compared" narrow>
        <p className={BODY}>
          We looked at what someone carrying a lot actually needs from a journal app, then checked each app against the same list. Every fact comes from the company&rsquo;s own homepage, pricing page or App Store listing on October 21, 2026. Where a page didn&rsquo;t say, we wrote &ldquo;not stated&rdquo; rather than guess, which can make a newer or less-documented app look thinner than it is.
        </p>
        <BulletList
          items={[
            <>
              <strong>Getting it in:</strong> typing, voice, photos. Talking is easier for many people than writing, which is why we track it (more in our{" "}
              <a className={LINK} href="/voice-journaling">
                voice journaling guide
              </a>
              ).
            </>,
            <>
              <strong>What the AI does:</strong> chat that talks back, summaries, prompts, mood and patterns.
            </>,
            <>
              <strong>Follow-through:</strong> does it turn entries into to-dos, and does it track habits? See our{" "}
              <a className={LINK} href="/habit-tracker-app">
                habit tracker app
              </a>{" "}
              page for why we care about this.
            </>,
            <>
              <strong>Cost:</strong> free tier, monthly and yearly price.
            </>,
            <>
              <strong>Privacy:</strong> what each company says, in its own words. We can&rsquo;t audit anyone&rsquo;s claims, including our own.
            </>,
          ]}
        />
        <p className={BODY}>
          The order is our judgement of how well each app works as an AI journal for most people, not a score. We didn&rsquo;t test private features behind paywalls we couldn&rsquo;t see.
        </p>
      </Section>

      <Section id="the-list" eyebrow="The list" title="11 AI journaling apps, ranked" intro="Each entry covers what it does, what it costs and where it falls short.">
        <div className="flex flex-col gap-5">
          {RANKED.map((e, i) => (
            <ListEntry key={e.app} e={e} n={i + 1} />
          ))}
        </div>
      </Section>

      <Section
        id="pricing"
        eyebrow="Pricing"
        title="What each AI journal costs"
        intro={<p className={BODY}>Checked October 2026; prices change and can vary by country and store. Follow the source link for the current price.</p>}
        tone="white"
      >
        <DataTable
          caption="AI journaling app prices"
          headers={["App", "Free tier", "Monthly", "Yearly", "Notes", "Source"]}
          rows={all.map((a) => [
            a.name,
            a.pricing.free,
            a.pricing.monthly ?? "Not labelled",
            a.pricing.yearly ?? "Not labelled",
            a.pricing.notes ?? "",
            <a key={a.key} className={LINK} href={a.pricing.sourceUrl} target="_blank" rel="noopener noreferrer">
              {a.key === "ripple" ? "goripple.io" : new URL(a.pricing.sourceUrl).hostname.replace(/^www\./, "")}
            </a>,
          ])}
          note="“Not labelled” means the price page or app store listing didn't say which purchase is monthly and which is yearly."
        />
      </Section>

      <Section id="features" eyebrow="Features" title="Features side by side" intro="“Partly” means the feature exists in a limited form or on a higher plan; “Not stated” means we couldn't find it on the app's own pages.">
        <DataTable
          caption="AI journaling app features"
          headers={["App", "Voice input", "To-dos from entries", "Habit tracking", "Mood", "Patterns", "AI chat", "Free tier", "Platforms"]}
          highlightCol={undefined}
          rows={all.map((a) => [
            a.name,
            triShort(a.input.voice),
            triShort(a.taskExtraction),
            triShort(a.habitTracking),
            triShort(a.ai.mood),
            triShort(a.ai.patterns),
            triShort(a.ai.companionChat),
            a.pricing.free,
            a.platforms.join(", "),
          ])}
        />
      </Section>

      <Section id="which" eyebrow="Choosing" title="Which one should you pick?" tone="peach">
        <div className="grid grid-cols-1 gap-4 min-[800px]:grid-cols-2">
          <Card title="You want an AI to talk to">
            <p className="m-0 text-[16px] leading-[1.65] text-[#4A443E]">
              Rosebud if memory matters and the price works. Reflection if you want a free plan or a lower price. Dayora if free matters most and you&rsquo;re fine with its training terms.
            </p>
          </Card>
          <Card title="You want a record for life">
            <p className="m-0 text-[16px] leading-[1.65] text-[#4A443E]">Day One, or Apple Journal if you only use an iPhone and want free and built in.</p>
          </Card>
          <Card title="Your head is full of to-dos" tone="ink">
            <p className="m-0 text-[16px] leading-[1.65] text-[#CFC7BE]">
              Ripple. Talk it out and it builds your list with dates, checks off habits and writes a weekly report. That&rsquo;s the one job we built it for.
            </p>
          </Card>
          <Card title="You want structure">
            <p className="m-0 text-[16px] leading-[1.65] text-[#4A443E]">Mindsera for thinking frameworks, Stoic for daily routines with habits and meditation.</p>
          </Card>
          <Card title="You don't want to write at all">
            <p className="m-0 text-[16px] leading-[1.65] text-[#4A443E]">Daylio for two-tap mood logging, or a voice-first app like Ripple if you&rsquo;d rather talk.</p>
          </Card>
          <Card title="You want gentle and playful">
            <p className="m-0 text-[16px] leading-[1.65] text-[#4A443E]">Finch, or Reflectly for friendly guided questions.</p>
          </Card>
        </div>
      </Section>

      <Section id="limits" eyebrow="Worth knowing" title="What an AI journal can and can't do" narrow>
        <p className={BODY}>
          A good AI journal takes something you&rsquo;d otherwise carry in your head and does a bit of the work with it: asks a question back, writes a summary, notices that a topic keeps coming up, or, in Ripple&rsquo;s case, turns it into a list and a habit log. That&rsquo;s useful. It&rsquo;s also limited.
        </p>
        <p className={BODY}>
          None of these apps is a therapist, and none should be treated as one. If you&rsquo;re struggling, talk to someone qualified. Privacy is the other thing to read carefully: some apps state end-to-end encryption, some state they won&rsquo;t train AI on your entries, one states it may. Pick the terms you&rsquo;re comfortable with before you pour your life into an app.
        </p>
        <p className={BODY}>
          Finally, the best journal is the one you keep using. If typing has always been the wall, a voice-first app is worth trying; if you love writing, a classic journal may serve you better than any AI. Read more in our{" "}
          <a className={LINK} href="/ai-journal-app">
            AI journal app
          </a>{" "}
          overview.
        </p>
        <div className="flex flex-col gap-3 rounded-[24px] border border-[#EEE7DE] bg-white p-6">
          <h3 className={H3}>Related reading</h3>
          <BulletList
            items={[
              <a key="vj" className={LINK} href="/voice-journaling">
                Voice journaling: how journaling by talking works
              </a>,
              <a key="ht" className={LINK} href="/habit-tracker-app">
                A habit tracker you don&rsquo;t have to update
              </a>,
              <a key="aj" className={LINK} href="/ai-journal-app">
                Ripple as an AI journal app
              </a>,
              <a key="cmp" className={LINK} href="/compare">
                All Ripple comparisons
              </a>,
            ]}
          />
        </div>
      </Section>

      <Section eyebrow="Head to head" title="Ripple compared, one app at a time" tone="white">
        <LinkCards
          items={RANKED.filter((e) => COMPARE_SLUG_FOR[e.app]).map((e) => {
            const slug = COMPARE_SLUG_FOR[e.app]!;
            return { href: `/compare/${slug}`, title: `Ripple vs ${APPS[e.app].name}`, blurb: COMPARE_COPY[slug].hubLine };
          })}
        />
      </Section>

      <FaqList faqs={FAQS} title="Best AI journaling apps: questions people ask" />
      <FinalCta title="If your journal should do the follow-up, try Ripple." body="Talk or type whenever. Get back your to-dos, habits, mood, patterns and a weekly report. 7 days free." />
    </main>
  );
}
