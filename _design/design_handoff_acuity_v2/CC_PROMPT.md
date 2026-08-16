# Paste this into Claude Code

Use this prompt verbatim with Claude Code, after extracting the handoff zip into your repo (or referencing it however your CC workflow expects).

---

## The prompt

> I'm doing a visual refresh of Acuity (Expo/React Native + Next.js + Supabase voice-journaling app). I have a complete hi-fi design bundle for you to implement.
>
> **Reference bundle:** `design_handoff_acuity_v2/` — start by reading `README.md` in full before writing any code. It contains tokens, per-screen layout specs, **motion specs (6 shipping animations)**, and implementation notes for React Native. Also open `Acuity Motion Gallery.html` in a browser — it's the engineering source of truth for motion.
>
> **Scope of this implementation:**
> 1. Build a `ThemeProvider` at the app root that exposes `useTheme()` returning the tokens from `makeAcuityTokens({ dark, accent, boost })`. It must:
>     - Read/write `acuity.mode` (System | Light | Dark) and `acuity.palette` (coral | sunset | citrus | cobalt) from AsyncStorage.
>     - Resolve System mode via `useColorScheme()` and re-resolve when the OS theme changes.
>     - Default to System mode + coral palette.
>     - Re-render the whole tree on change (no manual subscribers).
> 2. Port `makeAcuityTokens()` from `acuity-tokens.jsx` to TypeScript at `src/theme/tokens.ts`. Convert all `oklch(...)` strings to hex/RGBA at build time using `culori` so React Native + react-native-svg accept them. Preserve the exact token shape and naming.
> 3. Bundle Manrope (300/400/500/600/700/800) and Geist Mono (400/500/600) via `expo-font` / `useFonts`.
> 4. Build the 11 screens in `screen-*.jsx`, one-to-one, matching the layouts in the README. For HomeDashboard use the **Dashboard** variant. The Ritual variant ships as the light-mode alternate — same data, same nav, different grammar.
> 5. **The Appearance section of the Profile screen is non-optional:** segmented Mode picker (System/Light/Dark) and 4 swatch chips for palette (Coral / Sunset / Citrus / Cobalt). Both must update the whole app immediately on tap and persist across launches. The README spec for this is in section "09 · Profile."
> 6. Use existing patterns in this codebase wherever they exist (navigation, screens, state, data fetching). Don't introduce a new state library if the codebase already has one. Don't introduce styled-components if the codebase uses StyleSheet.
> 7. Don't ship the HTML files — they're references only. Production output is RN.
>
> **Critical implementation notes (also in README, but read carefully):**
> - Backdrop blur → `expo-blur`. Used on bottom tab bar, recording top pills, extract review's sticky footer pill.
> - Gradients → `expo-linear-gradient`. Radial gradients (orb fills, hero corner blobs) → layered linear gradients or `react-native-radial-gradient`.
> - Gradient text → `MaskedView` + linear-gradient. Used on hero score numbers, onboarding axis name, tier level number.
> - SVG → `react-native-svg`. Used in ring progress, sparkbar, waveform, theme map orbital, radar polygon, sparklines.
> - Tabular nums → `style={{ fontVariant: ['tabular-nums'] }}` on every numeric display.
> - Grain noise overlay → low-opacity PNG since RN can't do `mix-blend-mode: overlay`. Skip if it harms perf.
> - **Glow is sparing.** Only mic FAB, recording orb, Tonight CTA, Done button. Don't add glow to every gradient surface.
> - **Theme Map planet positions are tuned** — don't change angle/ring values, only update counts and labels from real data.
> - **Extract review checkboxes default OFF** per spec — never opt-out.
> - **Copy says "Check what to keep" not "Tick"** per spec.
> - Pull-quote-matching transcript beat is highlighted with a left-aligned warm gradient wash.
>
> **What I want from you, in order:**
> 1. Read the README cover to cover. Confirm understanding.
> 2. Survey my codebase (`/app`, `/src`, `/components`, wherever screens live) and tell me what existing patterns you'll match: navigation library, state, styling approach, screen file structure.
> 3. Propose a file structure for: tokens, ThemeProvider, shared primitives (RingProgress, SegmentedTabs, Sparkbar, ThemePill, IconSet, AcuityTabBar), and 11 screen files.
> 4. Wait for my approval before writing any code.
> 5. Then build, one screen at a time, in this order: tokens + ThemeProvider → shared primitives → Profile (so I can test palette/mode/haptics switching) → HomeDashboard (with #3 count-up + #6 streak fill animations) → Recording (with #1 voice-reactive orb) → Entry detail → Theme Map (with #2 solar-system entrance) → Life Matrix → Entries → Tasks (with #5 task check + finish-day confetti easter egg) → Goals → Onboarding → Extract review (also uses #5 check pattern).
> 6. After each screen, run `expo start --ios` and screenshot the result so I can compare against `design_handoff_acuity_v2/index.html` and (for motion) `Acuity Motion Gallery.html`.
>
> The reference bundle's `index.html` opens in any browser — pan/zoom the canvas, click expand on any artboard, use ←/→ to step through. Use it as ground truth for visual fidelity.

---

## What's in the bundle

- `README.md` — start here. Tokens, per-screen layouts, RN implementation notes
- `index.html` — open in a browser to see all 22 artboards (11 screens × dark/light)
- `acuity-tokens.jsx` — port to TS first
- `acuity-chrome.jsx` — shared primitives (RingProgress, Sparkbar, ThemePill, IconSet, tab bar)
- `screen-*.jsx` — one file per screen, all in scope
- `app.jsx` — canvas layout (not for porting — just shows section order)

## Workflow tips for first-try success

1. **Don't paste the prompt and walk away.** Step 2 ("Survey my codebase") is the most important — CC will tell you what library decisions it'll make. Approve or correct those before code is written.
2. **Approve the file structure (step 3) before any screen work.** A wrong structure costs more than a wrong screen.
3. **Build Profile second** (after tokens/ThemeProvider). Once the palette/mode picker works, every subsequent screen is a visual port against working theming.
4. **One screen at a time.** Don't let CC batch — visual fidelity drifts when it's not screenshotted-and-compared per screen.
5. **Keep the reference HTML open in a second tab.** Compare side-by-side.
6. If CC starts hand-rolling oklch math instead of converting via `culori`, stop it — the math is non-trivial and will introduce subtle color bugs.

## Outstanding (call out in your first CC turn if you want these too)

These weren't designed yet — if you want CC to ship them in the same pass, tell it to ask the designer first:

- Weekly Insight delivery moment
- Theme detail drill-down
- Empty states (Entries / Tasks / Goals / Insights first-visit)
- Streak break / re-engagement
- Goal detail/edit
- Onboarding steps 1, 2, 4–8
- Settings detail screens (Reminder time picker, Export flow, etc.)
