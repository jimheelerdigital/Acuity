import type { ContentBriefing } from "@prisma/client";

interface GA4Winner {
  pagePath: string;
  sessions: number;
}

// Uses @google-analytics/data SDK directly (not the shared google/auth.ts
// helper) because the GA4 SDK handles its own auth via BetaAnalyticsDataClient.
async function fetchGA4Winners(): Promise<GA4Winner[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const serviceAccountKey = process.env.GA4_SERVICE_ACCOUNT_KEY;

  if (!propertyId || !serviceAccountKey) {
    console.warn("[research] GA4 env vars not set, skipping");
    return [];
  }

  try {
    const { BetaAnalyticsDataClient } = await import(
      "@google-analytics/data"
    );

    const credentials = JSON.parse(serviceAccountKey);
    const client = new BetaAnalyticsDataClient({ credentials });

    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        filter: {
          fieldName: "pagePath",
          stringFilter: {
            matchType: "BEGINS_WITH",
            value: "/blog",
          },
        },
      },
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 5,
    });

    return (response.rows ?? []).map((row) => ({
      pagePath: row.dimensionValues?.[0]?.value ?? "",
      sessions: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
    }));
  } catch (err) {
    console.error("[research] GA4 fetch failed:", err);
    return [];
  }
}

export async function buildDailyBriefing(): Promise<ContentBriefing> {
  const { prisma } = await import("@/lib/prisma");

  const ga4Winners = await fetchGA4Winners();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const briefing = await prisma.contentBriefing.upsert({
    where: { date: today },
    update: {
      redditTop: [],
      twitterTop: [],
      trendsData: {},
      ga4Winners: ga4Winners as unknown as object[],
      generatedAt: new Date(),
    },
    create: {
      date: today,
      redditTop: [],
      twitterTop: [],
      trendsData: {},
      ga4Winners: ga4Winners as unknown as object[],
    },
  });

  return briefing;
}
