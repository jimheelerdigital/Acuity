# RLS Prevention — 2026-04-29

After the 2026-04-29 Supabase exposure (six tables shipped without Row-Level Security, three contained user PII, exposed via the public anon key for up to 6 days), three preventive measures shipped to make the bug class unable to recur silently.

Verified findings from the original audit:
- `ExperimentAssignment`, `ProgressSuggestion`, `TrialEmailLog` — high risk (per-user PII)
- `IndexingLog`, `PruneLog`, `BlogTopicQueue` — low risk (operational only)

All six had RLS enabled in the same fix transaction. This doc covers the prevention layers.

---

## Layer 1 — Postgres event trigger (DB-level default)

**What:** an event trigger on `ddl_command_end` that fires on every `CREATE TABLE` in the `public` schema and runs `ALTER TABLE … ENABLE ROW LEVEL SECURITY` automatically.

**Where:** installed directly in the production database. Source preserved here:

```sql
CREATE OR REPLACE FUNCTION public.auto_enable_rls_on_new_table()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE'
      AND schema_name = 'public'
  LOOP
    EXECUTE format(
      'ALTER TABLE %s ENABLE ROW LEVEL SECURITY',
      obj.object_identity
    );
    RAISE NOTICE 'auto_enable_rls: enabled RLS on %', obj.object_identity;
  END LOOP;
END;
$$;

CREATE EVENT TRIGGER auto_enable_rls_on_new_table_trg
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION public.auto_enable_rls_on_new_table();
```

**Verified working:** canary test on 2026-04-29 — `CREATE TABLE public."_RlsCanary"` (rolled back) emitted `NOTICE: auto_enable_rls: enabled RLS on public."_RlsCanary"` and `pg_class.relrowsecurity` was `t` mid-transaction.

**Limitation flagged in the original ask:** Postgres has no `row_security`-default GUC that auto-enables RLS on new tables. `ALTER DATABASE postgres SET row_security = on` is a different setting (controls whether RLS is *enforced* for queries; default is already `on`). The event-trigger is the only DB-side mechanism. **This is the recommended Supabase pattern** and what's installed.

**Reset behavior:** Supabase project resets / restores would not re-create this trigger. Add to disaster-recovery runbook: re-run the SQL above after any restore.

---

## Layer 2 — CI guard against new models

**What:** PR-time check that every `model X` declaration in `prisma/schema.prisma` has a matching entry in `prisma/rls-allowlist.txt` with an explicit `rls` or `no-rls` annotation. Forces the contributor adding a new table to make a deliberate decision before merge.

**Where:**
- Script: `scripts/check-rls-coverage.ts` (single-file Node script, no DB connection, no secrets)
- Allowlist: `prisma/rls-allowlist.txt` (45 models seeded from prod state on 2026-04-29)
- Workflow: `.github/workflows/rls-check.yml` (runs on PR + push to main, ~10s)

**How it works:**
1. Parse model names from schema with a single regex (`^model\s+(\w+)`)
2. Parse allowlist (skip `#` comments, expect `Name (rls|no-rls)` per line)
3. Fail if any model is missing from the allowlist
4. Fail if any allowlist entry is stale (model removed from schema but not from allowlist)

**Manual verification:**
```sh
npx tsx scripts/check-rls-coverage.ts
# Pass: [rls-coverage] OK: 45 model(s) accounted for (45 rls, 0 no-rls).
# Fail: lists offending models with copy-paste-ready fix instructions.
```

**Lessons baked in:** the check is intentionally simple (regex + file diff) so it can't be broken by AST-parsing bugs. If it ever produces a false positive, fix the allowlist; don't make the check fancier. This is the principle that bit us when an over-engineered prebuild vitest gate took down deploys earlier this week (commit `8147d5e`).

**What this doesn't catch:** raw SQL migrations that add tables without going through `prisma/schema.prisma`. We don't have any of those today; if we ever do, extend the script to also scan `migrations/`.

---

## Layer 3 — Daily Inngest audit

**What:** scheduled function that runs `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false` daily and emails the cofounders if the result is non-empty.

**Where:** `apps/web/src/inngest/functions/rls-audit.ts`, registered in `apps/web/src/app/api/inngest/route.ts`. Cron `0 9 * * *` (09:00 UTC daily).

**Why this layer:** the event trigger (Layer 1) prevents the common case (Prisma push creates new table → trigger fires → RLS enabled). But manual `CREATE TABLE` outside the trigger's filter (e.g. someone runs SQL via the Supabase SQL Editor in a different schema, then moves the table to public) would slip through. Layer 3 catches all gaps within 24 hours.

**Email path:** Resend via the existing `getResendClient()` infrastructure used by `founder-notifications.ts`. Same `EMAIL_FROM` (`hello@getacuity.io`), same recipients (`keenan@`, `jim@`).

**No new env vars required.** Uses `DATABASE_URL` (already set) and `RESEND_API_KEY` (already set). Function exits gracefully without sending email if `RESEND_API_KEY` is missing — logs a warning to Inngest output instead of failing the cron.

**Manual verification:**
1. After deploy, visit the Inngest dashboard → Functions → "RLS Audit (daily)" should appear.
2. Trigger manually from Inngest dashboard ("Invoke function") to confirm it runs in <2s and returns `{ ok: true, exposed: [], message: "No tables without RLS." }`.
3. To test the alert path without exposing real data: in a transaction, disable RLS on one operational table, trigger the function manually, verify the email lands, re-enable RLS:
   ```sh
   psql "$DIRECT_URL" -c "ALTER TABLE public.\"PruneLog\" DISABLE ROW LEVEL SECURITY;"
   # invoke function manually from Inngest dashboard
   psql "$DIRECT_URL" -c "ALTER TABLE public.\"PruneLog\" ENABLE ROW LEVEL SECURITY;"
   ```

---

## Together

| Layer | When it catches | Cost | Failure mode |
|---|---|---|---|
| 1. Event trigger | At table creation time | Zero — fires inline with DDL | Trigger dropped/disabled (rare) |
| 2. CI guard | At PR time | <10s per PR | Bypassed if CI skipped on push to main |
| 3. Daily audit | Within 24h | One Postgres query/day + one email if dirty | Inngest down OR Resend down (separately log-visible) |

Defense in depth. Any single layer can fail without the others losing coverage. All three would have to fail for an exposure to recur silently.

---

## Manual steps for Jimmy

- [ ] Verify the daily Inngest cron is registered in production after the next deploy. Visit https://app.inngest.com/env/production/functions and confirm `rls-audit-daily` is listed.
- [ ] (Optional) Manually invoke the function once from Inngest dashboard to confirm a `"No tables without RLS"` response and an email arrival path. (You'll need to deliberately disable RLS on a low-risk table to see the failure path — see Layer 3 verification above.)
- [ ] Add a runbook entry for "after Supabase restore: re-run the auto_enable_rls_on_new_table_trg event trigger SQL in this doc." Restores wipe event triggers.

No new env vars required. No new infrastructure. The three layers reuse existing Postgres, GitHub Actions (newly added but no secrets), and Inngest + Resend.
