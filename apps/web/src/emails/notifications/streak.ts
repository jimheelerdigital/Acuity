/**
 * streak_preservation — 3 variants.
 *
 * Theme: a gentle note that their N-day streak is still going, and one
 * entry keeps it alive. Not nagging. Mirror, not coach — we observe the
 * streak, we don't lecture about consistency. Uses vars.streakCount.
 *
 * No fixed-time language ("tonight", "before bed"), no duration claims.
 */

import { escapeHtml } from "@/lib/escape-html";
import { greeting, para, renderShell } from "./shell";
import type { NotifVariant } from "./types";

/** Streak count, defaulting to 0 and floored at 0 for copy safety. */
function streakDays(n: number | undefined): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0;
  return v < 0 ? 0 : v;
}

function dayWord(n: number): string {
  return n === 1 ? "day" : "days";
}

export const streakVariants: NotifVariant[] = [
  // Variant 0 — "still going"
  (tone, vars) => {
    const days = streakDays(vars.streakCount);
    const dw = dayWord(days);
    const subject =
      tone === "direct"
        ? `Your ${days}-${dw} streak is still going`
        : `${days} ${dw} of showing up`;

    const bodyRows =
      tone === "direct"
        ? `
          ${greeting(vars.firstName)}
          ${para(`You've recorded <strong>${days} ${dw}</strong> in a row. One more entry keeps it going.`)}
          ${para("No pressure — it's here whenever you want to talk something out.")}
        `
        : `
          ${greeting(vars.firstName)}
          ${para(`You've shown up <strong>${days} ${dw}</strong> in a row. That's worth noticing.`)}
          ${para("One more entry keeps the streak alive — but only if it helps. It'll be here either way.")}
        `;

    return {
      subject,
      html: renderShell({
        bodyRows,
        ctaLabel: "Open Acuity",
        vars,
        preheader: `${days} ${dw} in a row. One entry keeps it going.`,
      }),
    };
  },

  // Variant 1 — "the streak you built"
  (tone, vars) => {
    const days = streakDays(vars.streakCount);
    const dw = dayWord(days);
    const subject =
      tone === "direct"
        ? `Keep your ${days}-${dw} streak alive`
        : `The ${days}-${dw} streak you built`;

    const bodyRows =
      tone === "direct"
        ? `
          ${greeting(vars.firstName)}
          ${para(`Your streak is at <strong>${days} ${dw}</strong>. A quick entry today keeps it unbroken.`)}
        `
        : `
          ${greeting(vars.firstName)}
          ${para(`You've kept this going for <strong>${days} ${dw}</strong>. That kind of steadiness is rare.`)}
          ${para("Whenever you have something on your mind, the door's open.")}
        `;

    return {
      subject,
      html: renderShell({
        bodyRows,
        ctaLabel: "Record an entry",
        vars,
        preheader: `${days} ${dw} and counting.`,
      }),
    };
  },

  // Variant 2 — "right where you left it"
  (tone, vars) => {
    const days = streakDays(vars.streakCount);
    const dw = dayWord(days);
    const subject =
      tone === "direct"
        ? `Your streak is at ${days} ${dw}`
        : `Your streak is right where you left it`;

    const bodyRows =
      tone === "direct"
        ? `
          ${greeting(vars.firstName)}
          ${para(`You're at <strong>${days} ${dw}</strong> in a row. One entry and it carries on.`)}
        `
        : `
          ${greeting(vars.firstName)}
          ${para(`Your <strong>${days}-${dw}</strong> streak is still here, waiting. No rush.`)}
          ${para("If there's something you'd talk through, this is a good moment. If not, that's fine too.")}
        `;

    return {
      subject,
      html: renderShell({
        bodyRows,
        ctaLabel: "Open Acuity",
        vars,
        preheader: `${days} ${dw}, still going.`,
      }),
    };
  },
];
