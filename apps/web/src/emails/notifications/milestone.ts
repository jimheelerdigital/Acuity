/**
 * milestone_celebration — 3 variants.
 *
 * Theme: warmly celebrate the milestone they reached. No advice, no
 * "keep it up" coaching. We notice the milestone and reflect it back.
 * Uses vars.milestoneTitle (e.g. "10 entries", "1 month with Acuity").
 *
 * Mirror, not coach — observe the achievement, don't prescribe next
 * steps. No fixed-time language, no duration claims.
 */

import { escapeHtml } from "@/lib/escape-html";
import { greeting, para, renderShell } from "./shell";
import type { NotifVariant } from "./types";

/** Escaped milestone title with a calm fallback if absent. */
function milestone(vars: { milestoneTitle?: string }): string {
  const raw = vars.milestoneTitle?.trim();
  return raw ? escapeHtml(raw) : "a new milestone";
}

export const milestoneVariants: NotifVariant[] = [
  // Variant 0 — "you reached it"
  (tone, vars) => {
    const m = milestone(vars);
    const subject =
      tone === "direct" ? `You reached ${m}` : `${m} — worth a pause`;

    const bodyRows =
      tone === "direct"
        ? `
          ${greeting(vars.firstName)}
          ${para(`You hit <strong>${m}</strong>. That's real, and it adds up one entry at a time.`)}
        `
        : `
          ${greeting(vars.firstName)}
          ${para(`You reached <strong>${m}</strong>. It's easy to let these moments slip by, so here's a small note that this one counts.`)}
          ${para("Nothing to do with it. Just a chance to notice how far you've come.")}
        `;

    return {
      subject,
      html: renderShell({
        bodyRows,
        ctaLabel: "Open Acuity",
        vars,
        preheader: `You reached ${m}.`,
      }),
    };
  },

  // Variant 1 — "this adds up"
  (tone, vars) => {
    const m = milestone(vars);
    const subject =
      tone === "direct" ? `That's ${m}` : `${m}, and it shows`;

    const bodyRows =
      tone === "direct"
        ? `
          ${greeting(vars.firstName)}
          ${para(`<strong>${m}</strong>. Each entry was a few honest minutes, and they've stacked into something.`)}
        `
        : `
          ${greeting(vars.firstName)}
          ${para(`<strong>${m}</strong>. The kind of thing that's quiet while it happens and then, looking back, means something.`)}
          ${para("Thanks for letting Acuity be part of it.")}
        `;

    return {
      subject,
      html: renderShell({
        bodyRows,
        ctaLabel: "Open Acuity",
        vars,
        preheader: `${m} — it adds up.`,
      }),
    };
  },

  // Variant 2 — "a small celebration"
  (tone, vars) => {
    const m = milestone(vars);
    const subject =
      tone === "direct" ? `Milestone: ${m}` : `Quietly, you hit ${m}`;

    const bodyRows =
      tone === "direct"
        ? `
          ${greeting(vars.firstName)}
          ${para(`You just reached <strong>${m}</strong>. We wanted to mark it.`)}
        `
        : `
          ${greeting(vars.firstName)}
          ${para(`You reached <strong>${m}</strong> — quietly, the way most good habits happen.`)}
          ${para("No fanfare needed. Just a moment to see it before moving on with your day.")}
        `;

    return {
      subject,
      html: renderShell({
        bodyRows,
        ctaLabel: "Open Acuity",
        vars,
        preheader: `You reached ${m}.`,
      }),
    };
  },
];
