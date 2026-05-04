# Blog Trim Policy Audit — May 4, 2026

## Executive summary

- **A pruning policy exists and is fully implemented.** The `autoBlogPruneFn` Inngest function runs daily at 03:00 UTC, syncs GSC performance data, and prunes underperforming posts based on a tiered age/impression ladder.
- **What it does:** Posts with zero impressions after 7 days, <50 impressions + <2 clicks after 30 days, or <200 impressions after 90 days are flipped to `PRUNED_DAY7/30/90` status, 301-redirected to the best-performing post, and removed from Google's index via the Indexing API.
- **It appears actively used but depends on GSC API credentials being configured.** The code gracefully skips the entire prune cycle if GSC data is unavailable. The progress.md manual steps for enabling the Search Console API + adding the service account as property owner are still marked as unchecked — if those steps were never completed, the pruner has been running but no-oping every night.

---

## Current policy (if any)

### Automated pruner (Inngest cron)

| Attribute | Value |
|-----------|-------|
| **File** | `apps/web/src/inngest/functions/auto-blog.ts` (lines 630–885) |
| **Function ID** | `auto-blog-prune` |
| **Trigger** | `cron: "0 3 * * *"` (03:00 UTC daily) |
| **Retries** | 1 |

**Step-by-step flow:**

1. **Fetch published posts** — queries `ContentPiece` where `type = BLOG`, `status IN (DISTRIBUTED, AUTO_PUBLISHED)`, `publishedAt != null`.
2. **Fetch GSC data** — calls `getPropertyPerformance(30)` from `apps/web/src/lib/google/search-console.ts`. Fetches top 500 /blog/ pages over last 30 days from the Search Console API. If GSC returns null (auth missing, API error), the entire prune cycle aborts.
3. **Sync GSC data to posts** — maps GSC page-level impressions/clicks onto each ContentPiece row, updates `impressions`, `clicks`, `lastGscSyncAt` fields.
4. **Apply pruning ladder:**
   - **Day 7:** `ageDays >= 7 && impressions === 0` → `PRUNED_DAY7`
   - **Day 30:** `ageDays >= 30 && impressions < 50 && clicks < 2` → `PRUNED_DAY30`
   - **Day 90:** `ageDays >= 90 && impressions < 200` → `PRUNED_DAY90`
5. **Cap at 5 prunes per run.** If more candidates qualify, sends an overflow email to `keenan@getacuity.io` listing the extras.
6. **For each pruned post:**
   - Sets `status` to the corresponding `PRUNED_DAY*` enum value.
   - Sets `redirectTo` to the slug of the highest-click live post.
   - Creates a `PruneLog` row (contentPieceId, reason, impressions, clicks, redirectedToSlug).
   - Calls `notifyUnpublish(url)` via Google Indexing API (URL_DELETED notification with 3x retry).

### Manual kill endpoint (admin action)

| Attribute | Value |
|-----------|-------|
| **File** | `apps/web/src/app/api/admin/auto-blog/kill/route.ts` |
| **Trigger** | POST request from admin dashboard "Kill" button |
| **Auth** | Requires admin session |

Sets the post to `PRUNED_DAY7` status (regardless of actual age), assigns `redirectTo` to the best-performing post, logs to `PruneLog` with reason `manual_kill`, and fires `notifyUnpublish`.

### Blog route handling (301 redirect for pruned posts)

| Attribute | Value |
|-----------|-------|
| **File** | `apps/web/src/app/blog/[slug]/page.tsx` (lines 338–342) |
| **Behavior** | If the resolved post has `status.startsWith("PRUNED_")` and `redirectTo` is set, issues a `permanentRedirect()` (HTTP 308/301) to `/blog/${redirectTo}`. |

### Sitemap exclusion

| Attribute | Value |
|-----------|-------|
| **File** | `apps/web/src/app/sitemap.ts` (lines 74–78) |
| **Behavior** | Only includes posts with `status IN (DISTRIBUTED, AUTO_PUBLISHED)`. Pruned posts are automatically excluded because their status changes to `PRUNED_DAY*`. |

### Google Indexing API integration

| Attribute | Value |
|-----------|-------|
| **File** | `apps/web/src/lib/google/indexing.ts` |
| **Behavior** | `notifyUnpublish(url)` sends `URL_DELETED` to the Indexing API with 3x exponential backoff (1s, 2s, 4s). Logs every call to `IndexingLog` table (url, eventType, success, errorMessage, attemptCount). |

### Google Search Console integration

| Attribute | Value |
|-----------|-------|
| **File** | `apps/web/src/lib/google/search-console.ts` |
| **Behavior** | `getPropertyPerformance(30)` fetches impressions/clicks/CTR/position for all /blog/ URLs over the last 30 days. Used exclusively by the pruner. |

### Database schema

**ContentPiece fields relevant to pruning** (`prisma/schema.prisma`):
- `impressions Int @default(0)` — synced from GSC daily
- `clicks Int @default(0)` — synced from GSC daily
- `lastGscSyncAt DateTime?` — timestamp of last sync
- `publishedAt DateTime?` — used for age calculation
- `redirectTo String?` — slug of the redirect target
- `status ContentStatus` — includes `PRUNED_DAY7`, `PRUNED_DAY30`, `PRUNED_DAY90`

**PruneLog model:**
- `id`, `contentPieceId`, `prunedAt`, `reason`, `impressions`, `clicks`, `redirectedToSlug`

**IndexingLog model:**
- `id`, `url`, `eventType`, `success`, `errorMessage`, `attemptCount`, `createdAt`

---

## progress.md reference

The pruner was shipped on **2026-04-28** in commit `c93ee17`. Key quotes from that entry:

> "Every night at 3am, a separate job checks how each blog post is performing via Google Search Console — posts that get zero impressions after 7 days, or very low traffic after 30/90 days, get automatically removed with a redirect to the best-performing post."

> "Pruner never makes destructive decisions on missing data — if GSC returns null, entire prune cycle is skipped"

> "Pruner caps at 5 posts per run; if more qualify, it emails keenan@getacuity.io with the overflow list"

Manual steps from that entry that affect pruner operation (still unchecked as of 2026-05-04):
- `[ ] Google Cloud Console: enable Search Console API + Indexing API for the existing service account project (Keenan / Jimmy)`
- `[ ] Google Search Console: add the service account email as Owner of sc-domain:getacuity.io (Keenan / Jimmy)`
- `[ ] Verify Inngest registers new functions: check https://app.inngest.com for auto-blog-generate and auto-blog-prune (Jimmy)`

---

## Gaps vs. ideal

The ideal trim policy (per the audit request spec) requires:
1. **21+ days since publish** before a post becomes a trim candidate
2. **"Crawled – currently not indexed" status** from Search Console URL Inspection API
3. **Fewer than 5 lifetime impressions** as the threshold
4. **Three action tiers:** improve, consolidate, or 410-delete

### What's missing or different:

| Ideal requirement | Current implementation | Gap |
|---|---|---|
| 21-day minimum age | 7-day minimum for zero-impression posts | **More aggressive** — prunes at 7 days, not 21. Could prune posts that simply haven't been crawled yet. |
| "Crawled – currently not indexed" status check | Not implemented. Uses impression count as a proxy. | **Major gap.** The URL Inspection API (`searchconsole.urlInspection.index.inspect`) is not called. A post with 0 impressions might be "Discovered – currently not indexed" (waiting in crawl queue) rather than "Crawled – currently not indexed" (Google saw it and rejected it). |
| <5 lifetime impressions threshold | Day 7: exactly 0; Day 30: <50 impressions; Day 90: <200 impressions | Day 7 is stricter than ideal (0 vs 5). Day 30/90 thresholds are more generous than the ideal spec. |
| Action tiers: improve / consolidate / 410 | Single action: status change + 301 redirect + Indexing API URL_DELETED | **No "improve" or "consolidate" path.** Every prune candidate gets the same treatment — redirect and deindex. No mechanism to flag a post for rewriting or merging with another. |
| HTTP 410 Gone response | Uses 301 permanent redirect to best-performing post | **No 410.** The redirect preserves some link equity but doesn't signal "content removed" to Google. The Indexing API `URL_DELETED` notification is sent, but the HTTP response a crawler sees is a 301, not a 410. |
| GSC URL Inspection for per-URL indexing status | Only aggregate Search Analytics data (impressions/clicks) | No per-URL crawl status check. Cannot distinguish "not yet crawled" from "crawled and rejected." |
| Admin review queue for trim candidates | Overflow email only; no in-app review before pruning | Posts are pruned automatically with no human review gate (except the 5/day cap + overflow email). |

---

## Recommendation

### Option A: Keep current policy as-is
- **Pros:** Already built, running daily (if GSC credentials are configured), handles the common case (zero-traction posts get cleaned up).
- **Cons:** The 7-day zero-impression trigger is too aggressive — newly published posts that Google hasn't crawled yet may be pruned before they have a chance to perform. No "improve" path means fixable posts are lost. No URL Inspection integration means the pruner is guessing at indexing status.
- **When to choose:** If the blog is generating enough volume that false positives (premature prunes) don't matter.

### Option B: Extend current policy (recommended)
Modify the existing `autoBlogPruneFn` to:
1. **Raise day-7 threshold to day-21** with <5 impressions (matches the ideal spec).
2. **Add URL Inspection API call** before pruning — only prune posts confirmed as "Crawled – currently not indexed." Posts that are "Discovered" or "URL is unknown to Google" get flagged for re-submission instead.
3. **Add an "improve" tier** — posts between 5-20 impressions at day 30 get flagged in the admin dashboard for rewriting rather than auto-pruned.
4. **Add optional 410 response** — posts pruned with no suitable redirect target return 410 Gone instead of a redirect to an unrelated post.
5. **Add admin review gate** — instead of auto-pruning, move candidates to a "pending prune" status visible in the Auto Blog admin tab, with approve/reject buttons.

- **Effort:** ~4-6 hours. URL Inspection API requires `https://www.googleapis.com/auth/webmasters` scope (already available via the existing service account setup).
- **Risk:** Low — extends existing infrastructure without replacing it.

### Option C: Build from scratch
- **When to choose:** Never. The current implementation is solid infrastructure. The gaps are in policy thresholds and one missing API call, not in architecture.

---

## Critical prerequisite

**Before any of this matters:** Verify that the GSC manual steps from 2026-04-28 were completed. If the service account doesn't have Search Console access, the pruner has been no-oping every night for the past 6 days. Check:
1. Is `GA4_SERVICE_ACCOUNT_KEY` set in Vercel env vars?
2. Is the service account email listed as Owner in Search Console for `sc-domain:getacuity.io`?
3. Are the Search Console API and Indexing API enabled in the GCP project?
4. Has `auto-blog-prune` actually fired in Inngest? (Check https://app.inngest.com run history.)
