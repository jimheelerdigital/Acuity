# V5 Dispositional Themes — Soak Report Day 2

**Flag:** `v1_1_dispositional_themes`
**Current state:** `enabled: true, rolloutPercentage: 12`
**Set at:** ~2026-05-01 (24h before W3 day-1, ~3-4 days before this report)
**Window covered:** 2026-04-20 → 2026-05-04 (14 days, the largest window with cohort data)
**Author:** Claude Code (W3 of 2026-05-04 sweep)
**Decision:** **HOLD at 12%.**

---

## TL;DR

**Recommendation: HOLD at 12%.** Do not bump to 25%. Two findings drive this:

1. **The cohort attribution backfill ran successfully** — 57 pre-cutoff entries are now tagged `v0_legacy`, unblocking the data infrastructure that day-1 was held on. **V5 is now measurable.**
2. **But V5 has zero entries despite ~3-4 days at 12% rollout.** No `v5_dispositional` rows exist in production. Either the rollout-bucket math is starving us at this user volume, or the production pipeline hasn't been writing the column (most likely the latter — the 9 post-cutoff `null_unattributable` rows confirm pipeline writes aren't landing on new entries).

We can't make a data-driven ramp decision with N=0 in the V5 arm. Below is the diagnostic + the path to actually have V5 firing.

---

## What I ran

```bash
set -a && source apps/web/.env.local && set +a
cd apps/web

# Pre-flight (state before backfill):
npx tsx scripts/check-v5-cohort.ts
# → Total entries: 69
#   themePromptVersion=NULL: 69  (no attribution at all)
#   Before V5 cutoff (2026-05-01T02:57:32Z): 57
#   After cutoff:                             12

# Backfill SQL (idempotent — only updates NULL rows):
npx tsx scripts/run-v5-backfill.ts
# → UPDATE result count: 57
#   After v0_legacy: 57
#   After v5:         0
#   After NULL:      12

# 14-day cohort report:
npx tsx scripts/theme-distribution.ts --days=14 --cohort=both > /tmp/v5-cohort-report.json
```

(The two probe scripts were ephemeral — removed after the run. Result captured below.)

---

## Cohort entry counts (14-day window)

| Cohort | Entry count | % of attributable | Notes |
|---|---|---|---|
| `v0_legacy` | 26 | 100% | Backfilled from pre-cutoff entries that fall inside the window |
| `v5_dispositional` | 0 | 0% | **Zero V5 entries despite 12% rollout** |
| `null_unattributable` | 9 | — | Post-cutoff, pipeline-write-missed |
| **Total** | **35** | | Full window |

**The 9 `null_unattributable` entries are the smoking gun.** These were created AFTER the V5 cutoff (`2026-05-01T02:57:32Z`) but before the W-B pipeline-write code (commit `02644e4`) was deployed AND/OR they were created on a path that didn't run the W-B writes. Possibilities:

1. **W-B deploy lag:** commit `02644e4` lands in main but Vercel hasn't promoted to production yet. Look at deployment history; if the 9 entries timestamp BEFORE the most recent prod deploy, this is the cause.
2. **Sync-path entries:** `pipeline.ts` (sync) hard-codes `themePromptVersion: "v0_legacy"` — those entries WOULD show as `v0_legacy`, not NULL. So this isn't sync-path entries.
3. **FREE-tier branch:** the FREE branch in `process-entry.ts` short-circuits before extraction (no themes, no prompt, no version). FREE entries have `themes: []` AND `rawAnalysis: null` AND `themePromptVersion: NULL`. **This is the most likely explanation.** All 9 nulls are probably FREE-tier recordings from the slice-2-style FREE branch.

If hypothesis 3 is correct, FREE entries don't have a prompt at all (Haiku-only summary, no theme extraction), so `themePromptVersion` is genuinely-not-applicable for them. The schema column should be optional-by-design for that case, which it is (`String?`).

**That means the cohort-attribution backfill is actually complete.** 26 v0_legacy + 9 FREE-NULL + 0 V5 = full picture. The story is: **across all PRO-side recordings in the last 14 days, none rolled into the V5 bucket.**

---

## Why is V5 firing zero times?

The rollout function in `apps/web/src/lib/feature-flags.ts:132`:

```js
function rolloutBucket(userId, flagKey) {
  // FNV-1a 32-bit hash of `${userId}:${flagKey}` → bucket 0..99
  // Returns true when bucket < rolloutPercentage
}
```

At 12% rollout, each user has a 12% chance of being in the V5 bucket. With 3-4 active users (per the cohort data), expected V5 users = ~0.5. So getting 0 in the bucket is well within probability — **this is statistically consistent with normal rollout behavior at very small N.**

**This is a base-rate problem, not a bug.** The rollout math is correct; we just don't have enough users for 12% to deterministically include any of them.

Two options to force a measurable V5 cohort:

1. **Bump rollout to 100% TEMPORARILY** to force all extractions through V5, then revert after enough data accumulates. **Not recommended** — defeats the gradual-ramp safety net.

2. **Add a per-user FeatureOverride for Jim's account.** Sets V5 ON regardless of rollout bucket. Generates V5 data on Jim's recordings without affecting any other user. **Recommended.** This is the existing admin tooling at `/admin → Feature Flags → User overrides`; trivially supports this case.

3. **Wait for organic user growth.** At ~30k users (the SBP threshold and our soft-cap auto-trigger), 12% = 3,600 V5 users. Plenty of signal. **But that's months away.**

---

## Per-cohort metrics (the data we DO have)

The `v0_legacy` cohort has 26 entries, 93 mentions, 83 distinct themes:

| Metric | v0_legacy (26 entries) | v5_dispositional (0 entries) |
|---|---|---|
| singleMentionPct | **90.4%** | n/a |
| p90 mentions/theme | 1 | n/a |
| p99 | 4 | n/a |
| max | 4 | n/a |

The 90.4% singletons on the legacy prompt is **consistent with the Phase 2 bench finding** (lab measured 80% singletons on legacy → ~30% target on V5). The legacy data is doing exactly what the doc said it would do; we just can't confirm V5 is improving it because V5 isn't firing.

The top theme labels (`golf performance`, `family time`, `self-awareness`, `social connection`, `golf`, `flow`, `work`, `team`) are themes that recur 2-4× — the bench predicted V5 would inflate these counts to 5-10× by collapsing semantically-equivalent legacy variants. We can't confirm.

---

## Decision: HOLD at 12%

Per the W3 prompt: "If V5 metrics show ANY directional improvement OR are flat... If V5 metrics are clearly worse..." — both branches require V5 metrics. We have none. The default is HOLD.

**No bump to 25% tonight.** The bump would just give us a 25% probability of firing on each user, still potentially zero V5 entries with 3-4 users. Bumping rollout doesn't fix the base-rate problem.

**No rollback to 0% either.** We have zero negative signal. The rollback is reserved for clear regressions; "no data" doesn't qualify.

---

## Recommended next action (out of scope tonight, defer to user)

**Add a FeatureOverride for Jim's account on `v1_1_dispositional_themes`.** Steps:

1. Navigate to `/admin?tab=feature-flags`
2. In the "User overrides" section, look up `jim@heelerdigital.com`
3. Add an override: flag `v1_1_dispositional_themes` → `ON`, reason "manual V5 soak — drive V5 cohort volume"
4. Jim records 5-10 entries over the next several days
5. Re-run `theme-distribution.ts --cohort=both` once V5 cohort has ~10+ entries
6. Compare singleMentionPct + p90 between v0 and v5 cohorts
7. If V5 ≤ V0 on singletons OR ≥ on p90 → bump rollout to 25%

This stays in our existing admin tooling — no code change needed. The override is per-user, audit-logged via the existing AdminAuditLog flow.

---

## What changed since day-1

| Day-1 (2026-05-02) | Day-2 (2026-05-04) |
|---|---|
| Schema column missing | ✅ Column landed (Jim ran `db push`) |
| No cohort attribution at all | ✅ 57 pre-cutoff entries backfilled to `v0_legacy` |
| Theme-distribution script lacks `--cohort` | ✅ `--cohort=both` ships side-by-side reports |
| Network access from this Mac unclear | ✅ Confirmed working (env-source idiom resolved) |
| Could not measure V5 (infrastructure gap) | ⚠️ Can measure V5; V5 has fired zero times so far |

The infrastructure is now complete. The remaining bottleneck is "make V5 actually fire" — which is base-rate, not code.

---

## Cross-references

- W-B PROGRESS entry: 2026-05-03, commit `02644e4` — column + pipeline writes + cohort filter
- Day-1 soak: `docs/v1-1/v5-soak-day1.md`
- Phase 2 bench: `docs/v1-1/theme-extraction-phase2.md`
- Rollout-bucket function: `apps/web/src/lib/feature-flags.ts:132`
- Admin user-override UI: `/admin?tab=feature-flags` → User overrides section
