# RLS status — 2026-04-21 live verification

Script: `scripts/verify-rls.ts` (read-only, safe to re-run any time).

## Current state (live prod Supabase)

| Table               | Exists | RLS | Force |
|---------------------|--------|-----|-------|
| User                | yes    | ON  | off   |
| Entry               | yes    | ON  | off   |
| Goal                | yes    | ON  | off   |
| Task                | yes    | ON  | off   |
| Theme               | yes    | off | off   |
| ThemeMention        | yes    | off | off   |
| UserInsight         | yes    | off | off   |
| LifeMapAreaHistory  | yes    | off | off   |
| WeeklyReport        | yes    | ON  | off   |
| StateOfMeReport     | yes    | off | off   |
| HealthSnapshot      | yes    | off | off   |
| UserLifeDimension   | yes    | off | off   |

5/12 tables have RLS enabled (Jim's morning pass covered the core four + WeeklyReport). 7 tables are missing it, all newer tables landed after Jim's initial pass.

## SQL Jim owes — paste into Supabase SQL editor

```sql
ALTER TABLE public."Theme" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ThemeMention" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserInsight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LifeMapAreaHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StateOfMeReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."HealthSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserLifeDimension" ENABLE ROW LEVEL SECURITY;
```

Then re-run `npx tsx scripts/verify-rls.ts` to confirm. App won't break — the Prisma connection uses the `postgres` role (service_role equivalent), which bypasses RLS by design.

## Service-role verification

Verified live during this pass: `DB connection role: current_user=postgres role=none`. Prisma connects with an admin-level role so RLS is a defense-in-depth control, not a runtime enforcement layer for our app. The app's authorization is enforced in-route via `getAnySessionUserId(req)` + ownership checks (`where: { id, userId }`), which is unchanged.

RLS matters when:
- Supabase Realtime opens direct connections keyed on user JWTs (future — we don't use it today)
- An anon-key access path is added by mistake (future guard)
- A Supabase-hosted edge function or serverless role connects with anon/authenticated instead of service_role

All new tables should have RLS enabled at creation time. Add to the team's schema-change checklist.

## Service-role env check

- `DATABASE_URL` is the Prisma connection string — used by every server-side Prisma call.
- `apps/web/src/lib/supabase.server.ts:20-23` — supabase-js service-role client, gated by `import "server-only"` so it can never reach the browser (verified by the W9 audit in commit `f72755d`).
- `SUPABASE_SERVICE_ROLE_KEY` is never referenced from any `"use client"` file. Grepped the tree during the 2026-04-21 audit — no leaks.

No anon-key code path exists in the current server code. `supabaseAnon` is exported in `supabase.server.ts` for future use but has zero importers today.
