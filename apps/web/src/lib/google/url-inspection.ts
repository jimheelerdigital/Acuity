/**
 * Google Search Console URL Inspection API integration.
 *
 * Calls urlInspection.index.inspect to determine the indexing
 * coverage state of a specific URL. Used by the blog pruner to
 * differentiate "not yet crawled" from "crawled and rejected."
 *
 * Requires the webmasters scope (same as search-console.ts).
 */

import { google } from "googleapis";
import { getGoogleAuthClient } from "./auth";

const SCOPE = "https://www.googleapis.com/auth/webmasters";
const SITE_URL = "sc-domain:getacuity.io";

export type CoverageState =
  | "indexed"
  | "discovered_not_indexed"
  | "crawled_not_indexed"
  | "excluded"
  | "unknown";

export interface UrlInspectionResult {
  coverageState: CoverageState;
  rawVerdict?: string;
  rawCoverageState?: string;
  error?: string;
}

/**
 * Maps Google's raw coverageState string to our simplified categories.
 *
 * Google returns values like:
 * - "Submitted and indexed" / "Indexed, not submitted in sitemap"
 * - "Discovered - currently not indexed"
 * - "Crawled - currently not indexed"
 * - "Excluded by 'noindex' tag" / "Page with redirect" / "Alternate page with proper canonical tag"
 * - "URL is unknown to Google"
 */
function classifyCoverageState(
  verdict: string | null | undefined,
  coverageState: string | null | undefined
): CoverageState {
  const state = (coverageState ?? "").toLowerCase();
  const v = (verdict ?? "").toLowerCase();

  // Indexed
  if (v.includes("pass") || state.includes("indexed") && !state.includes("not indexed")) {
    return "indexed";
  }

  // Crawled but not indexed — the trim signal
  if (state.includes("crawled") && state.includes("not indexed")) {
    return "crawled_not_indexed";
  }

  // Discovered but not yet crawled
  if (state.includes("discovered") && state.includes("not indexed")) {
    return "discovered_not_indexed";
  }

  // Excluded by policy (noindex, redirect, canonical)
  if (
    state.includes("noindex") ||
    state.includes("redirect") ||
    state.includes("alternate") ||
    state.includes("excluded")
  ) {
    return "excluded";
  }

  // Unknown to Google or unrecognized state
  return "unknown";
}

/**
 * Inspect a single URL's indexing status via the URL Inspection API.
 * Returns null on auth failure (caller should handle gracefully).
 */
export async function inspectUrl(
  url: string
): Promise<UrlInspectionResult | null> {
  const auth = getGoogleAuthClient([SCOPE]);
  if (!auth) return null;

  try {
    const searchconsole = google.searchconsole({ version: "v1", auth });

    const res = await searchconsole.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl: url,
        siteUrl: SITE_URL,
      },
    });

    const result = res.data.inspectionResult;
    const indexStatus = result?.indexStatusResult;

    const verdict = indexStatus?.verdict ?? null;
    const rawCoverageState = indexStatus?.coverageState ?? null;

    return {
      coverageState: classifyCoverageState(verdict, rawCoverageState),
      rawVerdict: verdict ?? undefined,
      rawCoverageState: rawCoverageState ?? undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[url-inspection] inspectUrl failed:", message);
    return {
      coverageState: "unknown",
      error: message,
    };
  }
}

/**
 * Batch-inspect multiple URLs with rate limiting.
 * The URL Inspection API has a quota of ~2000 requests/day and
 * recommends no more than 1 request/second.
 */
export async function batchInspectUrls(
  urls: string[]
): Promise<Map<string, UrlInspectionResult>> {
  const results = new Map<string, UrlInspectionResult>();

  for (const url of urls) {
    const result = await inspectUrl(url);
    if (result) {
      results.set(url, result);
    } else {
      // Auth failure — stop early, don't burn quota
      break;
    }

    // Rate limit: 1 request per 1.2 seconds to stay under quota
    if (urls.indexOf(url) < urls.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  return results;
}
