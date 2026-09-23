import "./load-env";
import { prisma } from "@/lib/prisma";

async function main() {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const exps = await prisma.adLabExperiment.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      campaignName: true,
      status: true,
      project: { select: { slug: true } },
      angles: {
        select: {
          creatives: {
            select: { imageUrl: true, complianceStatus: true },
          },
        },
      },
    },
  });
  for (const e of exps) {
    const creatives = e.angles.flatMap((a) => a.creatives);
    const imgs = creatives.filter((c) => c.imageUrl).length;
    const compliance = creatives.reduce<Record<string, number>>((acc, c) => {
      acc[c.complianceStatus] = (acc[c.complianceStatus] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `${e.project.slug} | ${e.campaignName ?? e.id} | ${e.status} | creatives=${creatives.length} images=${imgs} compliance=${JSON.stringify(compliance)}`
    );
  }
  if (!exps.length) console.log("no experiments created in last 60min yet");
  await prisma.$disconnect();
}
main();
