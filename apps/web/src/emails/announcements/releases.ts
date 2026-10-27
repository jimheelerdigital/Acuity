/**
 * Release announcement content, one entry per store release, newest first.
 * Rendered by ./release.ts, sent by scripts/release-announce-send.ts.
 *
 * Cadence (proposed 2026-10-23, Jimmy to confirm): every store release with
 * user-facing changes gets ONE email to that platform's users, sent the day
 * the version is live in the store. Nothing for bug-fix-only releases.
 * Start from the in-app What's New (apps/mobile/lib/whats-new-content.ts)
 * so the email and the app say the same thing. User-facing only: no
 * billing plumbing, analytics, or internal names.
 */
import type { ReleaseEmail } from "./release";

export const RELEASE_EMAILS: ReleaseEmail[] = [
  {
    version: "1.9.6",
    platform: "ios",
    subject: "Ripple 1.9.6: on your wrist, in your calendar",
    preheader: "Ripple on Apple Watch, Plan my day, Apple Health, and your calendar, connected.",
    headline: "Ripple 1.9.6 is here",
    intro: "This update takes Ripple to your wrist and into the places you already plan and track your day.",
    features: [
      {
        title: "Ripple on your Apple Watch",
        img: { src: "https://goripple.io/email/ripple-1-9-6/watch.jpg", alt: "Ripple on Apple Watch: recording, Tasks and Growth screens" },
        body: "Record an entry from your wrist, even with no signal: it uploads when you're back in range. Check off tasks and habits there too. Open Ripple on your phone once and your watch connects.",
      },
      {
        title: "Plan my day",
        img: { src: "https://goripple.io/email/ripple-1-9-6/plan.jpg", alt: "Plan my day: tasks placed around the day's meetings" },
        pro: true,
        body: "Tap <strong>Plan my day</strong> on the Today card. Ripple fits your most pressing tasks around today's meetings; adjust the times, then add them to your calendar in one tap.",
      },
      {
        title: "Apple Health",
        img: { src: "https://goripple.io/email/ripple-1-9-6/health.jpg", alt: "A step-goal habit checked off from Apple Health, and sleep next to mood" },
        body: "Go to <strong>Profile \u2192 Apple Health</strong>. See how sleep and steps line up with your mood, and let habits like 10,000 steps check themselves off.",
      },
      {
        title: "Connect your calendar",
        pro: true,
        body: "Go to <strong>Profile \u2192 Calendar</strong> and pick a calendar. Tasks with due dates land on it automatically, Google calendars on your phone included, and your entries can reference what your day actually looked like.",
      },
      {
        title: "Make your own task groups",
        body: "Tap the tag button on Tasks to add, rename, reorder or delete groups. Work, Kids, Side project: whatever fits.",
      },
      {
        title: "Pick a group when you add a task",
        body: "On iOS 26 and later, adding a task with Siri or the Action Button asks for the due date and the group on one card. Skip the group and Ripple picks one for you.",
      },
    ],
  },
  {
    version: "1.9.5",
    platform: "ios",
    subject: "Ripple 1.9.5: type it, snap it, check it off",
    preheader: "Write or photograph an entry, check tasks off from your Home Screen, and add tasks with Siri.",
    headline: "Ripple 1.9.5 is here",
    intro:
      "Not every moment is a good moment to talk. This update gives you more ways to get a thought into Ripple, and fewer taps to act on it.",
    features: [
      {
        title: "Type it or snap it",
        body: "Can’t talk right now? On the recording screen, tap <strong>Type it instead</strong>. Keep a paper journal? Tap the camera and take a photo of the page. Ripple reads your handwriting and treats it just like a recording.",
      },
      {
        title: "Check off tasks from your Home Screen",
        body: "The <strong>Ripple Today</strong> widget now shows your open tasks. Tap a circle to check one off without opening the app. Tap anywhere else to jump straight to your list.",
      },
      {
        title: "Add tasks with Siri, due dates included",
        body: "Say <strong>“Add a task in Ripple”</strong>, or set your Action Button to do it. Ripple asks if there’s a due date, and skipping it takes one tap.",
      },
      {
        title: "See what’s coming next",
        body: "There’s a new <strong>Roadmap</strong> in Profile. See what we’re building and what we’re considering, and vote for what you want most.",
      },
    ],
    also: [
      "The keyboard no longer covers what you’re typing or the buttons you need.",
      "Recordings no longer get stuck on \u201cUploading\u201d.",
    ],
  },
];

export function releaseEmailFor(version: string): ReleaseEmail | undefined {
  return RELEASE_EMAILS.find((r) => r.version === version);
}
