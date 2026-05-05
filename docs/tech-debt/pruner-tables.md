# Tech Debt: Pruner Tables Consolidation

**Created:** 2026-05-05
**Status:** Low priority — works fine as-is, cleanup when convenient

## Current state

Two tables log pruner activity:

1. **`PruneLog`** (shipped commit c93ee17, 2026-04-28) — records actual prune/trim actions taken. Still actively written to by `autoBlogPruneFn` and the manual `/api/admin/auto-blog/kill` endpoint. Read by the AutoBlogTab admin UI.

2. **`BlogPrunerRun`** (shipped commit 2222cb8, 2026-05-05) — records every nightly evaluation (including dry-run mode). Stores coverage state, recommended action, and whether action was taken. Read by `/admin/blog-pruner-log`.

## Why two tables exist

`PruneLog` predates the v2 pruner rewrite. It only captures "this post was pruned" events. `BlogPrunerRun` captures the full evaluation pipeline (including posts that were kept, flagged for improvement, or skipped).

## Eventual cleanup

Once the v2 pruner has been live for 30+ days and the dry-run period is over:

1. Migrate `PruneLog` reads in AutoBlogTab to query `BlogPrunerRun` where `actualActionTaken IS NOT NULL`
2. Stop writing to `PruneLog` in the pruner and kill endpoint
3. Drop `PruneLog` from the schema in a migration
4. Remove from `rls-allowlist.txt`

**Estimated effort:** ~30 minutes. Not urgent — both tables are small, no performance concern.
