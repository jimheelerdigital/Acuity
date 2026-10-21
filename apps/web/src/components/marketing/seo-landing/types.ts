/**
 * Content shape for the SEO landing pages (2026-10-21): /habit-tracker-app,
 * /ai-journal-app, /brain-dump-app, /mental-load, /mood-tracker-app.
 *
 * Each page passes one of these to <SeoLanding>. The same object feeds the
 * visible FAQ and the FAQPage JSON-LD, so structured data always matches
 * what the visitor sees (Google requirement).
 *
 * Copy rules for every string here (docs/acuity-positioning.md): no
 * recording-duration claims, no time-of-day framing, never claim Ripple
 * treats, diagnoses, cures or replaces therapy, no invented stats or
 * testimonials, never "no card required".
 */

export type SeoSlug =
  | "habit-tracker-app"
  | "ai-journal-app"
  | "brain-dump-app"
  | "mental-load"
  | "mood-tracker-app";

/** Card colour, all pairs checked for AA contrast against their text. */
export type Tone = "white" | "ink" | "mint" | "violet" | "peach" | "lilac" | "sage" | "sand";

export type TaskItem = { text: string; tag?: string; done?: boolean; tagKind?: "date" | "count" | "done" };

/** Small static UI illustrations, in the style of the homepage bento. */
export type Visual =
  | { kind: "tasks"; items: TaskItem[] }
  | { kind: "habits"; rows: { name: string; on: number[] }[]; note?: string }
  | { kind: "mood"; points: number[]; labels?: string[]; caption?: string }
  | { kind: "chips"; chips: string[] }
  | { kind: "bars"; rows: { name: string; pct: number; color: string }[] }
  | { kind: "report"; rows: { tag: "MOVED" | "SLIPPED" | "PATTERN" | "NEXT"; text: string }[] }
  | { kind: "quote"; text: string; caption?: string }
  | { kind: "week"; days: { day: string; word: string; level: 1 | 2 | 3 | 4 | 5 }[] }
  | { kind: "sort"; said: string; buckets: { label: string; items: string[] }[] };

export type BenefitCard = {
  title: string;
  body: string;
  tone: Tone;
  visual?: Visual;
  /** Spans two columns on desktop. */
  wide?: boolean;
};

export type CaughtExample = {
  label: string;
  said: string;
  tasks: { text: string; when?: string }[];
  habits?: string[];
  mood: string;
  pattern: string;
};

export type SectionKey = "how" | "benefits" | "example" | "explainer" | "compare" | "reviews" | "pricing" | "faq" | "related";

export type SeoLandingContent = {
  slug: SeoSlug;
  /** Short name for the breadcrumb and the Related block. */
  crumb: string;
  /** Used in WebPage JSON-LD. */
  pageName: string;
  description: string;
  hero: {
    eyebrow: string;
    /** Must contain the target query. Rendered as the page's only H1. */
    h1: string;
    /** The coral-coloured tail of the H1 (optional, appended after h1). */
    h1Accent?: string;
    /** First paragraph answers the query in its first two sentences. */
    intro: string[];
    chips: string[];
    card: {
      label: string;
      said: string;
      items: { label: string; value: string; tone: "todo" | "mood" | "habit" | "pattern" }[];
    };
  };
  how: {
    eyebrow: string;
    title: string;
    steps: [HowStep, HowStep, HowStep];
  };
  benefits: {
    eyebrow: string;
    title: string;
    intro?: string;
    cards: BenefitCard[];
  };
  example: {
    eyebrow: string;
    title: string;
    intro?: string;
    examples: CaughtExample[];
  };
  explainer?: {
    eyebrow: string;
    title: string;
    paragraphs: string[];
    points?: { title: string; body: string }[];
  };
  compare?: {
    eyebrow: string;
    title: string;
    intro?: string;
    headers: [string, string];
    rows: { label: string; other: string; ripple: string }[];
    note?: string;
  };
  reviewsTitle: string;
  faqs: { q: string; a: string }[];
  finalCta: { title: string; body: string };
  /** Section order between the hero and the final CTA. */
  order?: SectionKey[];
};

export type HowStep = { title: string; body: string };
