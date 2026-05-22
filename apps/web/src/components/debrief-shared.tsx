/**
 * Shared UI primitives used by both the post-signup FirstDebriefFlow
 * and the unauthenticated TryDebriefFlow.
 */

export const MINI_TESTIMONIALS = [
  { quote: "I just talk. Acuity handles everything else.", name: "Jamie L." },
  { quote: "The weekly reports changed how I see my week.", name: "Marcus T." },
  { quote: "I actually sleep now. Tasks out of my head.", name: "Sarah K." },
];

export const SUGGESTED_PROMPTS = [
  "What happened today?",
  "What\u2019s taking up your mental space?",
  "What do you want to get done this week?",
];

export const MAX_SECONDS = 120;
export const MIN_SECONDS = 15;
export const NUDGE_SECONDS = 30;

export interface ProcessingSlide {
  label: string;
  text: string;
  testimonial?: { quote: string; name: string };
  comingSoon?: boolean;
  description?: string;
}

export const PROCESSING_SLIDES: ProcessingSlide[] = [
  {
    label: "Day 1",
    text: "Tasks extracted. Goals tracked. Mood captured.",
    testimonial: {
      quote: "I used to let tasks pile up in my head until 2 AM. Now I debrief into Acuity and actually sleep.",
      name: "Sarah K.",
    },
  },
  {
    label: "Day 7",
    text: "Your first weekly report \u2014 how your week actually went.",
    testimonial: {
      quote: "The weekly reports changed how I see my week.",
      name: "Marcus T.",
    },
  },
  {
    label: "Day 30",
    text: "Patterns emerge across your life.",
    testimonial: {
      quote: "I didn\u2019t realize I was most productive on Tuesdays until Acuity showed me.",
      name: "Jamie L.",
    },
  },
  {
    label: "Day 90",
    text: "Your quarterly memoir \u2014 a story only you could tell.",
    testimonial: {
      quote: "I shared my quarterly memoir with my therapist. She said it was the most useful thing I\u2019d ever brought in.",
      name: "Alex R.",
    },
  },
  {
    label: "1 Year",
    text: "A living model of your life. Six domains. One debrief at a time.",
    testimonial: {
      quote: "It\u2019s like having a second brain that actually remembers everything.",
      name: "Chris M.",
    },
  },
  {
    label: "Task Management",
    text: "Never forget a task again. Every to-do pulled from your own words.",
    testimonial: {
      quote: "I stopped using my notes app entirely. Acuity catches things I didn\u2019t even realize I committed to.",
      name: "David P.",
    },
  },
  {
    label: "Goal Tracking",
    text: "Real-time progress tracking on the goals that matter to you.",
    testimonial: {
      quote: "I mentioned wanting to run a marathon once. Three weeks later Acuity asked me how training was going.",
      name: "Rachel W.",
    },
  },
  {
    label: "Weekly Report",
    text: "Every Sunday, a personalized report on how your week actually went.",
    testimonial: {
      quote: "Sunday mornings I open my report before I open Instagram. It\u2019s the only app that tells me something real.",
      name: "Jordan K.",
    },
  },
  {
    label: "Life Matrix",
    text: "Your updated \u2018state of you\u2019 \u2014 how have you grown over time?",
    testimonial: {
      quote: "The Life Matrix showed me I was crushing it at work but completely neglecting my relationships. That one insight changed everything.",
      name: "Nina S.",
    },
  },
  {
    label: "Coming Soon",
    text: "Your calendar meets your debrief. See how you spend your time vs. how you feel about it.",
    comingSoon: true,
    description: "Connect Google Calendar and Acuity shows you the gap between what you planned and what actually happened.",
  },
  {
    label: "Coming Soon",
    text: "Search your memory. Ask \u2018What did I say about that project in March?\u2019",
    comingSoon: true,
    description: "Every debrief becomes searchable. Your past self has answers you\u2019ve forgotten.",
  },
  {
    label: "Coming Soon",
    text: "Nudges on tasks and goals you mentioned but haven\u2019t acted on.",
    comingSoon: true,
    description: "Acuity notices when you keep mentioning something but never do it \u2014 and gently calls it out.",
  },
];

export const SUMMARY_CORE = [
  "Task extraction",
  "Goal tracking",
  "Mood & energy analysis",
  "Pattern detection",
  "Weekly reports every Sunday",
  "Quarterly memoir",
  "Life Matrix \u2014 six domains",
];

export const SUMMARY_COMING_SOON = [
  "Calendar integration",
  "Ask your past self",
  "Smart notifications",
];

export const CORE_SLIDE_COUNT = 9;
export const SLIDE_MS = 4000;

export const SLIDE_ORBS = [
  "radial-gradient(circle, rgba(124,92,252,0.08) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(167,139,250,0.10) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(196,181,253,0.12) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(245,158,11,0.08) 0%, rgba(124,92,252,0.06) 40%, transparent 70%)",
  "radial-gradient(circle, rgba(124,92,252,0.09) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(196,181,253,0.10) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)",
  "radial-gradient(circle, rgba(249,115,22,0.07) 0%, transparent 70%)",
];

export const MOOD_GLOW: Record<string, string> = {
  GREAT: "0 0 24px 4px rgba(34,197,94,0.15)",
  GOOD: "0 0 24px 4px rgba(74,222,128,0.12)",
  NEUTRAL: "0 0 24px 4px rgba(148,163,184,0.10)",
  LOW: "0 0 24px 4px rgba(245,158,11,0.12)",
  ROUGH: "0 0 24px 4px rgba(239,68,68,0.15)",
};

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function bestMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function extFromMime(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function MoodDot({ mood }: { mood: string }) {
  const colors: Record<string, string> = {
    GREAT: "#22C55E",
    GOOD: "#4ADE80",
    NEUTRAL: "#94A3B8",
    LOW: "#F59E0B",
    ROUGH: "#EF4444",
  };
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ backgroundColor: colors[mood] ?? colors.NEUTRAL }}
    />
  );
}

export function MicIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

export function CheckboxIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 mt-0.5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
    </svg>
  );
}

export function FlagIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 mt-0.5 text-[#A78BFA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

export function Spinner() {
  return (
    <svg
      className="h-10 w-10 animate-spin text-white/40"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function AppleLogo() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 18 18"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14.94 13.5c-.37.82-.55 1.19-.97 1.91-.59.99-1.42 2.24-2.45 2.25-.92.01-1.16-.6-2.41-.59-1.25.01-1.51.6-2.43.59-1.03-.01-1.81-1.13-2.4-2.12C2.92 13.39 2.8 10.77 3.68 9.39c.63-1 1.63-1.58 2.57-1.58.96 0 1.56.6 2.35.6.77 0 1.24-.6 2.35-.6.84 0 1.73.46 2.35 1.24-2.06 1.13-1.73 4.07.37 4.85-.29.7-.43.99-.73 1.6zM11.37 3c.47-.6.83-1.45.7-2.32-.77.05-1.67.54-2.2 1.17-.48.57-.88 1.43-.73 2.26.84.03 1.72-.47 2.23-1.11z" />
    </svg>
  );
}

export function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
