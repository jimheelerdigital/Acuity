# V5 Dispositional Themes — Soak Report Day 1

**Flag:** `v1_1_dispositional_themes`
**Current state at report time:** `enabled: true, rolloutPercentage: 12`
**Set at:** approximately 2026-05-01 (per session context — flag was bumped from 0% to 12% in the previous session)
**Window covered:** 2026-04-30 → 2026-05-02 (~36 hours of post-flip exposure)
**Author:** Claude Code (sweep 2026-05-02)

---

## TL;DR

**Recommended decision: HOLD at 12%.** Do not bump to 25% tonight; do not roll back to 0% either. Both directions need data we can't currently produce.

The user's instruction was to run `apps/web/scripts/theme-distribution.ts --days=2` and compare V5 vs legacy cohorts on `singleMentionPct`, `p90 mentions/theme`, and top themes. Two infrastructure gaps prevent that comparison tonight:

1. **Network access:** The work Mac cannot reach Supabase (`db.cbgmfiqywypvrugsrwcz.supabase.co:5432` connect timeout). The same constraint that requires Jim to run `prisma db push` from home applies here. Confirmed by attempting the script locally — it fails at the first `prisma.$queryRaw` call.

2. **Cohort-attribution gap (more fundamental):** the schema has **no per-entry record of which extraction prompt version produced an entry**. There is no `Entry.promptVersion`, `Theme.promptVersion`, or `ThemeMention.promptVersion` column. The flag-rollout layer decides per-extraction at runtime which prompt to use, but doesn't write a fingerprint anywhere persistent. So even with DB access, computing "V5 cohort" vs "legacy cohort" metrics from the production data is impossible — you'd be lumping the 12% V5 entries together with the 88% legacy entries from the same time window.

This is a measurement-problem-of-our-own-making, not a bug in V5. The mitigation is small (add an `Entry.themePromptVersion` column on the next purposeful schema-bundling pass) but is itself a schema change we explicitly can't ship tonight.

---

## What I attempted

```bash
cd apps/web
npx tsx -r dotenv/config scripts/theme-distribution.ts \
  dotenv_config_path=.env.local \
  --days=2
```

Result:

```
PrismaClientInitializationError:
  Invalid `prisma.$queryRaw()` invocation:
  Can't reach database server at
  `db.cbgmfiqywypvrugsrwcz.supabase.co:5432`
```

Confirmed cause: work-network outbound port restriction. Jim's home network is required to reach Supabase directly (same constraint as `prisma db push`, documented in PROGRESS.md slice notes throughout the session).

---

## What `theme-distribution.ts` actually computes (read-out from the script)

Re-reading `apps/web/scripts/theme-distribution.ts:1-163`:

- Total mention count, distinct theme count, distinct entry count over the window.
- `mentionsPerThemeDistribution`: percentile breakdown (p25/p50/p75/p90/p99 + max).
- `singleMentionPct`: % of themes with exactly 1 mention. **The Phase 2 bench KPI.**
- Top 30 themes by mention count.
- Per-day theme-creation timeline.

It does **not** split by prompt version. Implementing that would require:
1. A new column to fingerprint extractions (e.g. `Entry.themePromptVersion: "v5_dispositional" | "v0_legacy" | null`).
2. The pipeline writing that fingerprint at extraction time (one `data.themePromptVersion = …` line in the persistence transaction).
3. Backfill of historical entries to `"v0_legacy"` so the cohort math is well-defined.

None of that is shippable tonight under the "no schema migration" constraint.

---

## Why the date-cutoff workaround doesn't work

A naive workaround would be: "before 2026-05-01 12:00 UTC → legacy cohort; after → V5 cohort." This is wrong for two reasons:

1. **Mixed cohort post-flip.** With `rolloutPercentage: 12`, only ~12% of post-flip extractions actually used V5. The other ~88% used legacy. A date split conflates them.
2. **Tiny absolute volume.** At current user count + the typical recording cadence, a 36-hour window yields a low double-digit number of total extractions. With 12% V5 share, that's a single-digit number of V5 extractions. Statistical-significance calling on 5-10 samples is noise.

Even ignoring (1), reason (2) alone means the user's instruction caveat — *"the cohort sizes are tiny since user count is small; flag any statistical-significance caveats"* — is the dominant signal. A 36-hour soak at 12% rollout is below the floor where any directional improvement OR regression is detectable, regardless of measurement sophistication.

---

## What I CAN report from code-level evidence

Without DB metrics, the only signal available is:

1. **No production incidents have surfaced from the V5 path since flag flip.** Verified via:
   - PROGRESS.md sweep — no slice between 2026-05-01 and 2026-05-02 calls out a V5-related rollback or hotfix.
   - Sentry pass (W2 of this sweep) — code-level audit found no errors specific to the V5 prompt path. Manual Sentry queries (deferred to Jim) would confirm.
   - The V5 prompt is gated by `feature-flags.ts::isEnabled` — a misfire would short-circuit to legacy, not throw.

2. **The V5 prompt was bench-validated at lab scale.** Phase 2 bench (`docs/v1-1/theme-extraction-phase2.md`): 6 patterns recurring 2-3× across 20 sample entries vs 0 for legacy. That's the qualitative bar; the quantitative bar (`singleMentionPct` from 80% → ~30%, `p90 mentions/theme` from 1 → 3+) is what we'd be checking at production scale.

3. **The flag mechanism is sticky.** Once flipped, a rollback is one admin click on `/admin/feature-flags`. Risk of holding at 12% is bounded — if a regression surfaces (e.g. user feedback about themes feeling worse, support ticket about garbled theme names), one click reverts to 0% within seconds.

---

## Recommendation: HOLD at 12% until we can measure

Three conditions to lift the hold:

1. **Schema:** Add `Entry.themePromptVersion` column on the next purposeful schema-bundling pass. Backfill historical entries to `"v0_legacy"`. (Estimate: 30 min code + Jim's home-network db push.)
2. **Script:** Extend `apps/web/scripts/theme-distribution.ts` with a `--cohort=v5_dispositional|v0_legacy|both` filter (or default to splitting both groups in the report). (Estimate: 30 min.)
3. **Window:** Wait at least 7 days at 12% rollout so the V5 cohort accumulates ≥50 distinct extractions. At our user count + cadence, that's the minimum sample for any percentile metric to be readable. With 25%+ rollout the window can shrink, but we shouldn't bump rollout BEFORE we can measure — that's exactly the condition we're in tonight.

Once those three land, run the comparison. If V5's `singleMentionPct` is meaningfully below legacy's (delta > 10 percentage points) AND `p90 mentions/theme` is meaningfully higher (≥1.5×), bump rollout to 25%. If either metric is worse than legacy, roll back to 0%. If both are within noise, bump rollout cautiously to 25% to grow the next window's sample.

---

## What I will NOT do tonight

- **Will not bump 12% → 25%** without measurement. The user's instruction was conditional on V5 metrics being clean; we can't read the metrics, so the antecedent isn't satisfied.
- **Will not roll back 12% → 0%** without evidence of regression. There is no negative signal — only an inability to confirm the positive signal.
- **Will not add the `Entry.themePromptVersion` column tonight.** The user's CONSTRAINTS section explicitly forbids new schema migrations during V5 ramp. The column is the right fix; it goes on a future schema-bundling pass.

---

## Backlog items surfaced

Add to `docs/v1-1/backlog.md`:

1. **V5 cohort attribution:** add `Entry.themePromptVersion: "v5_dispositional" | "v0_legacy"` column + persistence + backfill + script enhancement. Blocks any data-driven decision on V5 ramp/rollback. Will add in the next sweep entry to backlog.md.

---

## Cross-references

- V5 phase 2 bench: `docs/v1-1/theme-extraction-phase2.md`
- Theme distribution script: `apps/web/scripts/theme-distribution.ts`
- Flag seed: `scripts/seed-feature-flags.ts:139-146`
- Flag is enabled here: `apps/web/src/lib/feature-flags.ts::isEnabled` (rollout uses sticky cookie hash)
- Sentry pass: `docs/v1-1/sentry-pass-2026-05-02.md`
