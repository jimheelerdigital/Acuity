/**
 * One-off (2026-09-25, per Keenan): the "reset guide" paper-carousel lanes,
 * one per brand. Template "paper-guide" (lib/content-factory/paper-guide.ts).
 * Idempotent upsert. Run after the code that knows the template deploys:
 *   npx tsx apps/web/scripts/seed-reset-guide-lanes.ts  (with DB env loaded)
 */
(async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
  });

  const lanes = [
    {
      key: "reset-guide",
      name: "Reset Guide (Women)",
      brand: "ripple",
      status: "ACTIVE",
      template: "paper-guide",
      hoursUtc: [6],
      spec: {
        audience: "women",
        paper: "cream",
        minSlides: 5,
        maxSlides: 7,
        tiktokEmail: true,
        theme:
          "Audience: women roughly 40 to 50 carrying the mental load for a family, a job, and often aging parents. Every guide is a practical reset she can do in the gaps of a full life: clearing her head, getting ahead of the week, taking her evenings back, resetting after a hard stretch, getting ready for the holidays or the new year without the scramble, resetting the household's invisible to-do list, a short morning reset, a Sunday reset, a one-weekend reset. Rotate the structure: a weekend by day-part, a 7-day plan, 5 numbered steps, a morning and evening pair, a monthly reset. Warm, calm, plainspoken, and specific to her real life (school forms, appointments, groceries, work email, her own health). Never preachy, no self-care cliches. Where it fits, include getting everything out of her head by saying it out loud or writing it down, because that is what actually lightens the load.",
      },
      origin: "2026-09-25, per Keenan: practical reset-guide photo carousels on paper (anastasiyadc 'Reset your life' format).",
    },
    {
      key: "reset-guide-men",
      name: "Reset Guide (Men)",
      brand: "bwk",
      status: "ACTIVE",
      template: "paper-guide",
      hoursUtc: [7],
      spec: {
        audience: "men",
        paper: "charcoal",
        minSlides: 5,
        maxSlides: 7,
        tiktokEmail: true,
        theme:
          "Audience: men who want discipline and to get further ahead at work, in training, with money, and with a side project. Every guide is a practical reset with a clear plan: reset your week, reset your focus, get ahead of the next 90 days, a Sunday reset, a 72-hour reset, reset your money in a weekend, recover after a lost month, get ahead before the new year. Rotate the structure: a weekend by day-part, a 7-day plan, 5 numbered steps, a 30-day plan. Direct, command voice, short lines, concrete time boxes and numbers. No therapy talk, no hustle cliches, no 'alpha' talk. Where it fits, include getting everything out of his head by saying it out loud or writing it down, so nothing important gets dropped.",
      },
      origin: "2026-09-25, per Keenan: practical reset-guide photo carousels on paper, BWK version (charcoal paper).",
    },
  ];

  for (const lane of lanes) {
    const row = await prisma.contentLane.upsert({
      where: { key: lane.key },
      create: lane,
      update: { name: lane.name, brand: lane.brand, status: lane.status, template: lane.template, hoursUtc: lane.hoursUtc, spec: lane.spec, origin: lane.origin, retiredAt: null },
    });
    console.log("upserted", row.key, row.status, row.hoursUtc);
  }
  await prisma.$disconnect();
})();
