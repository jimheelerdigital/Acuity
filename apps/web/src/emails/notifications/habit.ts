/**
 * habit_reminder — 5 variants.
 *
 * Highest-frequency category, so the five must feel distinct. Generic,
 * NO user content, NO fixed-time language ("nightly", "before bed",
 * "tonight"), NO recording-duration claims. Theme: a warm "there's
 * space to talk it out whenever you want" / "we haven't heard from
 * you" nudge.
 *
 * Mirror, not coach — we hold the door open, we don't prescribe a
 * routine or tell the reader how to feel.
 */

import { greeting, para, renderShell } from "./shell";
import type { NotifVariant } from "./types";

export const habitVariants: NotifVariant[] = [
  // Variant 0 — "space to talk it out"
  (tone, vars) => {
    const subject =
      tone === "direct" ? "There's space to talk it out" : "Whenever you're ready to talk it out";

    const bodyRows =
      tone === "direct"
        ? `
          ${greeting(vars.firstName)}
          ${para("Acuity's here whenever you want to say what's on your mind out loud.")}
          ${para("No agenda. Just talk, and we'll catch the rest.")}
        `
        : `
          ${greeting(vars.firstName)}
          ${para("If today's been a lot, there's room here to set some of it down.")}
          ${para("No need to make it tidy. Just talk it out, however it comes.")}
        `;

    return {
      subject,
      html: renderShell({
        bodyRows,
        ctaLabel: "Open Acuity",
        vars,
        preheader: "There's room here whenever you want it.",
      }),
    };
  },

  // Variant 1 — "we haven't heard from you"
  (tone, vars) => {
    const subject =
      tone === "direct" ? "We haven't heard from you in a bit" : "It's been a little while";

    const bodyRows =
      tone === "direct"
        ? `
          ${greeting(vars.firstName)}
          ${para("It's been a few days. Whenever you've got something to talk through, Acuity's ready.")}
        `
        : `
          ${greeting(vars.firstName)}
          ${para("It's been a little while since your last entry. No worries at all — life gets full.")}
          ${para("Whenever there's something you'd like to talk out, we're here.")}
        `;

    return {
      subject,
      html: renderShell({
        bodyRows,
        ctaLabel: "Open Acuity",
        vars,
        preheader: "Whenever you're ready, we're here.",
      }),
    };
  },

  // Variant 2 — "what's on your mind"
  (tone, vars) => {
    const subject =
      tone === "direct" ? "What's on your mind?" : "Anything on your mind?";

    const bodyRows =
      tone === "direct"
        ? `
          ${greeting(vars.firstName)}
          ${para("Pick one thing that's been sitting with you and say it out loud. That's the whole thing.")}
        `
        : `
          ${greeting(vars.firstName)}
          ${para("Sometimes the thing on your mind gets lighter once it's said out loud.")}
          ${para("No script needed. Open Acuity and start wherever feels right.")}
        `;

    return {
      subject,
      html: renderShell({
        bodyRows,
        ctaLabel: "Talk it out",
        vars,
        preheader: "Say the thing that's been sitting with you.",
      }),
    };
  },

  // Variant 3 — "we'll catch the rest"
  (tone, vars) => {
    const subject =
      tone === "direct" ? "Just talk — we'll catch the rest" : "You talk, we'll listen";

    const bodyRows =
      tone === "direct"
        ? `
          ${greeting(vars.firstName)}
          ${para("Say what's going on and Acuity pulls out the tasks, the patterns, the things worth remembering. You don't have to organize any of it.")}
        `
        : `
          ${greeting(vars.firstName)}
          ${para("You don't have to make sense of it as you go. Just talk, and Acuity keeps track of what matters.")}
          ${para("The sorting can wait. Your part is the easy part.")}
        `;

    return {
      subject,
      html: renderShell({
        bodyRows,
        ctaLabel: "Open Acuity",
        vars,
        preheader: "You talk. We keep track of the rest.",
      }),
    };
  },

  // Variant 4 — "the door's open"
  (tone, vars) => {
    const subject =
      tone === "direct" ? "The door's open whenever you want" : "Acuity's here when you want it";

    const bodyRows =
      tone === "direct"
        ? `
          ${greeting(vars.firstName)}
          ${para("No streak to chase, no schedule to keep. Open Acuity whenever you've got something to say.")}
        `
        : `
          ${greeting(vars.firstName)}
          ${para("There's no right time and no wrong time. Acuity's here whenever the moment feels right.")}
          ${para("Come back when you want to. We'll be ready.")}
        `;

    return {
      subject,
      html: renderShell({
        bodyRows,
        ctaLabel: "Open Acuity",
        vars,
        preheader: "No schedule. Come back whenever you want.",
      }),
    };
  },
];
