# Play Console — Icon and graphics

**Field name in Play Console:** Main store listing → Graphics
**Drafted:** 2026-06-03
**Status:** Asset spec list + sourcing notes. Some assets need design work before upload.

---

## Required assets (Play Console blocks publish until all are present)

| Asset | Dimensions | Format | Notes | Status |
|---|---|---|---|---|
| **App icon** | 512 × 512 px | 32-bit PNG (with or without alpha — Play accepts both, prefers no transparency) | Renders on Play Store search results + listing header | ✅ Generated — `docs/play-store-listing/icon-512.png` |
| **Feature graphic** | 1024 × 500 px | JPG or 24-bit PNG (no alpha) | Banner shown above the listing on phone; landscape orientation | ⏳ NEEDS DESIGN |
| **Phone screenshots** | 1080 × 1920 (or 9:16 / 2:1 max) | JPG or 24-bit PNG (no alpha) | Min 2, max 8. First two are most-seen | ⏳ NEEDS DESIGN |

## Optional assets (improve listing quality + ranking)

| Asset | Dimensions | Format | Notes | Status |
|---|---|---|---|---|
| 7-inch tablet screenshots | 1200 × 1920 or up to 2:1 | JPG/PNG | Optional; skip until tablet layout is verified | ⏸ DEFER to v1.4 |
| 10-inch tablet screenshots | 1600 × 2560 or up to 2:1 | JPG/PNG | Optional; skip until tablet layout is verified | ⏸ DEFER to v1.4 |
| Promo video (YouTube) | Public YouTube URL | YouTube embed | Plays inline on the listing; strongest conversion lift | ⏸ NICE-TO-HAVE |

---

## Asset 1 — App icon (DONE)

**File:** `docs/play-store-listing/icon-512.png`

**Source:** `apps/mobile/assets/icon.png` (1024 × 1024 px, no alpha) — the iOS App Store icon.

**How it was generated:**

```bash
sips -z 512 512 apps/mobile/assets/icon.png --out docs/play-store-listing/icon-512.png
```

**Verified:** 512 × 512 px, no alpha channel (Play Console requires opaque icons; alpha is technically allowed but Play recommends flattening to avoid the gray-checkerboard fallback in some surfaces).

**Pre-upload sanity check:**

- [ ] Open `docs/play-store-listing/icon-512.png` in Preview, confirm it's the Acuity glyph on the brand-purple gradient background.
- [ ] At 96 × 96 px (the smallest size Play shows), the glyph is still recognizable. Acuity's icon passes this — the "A" or wordmark is the dominant element.

---

## Asset 2 — Feature graphic (NEEDS DESIGN)

**Spec:** 1024 × 500 px landscape, JPG or PNG without alpha, RGB color.

**What it is:** A banner that displays prominently above the listing's "Install" button when a user lands on the Acuity page on Play Store. It also appears in some Play Store featured / browse contexts.

**Design direction:**

- Use the Acuity brand palette — dark navy background (`#0F0F1A`) with the coral accent (`#E89653`) and the brand purple (`#7C5CFC`).
- Center-left: the Acuity wordmark + a one-line tagline (e.g., "Your nightly brain dump") in Manrope Bold.
- Center-right: a screenshot of the Home dashboard or the Weekly Report card.
- DO NOT include "Get it on Google Play" branding — Play renders that itself.
- DO NOT include the app icon — Play overlays the app icon on top of the feature graphic on some surfaces; including it in the asset creates a double-icon effect.

**Who creates:** Keenan or a contractor. Reference the existing iOS feature-graphic-equivalent if one was prepared for App Store Connect.

**Sourcing fallback:** if no design resource is available, ship with a "minimum viable" feature graphic — solid `#0F0F1A` background, white Acuity wordmark centered, no tagline. Play accepts this; it's less compelling but unblocks submission.

---

## Asset 3 — Phone screenshots (NEEDS DESIGN — minimum 2, recommended 4–6)

**Spec:** 1080 × 1920 px (or any 9:16 ratio up to 2:1), JPG or PNG without alpha.

**What they are:** The visual carousel below the listing's description. Users swipe through. **First two are the highest-leverage** — many users decide whether to install based on the first two without scrolling.

### Recommended screenshot sequence (6 frames)

| # | Screen | Caption overlay |
|---|---|---|
| 1 | Home dashboard with a sample entry shown | "Your nightly brain dump, structured" |
| 2 | Recording in progress (mic active, level meter) | "Talk for 60 seconds. That's it." |
| 3 | Entry extraction view (transcript + tasks + mood + themes) | "Tasks, mood, and themes — lifted from what you said" |
| 4 | Weekly Report preview | "Every Sunday, a 400-word read on your week" |
| 5 | Life Matrix (10 axes) | "10 life areas, scored over time" |
| 6 | Day-14 Life Audit excerpt | "Day 14: a long-form letter written from your own words" |

### Source from a real device

- Use an Android emulator or a physical Pixel-class device at 1080 × 1920.
- Run the Internal Testing build (once it lands in Play Console).
- Use the seeded reviewer account (`docs/APP_STORE_REVIEW_NOTES.md` §2) so the dashboard has real-looking content.
- Take screenshots via `adb shell screencap -p /sdcard/screen.png` and `adb pull`. Edit on Mac.

### Caption overlay style

- Position the caption at the **top** of the screenshot (not the bottom — Play sometimes truncates the bottom for UI overlay).
- Use Manrope Bold, 64–72px, white text on a 40% dark scrim if the underlying screenshot is light.
- DO NOT use Play Store badges (the "Get it on Google Play" graphic) inside the screenshots themselves.

### Sourcing fallback

If we ship Internal Testing without polished screenshots, Play allows the minimum of 2 raw screenshots from the app. Take 2 clean shots of the Home tab and the Recording surface; ship those, polish to 4–6 in the next listing-update slice.

---

## Asset 4 — Promo video (OPTIONAL — high impact)

**Spec:** A public YouTube URL. Play embeds the video player at the top of the carousel.

**Recommended:** 15–30 second video showing the record-to-report loop. Voiceover or text overlay. Same tonality as the rest of the listing: calm, accountability-voice, no "AI-powered" framing.

**Sourcing:** Keenan or a contractor. Not required for v1.3 submission; can be added after the first build lands in Play Console.

---

## File tree of artifacts in this repo

```
docs/play-store-listing/
├── icon-512.png                ← ✅ READY
├── icon-and-graphics.md        ← this file
├── short-description.md
├── full-description.md
├── release-notes.md
├── data-safety-form.md
└── content-rating-answers.md
```

The repo intentionally does NOT include the feature-graphic or screenshot PNGs — they should be generated against the actual Internal Testing build to avoid shipping placeholders. Once they're ready, drop them in `docs/play-store-listing/` alongside the icon for traceability.

---

## Pre-upload checklist

- [ ] `icon-512.png` ready — already in repo.
- [ ] Feature graphic 1024 × 500 ready — Keenan / contractor.
- [ ] Minimum 2 phone screenshots ready — sourced from Internal Testing build.
- [ ] Optional: promo video YouTube URL.
- [ ] Verify every asset is RGB (not CMYK) and within the size limits (Play rejects > 8MB per asset).
- [ ] Confirm no asset includes Play Store badges, App Store badges, or pricing text inside the artwork itself.
