import type { ContentBriefing } from "@prisma/client";

const SUBREDDITS = [
  "Journaling",
  "ADHD",
  "productivity",
  "DecidingToBeBetter",
  "selfimprovement",
  "sleep",
];

interface RedditPost {
  title: string;
  subreddit: string;
  upvotes: number;
  url: string;
  permalink: string;
}

async function fetchRedditTop(): Promise<RedditPost[]> {
  const userAgent =
    process.env.REDDIT_USER_AGENT ?? "AcuityResearcher/1.0";

  const allPosts: RedditPost[] = [];

  for (const sub of SUBREDDITS) {
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/top.json?t=day&limit=10`,
        { headers: { "User-Agent": userAgent } }
      );
      if (!res.ok) {
        console.warn(`[research] Reddit r/${sub} returned ${res.status}`);
        continue;
      }
      const json = await res.json();
      const children = json?.data?.children ?? [];
      for (const child of children) {
        const d = child.data;
        allPosts.push({
          title: d.title,
          subreddit: d.subreddit,
          upvotes: d.ups,
          url: d.url,
          permalink: `https://www.reddit.com${d.permalink}`,
        });
      }
    } catch (err) {
      console.warn(`[research] Reddit r/${sub} fetch failed:`, err);
    }
  }

  allPosts.sort((a, b) => b.upvotes - a.upvotes);
  return allPosts.slice(0, 10);
}

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

  const [redditTop, ga4Winners] = await Promise.all([
    fetchRedditTop(),
    fetchGA4Winners(),
  ]);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const briefing = await prisma.contentBriefing.upsert({
    where: { date: today },
    update: {
      redditTop: redditTop as unknown as object[],
      twitterTop: [],
      trendsData: {},
      ga4Winners: ga4Winners as unknown as object[],
      generatedAt: new Date(),
    },
    create: {
      date: today,
      redditTop: redditTop as unknown as object[],
      twitterTop: [],
      trendsData: {},
      ga4Winners: ga4Winners as unknown as object[],
    },
  });

  return briefing;
}
