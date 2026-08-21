/**
 * Mobile processing slides — slice 9 (2026-05-26).
 *
 * Copy verbatim from web's apps/web/src/components/debrief-shared.tsx
 * PROCESSING_SLIDES array (the first five — the 30-day-journey
 * core). Web ships 12 total (Day 1 → 1 Year + feature cards +
 * coming-soon teasers); mobile shows only the first five to keep
 * the dwell time under 20 seconds. The full 12-slide journey would
 * be ~48s, too long for a phone screen between record and reveal.
 *
 * If Keenan revises the source array on web, this mirror needs a
 * manual sync — tracked as known tech debt rather than a runtime
 * import because debrief-shared is in apps/web's bundle and mobile
 * can't pull from it without a packages/shared promotion.
 */

export interface ProcessingSlide {
  label: string;
  text: string;
  testimonial?: { quote: string; name: string };
}

export const PROCESSING_SLIDES: ProcessingSlide[] = [
  {
    label: "Day 1",
    text: "Tasks extracted. Goals tracked. Mood captured.",
    testimonial: {
      quote:
        "I used to let tasks pile up in my head until 2 AM. Now I debrief into Ripple and actually sleep.",
      name: "Sarah K.",
    },
  },
  {
    label: "Day 7",
    text: "Your first weekly report — how your week actually went.",
    testimonial: {
      quote: "The weekly reports changed how I see my week.",
      name: "Marcus T.",
    },
  },
  {
    label: "Day 30",
    text: "Patterns emerge across your life.",
    testimonial: {
      quote:
        "I didn't realize I was most productive on Tuesdays until Ripple showed me.",
      name: "Jamie L.",
    },
  },
  {
    label: "Day 90",
    text: "Your quarterly memoir — a story only you could tell.",
    testimonial: {
      quote:
        "I shared my quarterly memoir with my therapist. She said it was the most useful thing I'd ever brought in.",
      name: "Alex R.",
    },
  },
  {
    label: "1 Year",
    text: "A living model of your life. Six domains. One debrief at a time.",
    testimonial: {
      quote:
        "It's like having a second brain that actually remembers everything.",
      name: "Chris M.",
    },
  },
];

export const SLIDE_MS = 4000;
