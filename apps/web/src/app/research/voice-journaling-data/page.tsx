import Link from "next/link";
import type { Metadata } from "next";

/**
 * Linkable data asset (Phase 3, 2026-09). All numbers computed 2026-09-23
 * from anonymized aggregates of production data — see scripts used in the
 * session log. Themes reported only when mentioned by 5+ distinct people
 * (k-anonymity). No transcripts were read; stats come from structured
 * fields only. Update the numbers by re-running the aggregate queries,
 * never by hand-editing.
 */

const STATS = {
  entries: 1117,
  people: 79,
  tasks: 1746,
  tasksShare: 65, // % of entries with >= 1 extracted task
  tasksAvg: 1.6,
  moodPositive: 56,
  moodNeutral: 26,
  moodLow: 18,
  moodN: 1060,
  computedOn: "September 23, 2026",
};

const MOOD_BY_DAY = [
  { day: "Monday", score: 3.45 },
  { day: "Tuesday", score: 3.37 },
  { day: "Wednesday", score: 3.36 },
  { day: "Thursday", score: 3.38 },
  { day: "Friday", score: 3.5 },
  { day: "Saturday", score: 3.6 },
  { day: "Sunday", score: 3.53 },
];

const THEMES = [
  { theme: "Morning routines", note: "The single most revisited topic. People narrate how their day started far more than how it ended." },
  { theme: "Self-awareness", note: "Mentioned by more distinct people than any other theme." },
  { theme: "Rest and recovery", note: "Not workouts, not productivity: recovering from the week." },
  { theme: "Family connection and quality time", note: "Split across several closely related themes; combined, family is the largest cluster." },
  { theme: "Grief and loss", note: "Present across more people than financial topics." },
  { theme: "Financial stress", note: "Appears as both stress and pressure, across two distinct theme labels." },
  { theme: "Physical exhaustion and fatigue", note: "The body shows up in the data even when nobody is asked about it." },
];

const description =
  "Aggregate data from 1,117 voice journal entries: when people actually record, the midweek mood dip, how often talking surfaces a to-do, and what people really reflect on.";

export const metadata: Metadata = {
  title: "What 1,117 Voice Journal Entries Reveal About How People Reflect",
  description,
  alternates: { canonical: "https://goripple.io/research/voice-journaling-data" },
  openGraph: {
    title: "What 1,117 Voice Journal Entries Reveal About How People Reflect",
    description,
    url: "https://goripple.io/research/voice-journaling-data",
    type: "article",
    siteName: "Ripple",
    images: [{ url: "/og-image.png?v=3", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Voice journaling, quantified: data from 1,117 real entries",
    description,
    images: ["/og-image.png?v=3"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      headline:
        "What 1,117 Voice Journal Entries Reveal About How People Reflect",
      description,
      datePublished: "2026-09-23",
      dateModified: "2026-09-23",
      author: { "@type": "Organization", name: "Ripple", url: "https://goripple.io" },
      publisher: {
        "@type": "Organization",
        name: "Ripple",
        url: "https://goripple.io",
        logo: { "@type": "ImageObject", url: "https://goripple.io/icon-512.png" },
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": "https://goripple.io/research/voice-journaling-data",
      },
      keywords:
        "voice journaling statistics, journaling data, journaling habits research, mood tracking data",
    },
    {
      "@type": "Dataset",
      name: "Ripple Voice Journaling Dataset (aggregate statistics, 2026)",
      description:
        "Anonymized aggregate statistics from 1,117 voice journal entries recorded by 79 people on Ripple: recording times, mood distribution by day of week, task extraction rates, and recurring reflection themes.",
      url: "https://goripple.io/research/voice-journaling-data",
      creator: { "@type": "Organization", name: "Ripple", url: "https://goripple.io" },
      temporalCoverage: "2026",
      license: "https://creativecommons.org/licenses/by/4.0/",
    },
  ],
};

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-acuity-card-border bg-acuity-card-bg p-6 text-center">
      <div className="text-3xl font-extrabold tracking-tight text-acuity-text">{value}</div>
      <div className="mt-1 text-sm text-acuity-text-sec">{label}</div>
    </div>
  );
}

export default function VoiceJournalingDataPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="pt-32 pb-24 px-6">
        <div className="mx-auto max-w-3xl">
          <nav aria-label="Breadcrumb" className="mb-8 text-sm text-acuity-text-sec">
            <Link href="/" className="hover:text-acuity-text transition-colors">
              Home
            </Link>
            <span className="mx-2">/</span>
            <span className="text-acuity-text">Research</span>
          </nav>

          <p className="text-sm font-semibold uppercase tracking-wide text-acuity-primary mb-3">
            Ripple Research
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl leading-[1.1] mb-6">
            What 1,117 voice journal entries reveal about how people actually reflect
          </h1>
          <p className="text-lg text-acuity-text leading-relaxed mb-4">
            Most writing about journaling is advice. This page is data. We looked at
            aggregate, anonymized statistics from the first {STATS.entries.toLocaleString()} voice
            journal entries recorded by {STATS.people} people on Ripple: when they record, what
            mood they arrive in, what they talk about, and what their spoken words turn into.
            Some of it contradicts the standard advice.
          </p>
          <p className="text-sm text-acuity-text-sec mb-12">
            Published {STATS.computedOn} &middot; free to cite with a link (CC BY 4.0)
          </p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-12">
            <StatCard value={STATS.entries.toLocaleString()} label="entries analyzed" />
            <StatCard value={String(STATS.people)} label="people" />
            <StatCard value="24/24" label="hours of the day with entries" />
            <StatCard value={`${STATS.tasksShare}%`} label="of entries contain a to-do" />
          </div>

          <div className="h-px bg-acuity-line mb-12" />

          <h2 className="text-2xl font-bold tracking-tight mt-12 mb-4 text-acuity-text">
            Finding 1: journaling is not a bedtime habit
          </h2>
          <p className="text-base text-acuity-text leading-[1.8] mb-5">
            Almost every journaling guide prescribes a fixed evening ritual. The data
            disagrees: entries in our dataset were recorded during{" "}
            <strong className="text-acuity-text">every single hour of the day</strong>, with
            meaningful volume in the morning, at midday, and late at night. People reflect when
            life gives them an opening: in a parked car, between meetings, after drop-off, not
            when a routine tells them to.
          </p>
          <p className="text-base text-acuity-text leading-[1.8] mb-5">
            If a fixed journaling time never worked for you, this is why. The habit that
            survives is the one that fits into the gaps you actually have.
          </p>

          <h2 className="text-2xl font-bold tracking-tight mt-12 mb-4 text-acuity-text">
            Finding 2: the midweek dip is real
          </h2>
          <p className="text-base text-acuity-text leading-[1.8] mb-5">
            Ripple scores the mood of each entry on a five-point scale. Averaged across{" "}
            {STATS.moodN.toLocaleString()} mood-scored entries, the week has a clear shape:
            mood bottoms out on Tuesday and Wednesday, starts recovering on Friday, and peaks
            on Saturday.
          </p>
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-acuity-line text-left">
                  <th className="py-2 pr-4 font-semibold text-acuity-text">Day</th>
                  <th className="py-2 pr-4 font-semibold text-acuity-text text-right">
                    Average mood (1&ndash;5)
                  </th>
                  <th className="py-2 font-semibold text-acuity-text">Pattern</th>
                </tr>
              </thead>
              <tbody>
                {MOOD_BY_DAY.map((d) => (
                  <tr key={d.day} className="border-b border-acuity-line">
                    <td className="py-2 pr-4 text-acuity-text">{d.day}</td>
                    <td className="py-2 pr-4 text-right text-acuity-text">
                      {d.score.toFixed(2)}
                    </td>
                    <td className="py-2 text-acuity-text-sec">
                      {d.day === "Wednesday"
                        ? "Lowest of the week"
                        : d.day === "Saturday"
                          ? "Highest of the week"
                          : d.day === "Friday"
                            ? "Recovery begins"
                            : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-base text-acuity-text leading-[1.8] mb-5">
            The gap between the Wednesday low and the Saturday high is about a quarter of a
            point, week after week. Individually, nobody notices a 0.24-point mood drift.
            Across a thousand entries, it is one of the most stable patterns in the dataset.
          </p>

          <h2 className="text-2xl font-bold tracking-tight mt-12 mb-4 text-acuity-text">
            Finding 3: people do not just journal when things are bad
          </h2>
          <p className="text-base text-acuity-text leading-[1.8] mb-5">
            A common assumption is that journaling is venting: something you do when you are
            upset. The mood distribution says otherwise. Of all mood-scored entries,{" "}
            <strong className="text-acuity-text">{STATS.moodPositive}% were recorded in a positive mood</strong>,{" "}
            {STATS.moodNeutral}% neutral, and only {STATS.moodLow}% in a low or rough one.
          </p>
          <p className="text-base text-acuity-text leading-[1.8] mb-5">
            People narrate ordinary days. They record wins. The reflection habit that lasts is
            closer to a daily debrief than an emergency valve.
          </p>

          <h2 className="text-2xl font-bold tracking-tight mt-12 mb-4 text-acuity-text">
            Finding 4: talking out loud produces a to-do list
          </h2>
          <p className="text-base text-acuity-text leading-[1.8] mb-5">
            When people speak freely about their day, action items fall out of their mouths
            whether they intend it or not. <strong className="text-acuity-text">{STATS.tasksShare}% of
            entries contained at least one extractable task</strong>, averaging {STATS.tasksAvg} per
            entry: {STATS.tasks.toLocaleString()} to-dos surfaced across the dataset, none of
            which the speaker had to write down.
          </p>
          <p className="text-base text-acuity-text leading-[1.8] mb-5">
            This is the quiet argument for reflecting out loud rather than on paper: spoken
            reflection doubles as capture. The things you say you will do stop depending on
            your memory.
          </p>

          <h2 className="text-2xl font-bold tracking-tight mt-12 mb-4 text-acuity-text">
            Finding 5: what people actually reflect on
          </h2>
          <p className="text-base text-acuity-text leading-[1.8] mb-5">
            Ripple detects recurring themes across entries. To protect privacy we only report
            themes raised independently by at least five different people. The list reads like
            a portrait of the mental load:
          </p>
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-acuity-line text-left">
                  <th className="py-2 pr-4 font-semibold text-acuity-text">Recurring theme</th>
                  <th className="py-2 font-semibold text-acuity-text">What the data shows</th>
                </tr>
              </thead>
              <tbody>
                {THEMES.map((t) => (
                  <tr key={t.theme} className="border-b border-acuity-line">
                    <td className="py-2 pr-4 text-acuity-text font-medium">{t.theme}</td>
                    <td className="py-2 text-acuity-text-sec">{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-base text-acuity-text leading-[1.8] mb-5">
            Notably absent: productivity systems, optimization, goal frameworks. When people
            talk to themselves honestly, they talk about mornings, family, money, rest, and
            being tired.
          </p>

          <h2 className="text-2xl font-bold tracking-tight mt-12 mb-4 text-acuity-text">
            Methodology
          </h2>
          <ul className="list-disc pl-6 text-base text-acuity-text leading-[1.8] mb-5 space-y-2">
            <li>
              All statistics were computed on {STATS.computedOn} from {STATS.entries.toLocaleString()}{" "}
              voice journal entries recorded by {STATS.people} people on Ripple.
            </li>
            <li>
              Every number on this page is an aggregate. No transcripts were read by a human
              for this analysis; statistics come from structured fields (timestamps, mood
              scores, task counts, theme labels) only.
            </li>
            <li>
              Mood is scored per entry on a five-point scale (rough to great). {STATS.moodN.toLocaleString()}{" "}
              of {STATS.entries.toLocaleString()} entries had a mood score.
            </li>
            <li>
              Themes are AI-detected labels. A theme is reported only if at least five distinct
              people raised it independently.
            </li>
            <li>
              This is an observational snapshot of one app&apos;s early user base, not a
              controlled study. Treat it as directional.
            </li>
          </ul>

          <h2 className="text-2xl font-bold tracking-tight mt-12 mb-4 text-acuity-text">
            Citing this data
          </h2>
          <p className="text-base text-acuity-text leading-[1.8] mb-5">
            You are welcome to cite any statistic on this page (CC BY 4.0). Please credit
            &ldquo;Ripple voice journaling data, 2026&rdquo; and link to{" "}
            <span className="text-acuity-text font-medium">
              goripple.io/research/voice-journaling-data
            </span>
            . For questions about the data or custom cuts for a story, contact{" "}
            <a href="mailto:keenan@heelerdigital.com" className="text-acuity-primary hover:underline">
              keenan@heelerdigital.com
            </a>
            .
          </p>

          <div className="h-px bg-acuity-line my-12" />

          <p className="text-base text-acuity-text leading-[1.8] mb-5">
            The data on this page comes from Ripple, a voice journaling app. You talk through
            your day, any time of day; Ripple pulls out the tasks, tracks the goals you
            mention, scores mood, and surfaces your patterns in a weekly report. There is a{" "}
            <Link href="/start" className="text-acuity-primary hover:underline">
              7-day free trial
            </Link>
            , no card required.
          </p>
        </div>
      </article>
    </>
  );
}
