/**
 * Server-controlled app onboarding (2026-10-31, per Keenan). Storage for the
 * OnboardingRemoteConfig (packages/shared/src/app-onboarding.ts) in the
 * RemoteConfig table, key "app-onboarding".
 *
 *   GET  /api/app/onboarding-config   → the app reads its variant
 *   GET/POST /api/admin/app-onboarding → /admin/app-onboarding edits it
 *
 * APP_ONBOARDING_DEFAULTS mirrors the app's bundled words
 * (apps/mobile/lib/onboarding-v11/copy.ts and the v11 paywall) so the admin
 * can show what each empty field falls back to. Display only: the app never
 * reads it. If the app's copy changes, update this snapshot too.
 */
import {
  DEFAULT_ONBOARDING_CONFIG,
  sanitizeRemoteConfig,
  type OnboardingRemoteConfig,
} from "@acuity/shared";

export const APP_ONBOARDING_KEY = "app-onboarding";

export async function readOnboardingConfig(): Promise<{ config: OnboardingRemoteConfig; updatedAt: Date | null; updatedBy: string | null }> {
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.remoteConfig.findUnique({ where: { key: APP_ONBOARDING_KEY } });
  if (!row) return { config: DEFAULT_ONBOARDING_CONFIG, updatedAt: null, updatedBy: null };
  return { config: sanitizeRemoteConfig(row.value), updatedAt: row.updatedAt, updatedBy: row.updatedBy };
}

export async function saveOnboardingConfig(raw: unknown, updatedBy: string): Promise<OnboardingRemoteConfig> {
  const { prisma } = await import("@/lib/prisma");
  const config = sanitizeRemoteConfig(raw);
  const value = config as unknown as object;
  await prisma.remoteConfig.upsert({
    where: { key: APP_ONBOARDING_KEY },
    create: { key: APP_ONBOARDING_KEY, value, updatedBy },
    update: { value, updatedBy },
  });
  return config;
}

/** The app's bundled words, for admin placeholders. Snapshot of 2026-10-31. */
export const APP_ONBOARDING_DEFAULTS = {
  hook: {
    title: "Does your head feel too full right now?",
    promise: "Ripple keeps track of what you say, so your head doesn't have to.",
  },
  age: {
    title: "Which age range are you in?",
    options: { u25: "Under 25", "25": "25 to 34", "35": "35 to 44", "45": "45 or older" } as Record<string, string>,
  },
  carrying: {
    title: "What are you carrying right now?",
    sub: "Pick all that apply.",
    options: {
      work: "A demanding job",
      family: "Kids or family",
      side: "Building something on the side",
      money: "Money pressure",
      health: "Training or my health",
      partner: "A relationship",
    } as Record<string, string>,
  },
  sound: { eyebrow: "Tap what's true", title: "Does this sound like you?", statement: "Things I say I'll do slip for weeks." },
  notLazy: {
    title: "You're not lazy. You're running without a system.",
    body: "Most people don't lack discipline. They're carrying fifty loose ends with nowhere to put them down, so the important stuff gets dropped.",
    cta: "That's me",
    things: ["Book the dentist", "Renew insurance", "Reply to Dave", "Side project", "Pay the card", "Sign the school form", "Train Monday", "Call the plumber"],
  },
  year: {
    eyebrow: "Built from your answers",
    cta: "Start my first week",
    rows: [
      { day: "Day 1", title: "Your to-do list writes itself", text: "Talk or type whatever's on your mind. Ripple pulls out the tasks." },
      { day: "Day 3", title: "Habits track themselves", text: "The habits you mention start tracking on their own. Your mood gets a read after every debrief." },
      { day: "Day 7", title: "You see your own pattern", text: "Your first pattern: what you keep putting off. Plus your first weekly report." },
      { day: "Day 30", title: "The ripple effect starts", text: "A month of your own words adds up. Fewer things slip, the habits that stuck are clear, and you can see which weeks wear you down." },
      { day: "Day 365", title: "It spreads through your whole life", text: "A year of debriefs across work, family, health and money, all in your Life Matrix. You can see how far you've come, in your own words." },
    ],
  },
  ready: {
    title: "Ready to add the system that helps you get further, faster?",
    sub: "Next up: your first debrief. Say whatever's on your mind and Ripple sorts it out.",
    yes: "Yes, I'm ready",
  },
  paywall: {
    badge: "Your plan is ready, {name}",
    titleLead: "Try Ripple Pro",
    titleAccent: "free for {days} days",
    sub: "$0 today, cancel any time.",
    proHeading: "What Pro gives you",
    cta: "Start my {days}-day free trial",
    trustLine: "",
  },
} as const;

/** Screen names for the admin order editor. */
export const APP_ONBOARDING_SCREEN_LABELS: Record<string, string> = {
  hook: "Hook (yes/no: head too full?)",
  age: "Age range",
  carrying: "What are you carrying?",
  sound: "Yes/no: things slip",
  notlazy: "You're not lazy",
  name: "Name (required)",
  year: "Your first year (Day 1 → 365)",
  ready: "Ready?",
  consent: "Mic consent (always last)",
};
