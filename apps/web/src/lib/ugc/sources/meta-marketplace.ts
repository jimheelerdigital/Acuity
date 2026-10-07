/**
 * Meta Creator Marketplace source (UGC outreach) — STUB.
 *
 * TODO(meta-app-review): the Creator Marketplace API (Instagram creator
 * discovery via the Graph API's creator marketplace endpoints) needs Meta
 * app review for the instagram_creator_marketplace_discovery permission,
 * which we don't have yet. Once approved: query creators by category
 * (wellness, parenting, productivity), age/gender of their audience and
 * follower range ≤ MAX_FOLLOWERS, map each to a Candidate with source
 * "meta-marketplace", and add this adapter to SOURCES in pipeline.ts.
 * Until then it returns nothing and costs nothing.
 */
import type { SourceAdapter } from "@/lib/ugc/sources/types";

export const metaMarketplaceSource: SourceAdapter = {
  name: "meta-marketplace",
  async discover() {
    return [];
  },
};
