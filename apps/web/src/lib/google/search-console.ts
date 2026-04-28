/**
 * Google Search Console API integration.
 *
 * Uses the shared service account auth from ./auth.ts with the
 * webmasters.readonly scope. Property: sc-domain:getacuity.io.
 *
 * Both functions return null on failure — callers must handle
 * gracefully (skip pruning, log warning, etc.).
 */

import { google } from "googleapis";
import { getGoogleAuthClient } from "./auth";

const PROPERTY = "sc-domain:getacuity.io";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export interface UrlPerformance {
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

export interface PagePerformance {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface QueryPerformance {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface PropertyPerformance {
  topQueries: QueryPerformance[];
  topPages: PagePerformance[];
}

function dateString(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch performance data for a single URL over the last N days.
 */
export async function getUrlPerformance(
  url: string,
  daysBack = 30
): Promise<UrlPerformance | null> {
  const auth = getGoogleAuthClient([SCOPE]);
  if (!auth) return null;

  try {
    const searchconsole = google.searchconsole({ version: "v1", auth });

    const res = await searchconsole.searchanalytics.query({
      siteUrl: PROPERTY,
      requestBody: {
        startDate: dateString(daysBack),
        endDate: dateString(1),
        dimensions: ["page"],
        dimensionFilterGroups: [
          {
            filters: [
              { dimension: "page", operator: "equals", expression: url },
            ],
          },
        ],
        rowLimit: 1,
      },
    });

    const row = res.data.rows?.[0];
    if (!row) {
      return { impressions: 0, clicks: 0, ctr: 0, position: 0 };
    }

    return {
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    };
  } catch (err) {
    console.error("[gsc] getUrlPerformance failed:", err);
    return null;
  }
}

/**
 * Fetch aggregate performance across all /blog/* pages.
 */
export async function getPropertyPerformance(
  daysBack = 30
): Promise<PropertyPerformance | null> {
  const auth = getGoogleAuthClient([SCOPE]);
  if (!auth) return null;

  try {
    const searchconsole = google.searchconsole({ version: "v1", auth });

    // Top pages
    const pagesRes = await searchconsole.searchanalytics.query({
      siteUrl: PROPERTY,
      requestBody: {
        startDate: dateString(daysBack),
        endDate: dateString(1),
        dimensions: ["page"],
        dimensionFilterGroups: [
          {
            filters: [
              {
                dimension: "page",
                operator: "contains",
                expression: "/blog/",
              },
            ],
          },
        ],
        rowLimit: 500,
      },
    });

    const topPages: PagePerformance[] = (pagesRes.data.rows ?? []).map(
      (row) => ({
        page: row.keys?.[0] ?? "",
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      })
    );

    // Top queries
    const queriesRes = await searchconsole.searchanalytics.query({
      siteUrl: PROPERTY,
      requestBody: {
        startDate: dateString(daysBack),
        endDate: dateString(1),
        dimensions: ["query"],
        dimensionFilterGroups: [
          {
            filters: [
              {
                dimension: "page",
                operator: "contains",
                expression: "/blog/",
              },
            ],
          },
        ],
        rowLimit: 50,
      },
    });

    const topQueries: QueryPerformance[] = (queriesRes.data.rows ?? []).map(
      (row) => ({
        query: row.keys?.[0] ?? "",
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        position: row.position ?? 0,
      })
    );

    return { topPages, topQueries };
  } catch (err) {
    console.error("[gsc] getPropertyPerformance failed:", err);
    return null;
  }
}
