/**
 * Reconcile our ad statuses with Ads Manager (2026-09-28, per Keenan: "should
 * be updated with the ads i want on, on").
 *
 * Ads turned on or off by hand in Ads Manager used to leave our DB wrong: the
 * engine only syncs metrics for ads it thinks are live, so a winner re-enabled
 * by hand went dark in our data, and a hand-paused ad kept being "judged".
 * Meta's own setting (the ad's configured `status`) wins:
 *   ACTIVE on Meta, killed/paused here  → live here
 *   PAUSED/ARCHIVED/DELETED on Meta, live here → killed here
 * Runs at the start of every daily engine run and from the admin reconcile
 * endpoint. Covers ads launched in the last 45 days.
 */
import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";

export async function reconcileAdStatuses(): Promise<{ turnedOn: string[]; turnedOff: string[]; checked: number; errors: number }> {
  const ads = await prisma.adLabAd.findMany({
    where: {
      metaAdId: { not: null },
      launchedAt: { gte: new Date(Date.now() - 45 * 86_400_000) },
      status: { in: ["live", "scaled", "killed"] },
    },
    select: { id: true, metaAdId: true, status: true, creative: { select: { headline: true } } },
  });
  const turnedOn: string[] = [];
  const turnedOff: string[] = [];
  let errors = 0;
  for (const ad of ads) {
    const configured = await meta.getAdConfiguredStatus(ad.metaAdId!);
    if (!configured) {
      errors++;
      continue;
    }
    const onMeta = configured === "ACTIVE";
    const onHere = ad.status === "live" || ad.status === "scaled";
    if (onMeta && !onHere) {
      await prisma.adLabAd.update({ where: { id: ad.id }, data: { status: "live", decisionReason: "Turned on in Ads Manager" } });
      await prisma.adLabDecision.create({ data: { adId: ad.id, decisionType: "maintain", rationale: "RECONCILE: turned on in Ads Manager — marked live." } });
      turnedOn.push(ad.creative.headline);
    } else if (!onMeta && onHere) {
      await prisma.adLabAd.update({ where: { id: ad.id }, data: { status: "killed", decisionReason: `Turned off in Ads Manager (${configured})` } });
      await prisma.adLabDecision.create({ data: { adId: ad.id, decisionType: "kill", rationale: `RECONCILE: ${configured} in Ads Manager — marked off.` } });
      turnedOff.push(ad.creative.headline);
    }
  }
  return { turnedOn, turnedOff, checked: ads.length, errors };
}
