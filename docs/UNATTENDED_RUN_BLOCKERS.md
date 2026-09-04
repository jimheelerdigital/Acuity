# Unattended run — blockers

Blockers logged during unattended runs: what was hit, why it could not be
resolved safely, and what is needed to unblock it.

---

## 2026-08-22 — RevenueCat Stage 1 run

**No steps were blocked.** All six completed. Logged here so the file exists
with a real precedent rather than as an empty template.

Two things were *deferred by design* rather than blocked, and neither needed
an unsafe action:

### `db:push` not run (correct, per the run's hard rules)
The schema reconciliation was proven with the destructive-diff guard only.
The guard now reports **"Schema and database agree — nothing to apply"**,
so there is in fact nothing to push — the reconciliation brought the schema
file up to what production already had.

*Needed to close:* nothing. A future `npm run db:push` from `main` is a
no-op until the schema changes again.

### Stage 2 actions are dashboard-only
Creating products, setting env vars and flipping flags cannot be done from
the repo, by design. Documented instead in
`docs/REVENUECAT_STAGE2_RUNBOOK.md`.

*Needed to close:* Jimmy, with Apple / Google / Stripe / RevenueCat /
Vercel access.
