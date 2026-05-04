# React 18 / 19 Collision — Fix Path Analysis

**Status:** Investigation only. **No execution tonight.** This doc is a side-by-side trade-off analysis for the two real fix paths flagged in `docs/v1-1/backlog.md` ("Mobile React 18/19 type collision on memoized components"). The bug is type-only, build-green, runtime-fine — but generates ~115 TS2786 errors on every mobile `tsc --noEmit` and adds noise to every per-slice protocol pass.

**TL;DR recommendation:** **Path B (pnpm migration)** wins on cost, blast radius, and reversibility. Path A (Next.js 15 + React 19 web upgrade) is structurally cleaner but introduces breaking changes from one of the most actively-evolving frameworks in the ecosystem at exactly the wrong time (mid-IAP-pivot, mid-soft-cap-rollout, days from a v1.1 App Store submission).

---

## §1 — The collision, exactly

| Package | `react` | `@types/react` | Source of pin | Reason |
|---------|---------|----------------|---------------|--------|
| `apps/web` | `^18.3.0` | `^18.3.0` | Direct dep | Next.js 14 era — Next.js 14 supports React 18 only; React 19 needs Next.js 15 |
| `apps/mobile` | `19.1.0` | `~19.1.0` | Direct dep | Expo SDK 54 era — Expo SDK 54 ships React Native 0.81 which requires React 19 |
| `packages/shared` | n/a | n/a | (no React types) | Pure TS, no React |

The npm workspace at the root hoists ONE `@types/react` resolution. Symptoms:

```bash
$ npm ls @types/react
acuity@0.1.0 /Users/jcunningham525/projects/Acuity
└─┬ @acuity/mobile@0.1.0 -> ./apps/mobile
  ├── @types/react@19.1.17
  ├─┬ expo-router@6.0.23
  │ ├─┬ @radix-ui/react-slot@1.2.0
  │ │ └── @types/react@18.3.28 deduped invalid: "^19.1.0" from node_modules/react-native
```

Two `@types/react` resolutions land in the tree:
- **`19.1.17`** at top level (driven by `apps/mobile`'s pin)
- **`18.3.28`** under multiple `@radix-ui/react-*` transitive deps (which ship under `expo-router`)

The two type definitions diverge on `ReactNode`: React 19 added `bigint`, React 18 didn't. Any `memo()`-wrapped or `<Provider>`-typed component sees both definitions and fails the `JSX.IntrinsicElements` conformance check with TS2786.

**Affected components (mobile only):** ~115 sites — `TreeNode` (goals), `TaskLeaf`, `EntryRow`, `GroupSection`, `TaskRow`, plus all context providers (`AuthContext.Provider`, `ThemeContext.Provider`, `useTheme()` consumers).

**Web is unaffected** because the web tree resolves `@types/react@18.x` consistently from the top down — there's no Radix-UI/Expo Router collision on the Next.js side.

**Runtime is fully unaffected.** Babel/Metro accept any React-element shape; the JSX runtime doesn't care which `@types/react` computed the type. Web build uses `next.config.js typescript.ignoreBuildErrors: true`. Mobile build uses Metro and never runs tsc as a gate. Both builds are green.

---

## §2 — Path A: Upgrade web to React 19 + Next.js 15

### What it requires

- Bump `apps/web/package.json`:
  - `next` → `^15.x`
  - `react` → `^19.1.0`
  - `react-dom` → `^19.1.0`
  - `@types/react` → `~19.1.0`
  - `@types/react-dom` → `~19.1.0`
- Run `npm install` to converge the workspace on a single `@types/react@~19.1.0`
- Address Next.js 15 breaking changes (see below)
- Verify all 23 vitest files + the full app boot

### Next.js 15 breaking changes that hit our codebase

From the official Next.js 15 upgrade guide:

1. **Async `params` / `searchParams` in Page / Layout / Route handlers.** In Next.js 14, `searchParams` is a sync object: `{ params, searchParams }`. In Next.js 15, both become Promises that must be awaited. **Affects every dynamic route.** Grep target: `searchParams?:` and `params:` in route handlers. Estimated ~30+ touch sites in `apps/web/src/app/`.

2. **`headers()` and `cookies()` are now async.** Previously sync, called as `headers().get(...)`. Now: `(await headers()).get(...)`. Affects every API route that reads headers (Stripe webhook, mobile-auth, etc.).

3. **Caching default change: GET handlers + Page/Layout components no longer cached by default.** Have to opt in via `export const dynamic = "force-static"` or `force-cache`. Inverse of Next 14. **Risk: dashboard pages may slow noticeably if we forget to opt in.**

4. **Forms / `useFormState` → `useActionState`.** Renamed hook with same shape. Affects any form using server-action-driven state. Acuity's `/upgrade-plan-picker.tsx` and a handful of admin tabs use this pattern.

5. **`fetch` no longer cached by default.** Server-side `fetch()` in components doesn't auto-dedupe across renders. Affects `home/page.tsx` and various `_sections/`.

6. **React 19's strict mode + new JSX runtime.** The static-renderer parts of Next.js 15 use React 19's new server-component primitives. Things that worked in 14 may double-render or break: portals, refs in dynamic-imports, etc.

7. **Server-action stricter validation.** Some action signatures we use may need explicit typing.

### Risk profile

- **Blast radius: ENTIRE web app.** Every page, every API route, every server component.
- **Reversibility: low.** Once we upgrade, downgrading requires reverting every breaking-change accommodation.
- **Test surface: vitest harness covers ~10% of the actual surface (helpers + libraries). UI components, pages, and API route handlers are not test-covered. The "did the upgrade work?" verification is manual smoke testing.**
- **Production deploy risk: medium-high.** Next.js 15 has had multiple post-release patch fixes; the version is mature but subtle bugs surface in production-only paths.

### Cost estimate

- **Coding work:** 1.5-2 days for an experienced Next.js dev. Mostly mechanical (await additions on `params`/`searchParams`/`headers`/`cookies`).
- **Testing:** 1 day of manual smoke + chasing edge cases.
- **Production verification:** 24-48h soak with active monitoring.
- **Total: 3-4 dedicated days.**

### What we GAIN beyond fixing the collision

- React 19's improvements: better suspense boundaries, server components evolution.
- Next.js 15: improved caching semantics (when we opt in correctly), better dev-mode performance, partial pre-rendering.
- Smaller bundle (React 19 tree-shaking improvements).

These are real but not urgent — we're not blocked on any of them.

### What we LOSE

- The "Next.js 14 LTS-equivalent" stability we currently have. Next 15 is current; the patch cadence is faster and we'd be on the bleeding edge.

---

## §3 — Path B: Migrate the workspace from npm to pnpm

### What it requires

- Install pnpm globally (or pin via `packageManager` field in root package.json).
- Add `pnpm-workspace.yaml` declaring `apps/*` and `packages/*`.
- Delete `package-lock.json` + `node_modules/`.
- Run `pnpm install` to generate `pnpm-lock.yaml`.
- Update root `package.json`'s `packageManager: "npm@10.8.0"` → `"pnpm@9.x.x"`.
- Update CI scripts: any `npm ci` / `npm install` calls become `pnpm install --frozen-lockfile`.
- Update Vercel build config to use pnpm (auto-detected by lockfile, but may need explicit override).
- Update EAS build config (apps/mobile/eas.json or similar) for pnpm-aware install.

### Why this fixes the collision

pnpm uses a **content-addressable store** with **strict-by-default isolation**. Each package's `node_modules/` only contains its declared deps + the deps' direct deps. There is no hoisting, so a transitive `@types/react` from `expo-router` cannot leak into the top-level resolution that mobile sees.

Concrete mechanism:
- `apps/web/node_modules/@types/react` resolves to v18.x (apps/web's pin).
- `apps/mobile/node_modules/@types/react` resolves to v19.x (apps/mobile's pin).
- The transitive `@radix-ui/react-*` packages get their own `@types/react@18.x` symlinked into `node_modules/.pnpm/<hash>/node_modules/@types/react` — invisible to apps/mobile.

The two versions coexist by default. No workspace-level decision is needed.

### Migration friction

- **Lockfile conversion:** mostly mechanical. pnpm reads npm's `package-lock.json` to seed initial resolution; we then commit a fresh `pnpm-lock.yaml`. ~5 min per `pnpm install` cycle.
- **CI updates:**
  - Vercel auto-detects pnpm-lock.yaml. No config change needed.
  - EAS: Expo CLI handles pnpm correctly via `prebuild`. May need to verify `eas.json` doesn't pin `npm install`.
  - GitHub Actions / any other CI: replace `npm ci` with `pnpm install --frozen-lockfile`.
- **Native deps:** pnpm's symlink strategy occasionally trips packages that expect a flat `node_modules/`. Likely candidates in this repo: react-native-iap (uses native Xcode integration), prisma (uses postinstall scripts to generate the client), expo plugins. Each may need a `public-hoist-pattern[]` entry in `.npmrc` to flatten specific scopes.
- **`@acuity/shared` workspace package:** pnpm uses a different workspace protocol (`workspace:*`). Need to update package.json files referring to `@acuity/shared` from `"*"` to `"workspace:*"`.

### Risk profile

- **Blast radius: workspace tooling.** Not application code. The application bundles produced by Vercel + EAS are byte-identical (modulo whatever pnpm's stricter-resolution surfaces, which is usually a true bug we want to know about).
- **Reversibility: high.** Roll back by deleting `pnpm-lock.yaml` + restoring `package-lock.json` from git. ~10 min.
- **Test surface: existing vitest + tsc + EAS build coverage validates the migration. If tests pass and EAS succeeds, the migration is done.**
- **Production deploy risk: low.** First deploy after migration is the moment of truth; if Vercel + EAS produce green builds, runtime behavior is identical.

### Cost estimate

- **Coding work:** 0.5-1 day, mostly waiting on installs.
- **CI/EAS verification:** 0.5 day of pushing test builds and confirming.
- **Production deploy risk window:** 0.5 day soak.
- **Total: 1-2 days.** Half the cost of Path A.

### What we GAIN beyond fixing the collision

- **Faster CI installs.** pnpm's content-addressable store dedupes across cache hits; cold installs are typically 30-50% faster than npm.
- **Disk efficiency.** Single global store; node_modules dirs are mostly symlinks.
- **Stricter dep resolution.** pnpm catches dependency hygiene bugs (using a transitive dep without declaring it) that npm hoisting hides. This is good in the long run; it surfaces real bugs once.
- **Workspace protocol semantics.** `workspace:*` is more explicit than npm's bare `"*"` and prevents accidental publishing of internal packages.

### What we LOSE

- **The "everyone uses npm" baseline.** Most React Native / Expo / Vercel docs assume npm or yarn. pnpm-specific gotchas exist (peer dep handling, hooks). New contributors may need a one-page README delta.

### Risk that's specific to this repo

- **prisma postinstall.** Prisma generates the client on `npm install`. pnpm's symlink strategy doesn't always trigger postinstall scripts in the same order. Likely fix: explicit postinstall hook in root package.json that calls `prisma generate` after pnpm install. ~15 min.
- **react-native-iap native module.** Just installed via Phase 3a. EAS rebuilds from native source so pnpm's resolution doesn't affect the binary. But `expo prebuild` reads `node_modules/` at prebuild time; if pnpm's flat layout doesn't expose `react-native-iap`, prebuild may fail. Likely fix: `public-hoist-pattern[]=react-native-*` in `.npmrc`. ~15 min.
- **Existing patches / workarounds.** Current repo has no `patches/` directory; no `patch-package` config. Clean.

---

## §4 — Side-by-side comparison

| Dimension | Path A (Next 15 + React 19) | Path B (pnpm migration) |
|---|---|---|
| Fixes the collision? | ✅ Yes (single React 19 across workspace) | ✅ Yes (per-package isolation) |
| Coding cost | 1.5-2 days | 0.5-1 day |
| Manual testing | 1 day | 0.5 day |
| Production deploy risk | Medium-high | Low |
| Reversibility | Low | High |
| Blast radius | Entire web app | Tooling layer only |
| Application code changes | Many (await params, headers, cookies, etc.) | Almost zero (just `workspace:*` updates) |
| Side-benefit | React 19 features | Faster CI, stricter resolution |
| New ecosystem-knowledge required | Next.js 15 patterns | pnpm-specific gotchas |
| When-it-breaks investigation | Could be anywhere in 100+ pages | Almost certainly in install/build hooks |
| Time pressure compatibility | Bad (mid-IAP-pivot, days from submission) | Good (one-time tooling change) |
| Total estimate | 3-4 days | 1-2 days |

---

## §5 — Recommendation: **Path B (pnpm migration)**

For tonight's question — "what's the cheapest fix that genuinely resolves the collision?" — pnpm wins by every measure.

For the broader question — "should we be on Next.js 15 / React 19 long-term?" — yes, eventually, but the right time to upgrade is when:

1. There's a feature we want from Next.js 15 (currently nothing blocks us).
2. The IAP submission cycle is closed.
3. We have a dedicated test surface beyond manual smoke.
4. We aren't in the middle of three concurrent feature pivots.

**None of these are true today.** Defer Path A indefinitely; lift the type-collision blocker via Path B when bandwidth allows.

---

## §6 — Pre-execution checklist for Path B (when bandwidth allows)

Don't run this tonight. When the slice opens, the order is:

- [ ] Confirm latest pnpm version (`pnpm@9.x` at minimum, `10.x` if available)
- [ ] Add `packageManager: "pnpm@<version>"` to root `package.json`
- [ ] Add `pnpm-workspace.yaml` with `packages: ["apps/*", "packages/*"]`
- [ ] Update internal-package refs: `"@acuity/shared": "*"` → `"@acuity/shared": "workspace:*"` in apps/web/package.json + apps/mobile/package.json
- [ ] Add `.npmrc` with `public-hoist-pattern[]=react-native-*` for Expo prebuild compat
- [ ] Add postinstall hook calling `prisma generate` if pnpm doesn't fire it automatically
- [ ] Delete `package-lock.json` + `node_modules/`
- [ ] Run `pnpm install`
- [ ] Run `pnpm typecheck` from each app — confirm web tsc still 7-baseline, mobile tsc drops the ~115 TS2786 errors
- [ ] Run `pnpm vitest run` from apps/web — confirm 362+ tests pass
- [ ] Push branch, watch Vercel preview build for green
- [ ] Run `eas build --profile preview --platform ios` from apps/mobile — confirm green
- [ ] Merge after both pass
- [ ] Update `docs/v1-1/backlog.md` to mark the collision RESOLVED

---

## §7 — Cross-references

- Backlog entry: `docs/v1-1/backlog.md#mobile-react-1819-type-collision-on-memoized-components`
- Current `npm ls @types/react` output: see `npm ls @types/react` from any session
- Workspace declaration: `package.json` `workspaces` field
- Mobile pin source: `apps/mobile/package.json` (`react: 19.1.0`, `@types/react: ~19.1.0`)
- Web pin source: `apps/web/package.json` (`react: ^18.3.0`, `@types/react: ^18.3.0`)
- pnpm docs on workspace isolation: https://pnpm.io/workspaces (note: confirm doc URL on Vercel before linking from production docs)
- Next.js 15 upgrade guide: https://nextjs.org/docs/app/guides/upgrading/version-15 (note: confirm URL accuracy before linking)
