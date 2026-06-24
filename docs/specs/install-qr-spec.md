# Install QR codes for desktop — Phase 1 plan

**Date:** 2026-06-18 · **Status:** Plan (no code yet) · **Owner:** Jimmy
**Context:** Desktop visitors to getacuity.io can't install a mobile app from their computer. Bridge them to their phone via a QR scan. Builds on the install-banner work shipped in PR #13.

---

## 1. What renders on desktop today (audited)

| Component | Desktop behavior | Verdict |
|---|---|---|
| **`InstallBanner`** (sticky top) | `detectPlatform(navigator.userAgent)` returns `null` for any non-iOS/Android UA, then `if (!p) return` (`install-banner.tsx:146`). **Renders nothing on desktop.** | ✅ Correct — leave mobile-only |
| **`InlineInstallCTA`** (marketing content) | **No platform gate.** It renders on desktop and shows the App Store badge (+ Play when the flag flips). On desktop the badge is a **dead-end** — it opens the App Store *web* listing, which can't install anything on a computer. | ⚠️ This is the conversion gap |

**Takeaway:** the sticky banner already correctly shows nothing on desktop; the **inline CTA is where desktop users land on a non-actionable badge**, so it's the right place to swap in a QR.

---

## 2. Component architecture — extend, don't duplicate

**Recommendation (matches your lean):** extend the existing components rather than add a parallel set.

- **`InstallBanner` (sticky):** stays **mobile-only**. No desktop QR variant (see §7 — a QR in a 60px top bar is unscannable/awkward). No change to this component.
- **`InlineInstallCTA`:** make it **platform-aware** with a `desktop` branch:
  - **Mobile** → current behavior (tappable store badges).
  - **Desktop** → render a **QR code + helper copy** instead of the dead-end badges.
  - Same component, same mount sites, same analytics envelope (just a `surface: "badge" | "qr"` dimension on events).

**Why extend:** keeps the 6 existing mount points (home ×2, static-persona ×2, dynamic-landing ×2) and the analytics structure intact; the desktop QR replaces a strictly-worse badge in the exact same slots.

**Alternatives considered:**
- *Separate `DesktopQRCTA` component* — rejected: duplicates mount logic + analytics, and the inline slots are already the right locations.
- *Floating "scan to install" widget (bottom-right, Intercom-style)* — deferred. More aggressive + more eng; viable as a follow-up if inline QR underperforms. Noted as open question §4.

**Detection note:** `InlineInstallCTA` is currently SSR-rendered with no platform check. The desktop branch needs client-side UA detection (same `detectPlatform` helper, inverted: desktop = `detectPlatform() === null`). Render the QR only after hydration to avoid SSR/desktop mismatch — same pattern the banner already uses.

---

## 3. What the QR points to — canonical `/install` redirect (Option A)

**Recommendation: Option A.** QR encodes `https://getacuity.io/install?src=<placement>` → a **server-side platform-detect redirect**:
- iOS UA → App Store URL
- Android UA → Play Store URL (once `PLAY_STORE_LIVE`; until then → a "coming soon to Android" or App Store fallback — open question)
- desktop / unknown UA → fallback page or marketing home (open question §OQ1)

**Why A over B (encode the store URL directly):**
- One canonical install URL reusable by every QR, shared link, and email CTA.
- Future-proofs Android — when Play approves, only `/install` changes; printed/encoded QRs keep working.
- Carries a `src` param for attribution (e.g. `?src=qr_home_mid`, `?src=qr_for_footer`) without changing the destination.

**Implementation sketch (Phase 2):** `/install` as a Next route handler (`app/install/route.ts`, `runtime = "edge"` or nodejs) that parses the UA server-side and 302s to the store URL from `app-version-config.ts` (single source of truth). Pass `src` through to PostHog. This is a **prerequisite** for the QR and should be built in the same workstream.

Since the QR is scanned *by a phone*, the `/install` hit almost always arrives with a mobile UA → resolves to the right store. The desktop branch of `/install` only matters for someone clicking the link on a computer (rare).

---

## 4. QR generation library

**Recommendation: `qrcode.react`** (`<QRCodeSVG>`), lazy-loaded.
- SVG output (crisp at any size, styleable, no canvas), small footprint.
- Native **center-logo overlay** via `imageSettings` + selectable **error-correction level** (`level="H"` so the logo doesn't break scannability) — directly serves §6.
- **Lazy-load** via `next/dynamic({ ssr: false })` inside the desktop branch only, so mobile visitors never download the QR code (~10-15KB) — keeps the mobile bundle untouched.

**Alternatives:**
- `react-qr-code` — lighter, SVG, but **no native logo overlay** (manual SVG layering needed). Pick this only if we drop the center logo.
- *Build-time/static generation* — rejected: the QR target carries per-placement `src` params and may vary, so client-gen is simpler and the cost is trivial (few QRs, lazy-loaded).

---

## 5. Tracking

| Event | When | Properties |
|---|---|---|
| `install_qr_shown` | QR scrolls into view (IntersectionObserver, once) | `location` (mid_page/footer), `pathname` |
| `install_redirect` (server) | `/install` is hit | `src`, `resolved_platform` (ios/android/desktop), `referrer` |

- **Scan-through rate** = `install_redirect` (by `src`) ÷ `install_qr_shown` (by matching `src`) → measures how many desktop QR impressions become phone-side store visits.
- **Caveat (same as the banner work):** true closed-loop attribution (scan → install → native signup) requires **deferred deep linking** (Branch/AppsFlyer). v1 measures QR impressions + scan-throughs (the `/install` hit), which is a strong proxy. Flagged as a later follow-up, not v1 scope.
- Keep the existing `install_banner_inline_shown/_clicked` for the mobile (badge) branch; add `surface: "qr"` to distinguish desktop QR impressions, or use the dedicated `install_qr_shown` — recommend the dedicated event for clean funnels.

---

## 6. Visual design

- **Container:** a brand card in the inline slot — `bg-acuity-card-bg`, radius `xl` (28), `shadowSoft`, hairline `border-acuity-line` (no glow, per DESIGN_SYSTEM §4.4). Eyebrow (mono uppercase, `text-acuity-primary`) + display headline + helper line.
- **QR:** ~150px, **dark modules on white** for contrast — **do not** recolor modules to a low-contrast brand tint (scannability first). A white quiet-zone padding around it.
- **Center logo: YES** — the Acuity glyph (gradMix mark or the app-icon glyph) at ~18% of the QR, with `level="H"` error correction so it stays scannable.
- **Copy:** helper line like *"Point your phone's camera here to install Acuity."* Headline can stay *"Ready to start journaling?"* with the QR as the action. Match the inline CTA's existing type scale (mono eyebrow / `font-display` headline / `text-acuity-text-sec` body).

---

## 7. Placement

- **Sticky top banner:** keep **mobile-only**. A useful QR doesn't fit a 60px bar, and a tiny one is unscannable. Desktop top banner = nothing (status quo). ✅ (your lean)
- **Inline CTA sections:** the QR's home — they already render on desktop and have room for QR + helper text. Desktop branch shows the QR in the same locations (mid_page, footer) on home + both `/for` lander variants.
- **Recommendation:** QR **only** in the inline CTAs (desktop branch); sticky banner stays mobile-only. (your lean)
- **Alternatives:** (a) a floating desktop "scan to install" widget; (b) a hero-level QR so desktop users see it without scrolling. Both deferred — raised as §OQ4.

---

## Open questions for Jimmy

1. **`/install` desktop-UA fallback** — when a *desktop* browser hits `/install` (someone clicks a shared link on a computer), do we: (a) redirect to home, (b) show a dedicated "scan from your phone" page (with the QR), or (c) show both store web links? *Lean: (b) a light scan page — it's also a reusable shareable destination.*
2. **Center logo** — confirm yes, and which mark (app-icon glyph vs the gradMix "A" vs wordmark)? *Lean: app-icon glyph at ~18%, level H.*
3. **Canonical host** — `getacuity.io` vs `www.getacuity.io` for the `/install` URL the QR encodes (NEXTAUTH_URL is `www`, EXPO_PUBLIC_API_URL is apex)? Pick one canonical.
4. **Desktop reach** — QR only in the inline slots means desktop users must scroll to see it. Add a hero-level QR / always-visible placement, or is inline (mid + footer) enough for v1? *Lean: inline-only for v1, measure, then decide.*
5. **Scope** — build `/install` (the redirect) as part of this workstream? *Lean: yes — it's a prerequisite for the QR and a reusable canonical install link.*
6. **Bundle** — OK to add `qrcode.react` (~10-15KB, lazy-loaded desktop-only)?
7. **Shareable install page** — do you also want `/install` (or `/download`) to double as a shareable "get the app" page for email/social, with the QR + both badges? (Cheap add once `/install` exists.)

---

## Complexity estimate: **S–M**

- `/install` redirect route — **S**
- `InlineInstallCTA` desktop branch + lazy QR + analytics — **S–M**
- QR visual polish + center logo — **S**
- No schema, no mobile changes. Pure `apps/web`. Parity: web-only (desktop-only by nature).

---

## Locked decisions (2026-06-18) — Phase 2 build

1. **`/install` = UA-aware hybrid** (one `app/install/page.tsx` server component, reads UA via `headers()`):
   - **iOS UA** → 302 redirect to the App Store URL.
   - **Android UA + `PLAY_STORE_LIVE`** → 302 redirect to the Play URL. While the flag is off → render the page (App Store badge + "Android coming soon").
   - **Desktop / bots / unknown** → render the **"Get Acuity"** page. Never redirects home — respects intent.
   - Carries `?src=<placement>` for attribution.
2. **Canonical URL:** `https://www.getacuity.io/install` (www, matches the rest of the app). All QRs encode `…/install?src=…`.
3. **`/install` page (shareable "Get Acuity" surface):** large QR (primary) + both store badges (Play gated) + Acuity hero copy + brand polish + **clean Open Graph meta** (og:image/title/description) + **no app navigation** (standalone). Doubles as the share destination for email signatures / social bios / support replies.
4. **Center logo:** the **app-icon glyph** (`/apple-touch-icon.png`), ~18% of the QR, error-correction **level H**. Not the wordmark, not a generic "A".
5. **Library:** `qrcode.react` (`QRCodeSVG`), lazy-loaded (`next/dynamic`, `ssr:false`) so the mobile marketing bundle is untouched.
6. **Placement:** desktop QR only in the inline CTAs (sticky banner stays mobile-only). **The FIRST inline block on home + `/for/*` moves to right-after-hero** so desktop intent sees a QR within one scroll. Hero-level always-visible variant is a week-1 fast-follow if conversion is weak.
7. **Analytics:**
   - `install_qr_shown` (client, IntersectionObserver) — QR impressions, with `location`.
   - `install_page_visit` (client, on `/install` desktop render) — with `referrer` + `utm` + `src`.
   - `install_redirect` (server, on the mobile UA redirect) — `src` + resolved platform. *Deferred if the server `track()` doesn't cleanly support anonymous capture; PostHog autocapture covers `/install` hits in the interim.* True scan→install attribution still needs deferred deep linking (Branch/AppsFlyer) — out of v1.

**Build order:** (1) `/install` page → (2) QR in `InlineInstallCTA` desktop branch + move first block after hero → (3) analytics → (4) commit spec + code in **PR #14**.
