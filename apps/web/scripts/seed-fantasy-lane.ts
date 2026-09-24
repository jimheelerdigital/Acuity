/**
 * One-off (2026-09-24, per Keenan): create the BWK "fantasy-men" lane —
 * "fantasy oriented, dragon rider esque... talking about being the hero of
 * your own story." Spec-driven (template "moody"), locked to the
 * "fantasy hero" image family via BWK_LANE_FAMILY in moody-carousel.ts.
 * Idempotent upsert. Run AFTER the code that defines that family deploys,
 * or tonight's run would generate it without the lock or the dragon
 * carve-out:
 *   npx dotenv -e apps/web/.env.local -- tsx apps/web/scripts/seed-fantasy-lane.ts
 */
(async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
  });

  const lane = {
    key: "fantasy-men",
    name: "Hero's Journey (Men)",
    brand: "bwk",
    status: "ACTIVE",
    template: "moody",
    // 8 UTC: the only overnight hour without a BWK lane.
    hoursUtc: [8],
    spec: {
      audience: "men",
      theme:
        "Every post casts the reader as the hero of his own story — the dragon rider, the one who answers the call while everyone else stays by the fire. Mythic register, grounded payoff: each post takes one stage of the hero's journey (the call, the refusal, the mentor, the threshold, the trial, the beast to tame, the return with the prize) and turns it into what that stage looks like in his real life this week — the comfortable routine he has to leave, the fear he has to ride straight into, the daily discipline that tames the beast, the version of him that comes back. Each item carries a short mythic header ('The Call', 'The Beast', 'The Oath') and then plain, concrete lines about his actual life. Stirring but never cheesy, never role-play, never fantasy trivia; the images carry the fantasy, the words carry his life. A man reads it at midnight and wants to start tomorrow morning.",
      named: true,
      minItems: 4,
      maxItems: 7,
      tiktokEmail: true,
    },
    origin:
      "2026-09-24, per Keenan: new fantasy lane — dragon-rider imagery, 'be the hero of your own story' — to build engagement. Image family locked to 'fantasy hero'.",
  };

  const row = await prisma.contentLane.upsert({
    where: { key: lane.key },
    create: lane,
    update: {
      name: lane.name,
      brand: lane.brand,
      status: lane.status,
      template: lane.template,
      hoursUtc: lane.hoursUtc,
      spec: lane.spec,
      origin: lane.origin,
      retiredAt: null,
    },
  });
  console.log("upserted", row.key, row.status, row.hoursUtc);
  await prisma.$disconnect();
})();
