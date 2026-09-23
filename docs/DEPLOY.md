# Deploying Ripple (web)

**One rule: deploy by getting code onto `main`. Never `vercel --prod` from a laptop.**

## How it works

Vercel's GitHub integration is connected to `jimheelerdigital/Acuity` with
**Production Branch = `main`** (reconnected 2026-04-21; verified 2026-09-23).

- **Push to `main`** → Vercel builds **Production** from GitHub.
- **Push a PR branch** → Vercel builds a **Preview** you can click through.

Because Vercel builds from **GitHub**, prod always reflects `origin/main` — a
stale or dirty local checkout can't affect it, *as long as nobody deploys from
local disk*.

## Do this

```bash
# Feature work → PR (gets a Preview build, gets reviewed):
git checkout -b feat/my-thing
# …commit…
git push -u origin feat/my-thing
gh pr create --base main            # Vercel builds a Preview on the PR

# Shipping main (guarded push; Vercel builds prod):
./scripts/deploy-main.sh            # refuses if not main / dirty / behind
```

`scripts/deploy-main.sh` enforces: on `main`, clean tree, up to date with
`origin/main`, then pushes. It does **not** run `vercel --prod`.

## Never do this

```bash
vercel --prod        # ❌ deploys your LOCAL DISK, bypassing Git.
```

This is what caused the prod clobber: a checkout that was behind `origin/main`
(or had uncommitted edits) got pushed to prod via `vercel --prod`, overwriting
newer work that was already on GitHub. Reserve the Vercel CLI/dashboard
**"Promote"** for an intentional emergency **rollback** only.

## Before you start work

```bash
git pull --ff-only origin main      # never build/commit on a stale tree
```

## Content & SEO commits

Content/SEO/blog work (the `content-factory`, auto-blog, and SEO scripts)
should go through **PRs to `main`**, not direct pushes. It keeps `main` the
single source of truth, gives every change a Preview build, and means the one
Mac checkout only ever needs to `git pull` — the drift that caused the clobber
can't build up silently. Small docs-only edits are fine to push directly.
