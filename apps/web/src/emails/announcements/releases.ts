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
