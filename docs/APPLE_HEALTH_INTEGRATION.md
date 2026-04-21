# Apple Health integration — status + next steps

## Current state (2026-04-22)

**Server-side is complete.** Schema + upload endpoint + correlation
read-layer all ship in this commit. The moment any client starts
uploading `HealthSnapshot` rows, the Insights card on the web
(`HealthCorrelationsCard`) will read them and surface
correlations to the user.

**Mobile-side is a stub.** The Profile tab shows an honest "Connect
Apple Health" row that opens an Alert explaining the feature is
coming in the next mobile release. No ghost UI, no broken button.

## Why the mobile integration isn't wired yet

This session runs without the ability to:
- Install a native module and verify it compiles against iOS build
  settings
- Run the iOS simulator to test HealthKit permission prompts
- Run an EAS dev-build on a real device (the only place HealthKit
  actually returns data — simulator has no HealthKit sensors)

Without a round-trip on all three, shipping the HealthKit client
would be "ghost UI" — a Connect button that never works.

## Dependency decision (for the follow-up session)

Two viable libraries:

1. **`@kingstinct/react-native-healthkit`** — modern, typed, active
   maintenance, first-class Expo config plugin. Recommended.
2. **`react-native-health` (agencyenterprise)** — older, popular,
   no first-class Expo config plugin, requires the Expo "prebuild"
   workflow.

Both require an EAS build — they're native modules, not JS-only.

Go with **@kingstinct/react-native-healthkit**. The Expo config
plugin is a single entry in `app.json` vs an ejected iOS project.

## Schema + read layer (already shipped)

### Schema (pushed)

```prisma
model User {
  ...
  healthSnapshots    HealthSnapshot[]
  healthConnectedAt  DateTime?
}

model HealthSnapshot {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  date           DateTime    // YYYY-MM-DD in user's local tz, stored UTC midnight
  sleepHours     Float?
  steps          Int?
  avgHRV         Float?      // milliseconds, HKQuantityTypeIdentifierHeartRateVariabilitySDNN
  activeMinutes  Int?        // Apple's Exercise minutes ring
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([userId, date])
  @@index([userId, date])
}
```

### API surfaces

- **POST /api/health/snapshots** — mobile uploads a batch of daily
  aggregates. Idempotent via `@@unique([userId, date])`. Rate-limited
  under the generic `userWrite` bucket. Accepts 1–31 snapshots per
  call so the mobile worker can re-send the last month in one go.
- **GET /api/insights/health-correlations** — joins last 30 days of
  COMPLETE entries (mood + moodScore) with HealthSnapshot rows by
  calendar day. Returns correlation statements like "Your mood is
  ~1.2 points higher on days with 7+ hours of sleep." Only fires
  when ≥7 paired days exist AND mood-delta across median split ≥0.5
  points (so we don't surface noise).

### Insights card

`apps/web/src/components/health-correlations-card.tsx` — renders the
correlations above the Comparisons card. Silent when nothing to say.

## Follow-up: the mobile integration

Rough scope (expect one focused day):

1. `npm install @kingstinct/react-native-healthkit` + add the config
   plugin to `apps/mobile/app.json` → `expo.plugins`.
2. Add `NSHealthShareUsageDescription` and
   `NSHealthUpdateUsageDescription` to `ios.infoPlist` so App Review
   accepts the permission prompt.
3. Replace the Profile Alert stub with a real `Connect Apple Health`
   flow that:
    - Requests read authorization for
      `HKQuantityTypeIdentifierStepCount`,
      `HKCategoryTypeIdentifierSleepAnalysis`,
      `HKQuantityTypeIdentifierHeartRateVariabilitySDNN`,
      `HKQuantityTypeIdentifierAppleExerciseTime` (or
      `HKQuantityTypeIdentifierActiveEnergyBurned` as a fallback).
    - Stores `healthConnectedAt` via a small endpoint or inline via
      the snapshot POST.
4. Add `apps/mobile/lib/health-sync.ts` that:
    - On app foreground, checks `healthConnectedAt`
    - Pulls aggregates for the last 7 days from HealthKit
    - POSTs them to `/api/health/snapshots` (idempotent; safe to
      re-send)
5. Optional: register a Background Fetch task via
   `expo-background-fetch` so the sync runs even when the app is
   backgrounded. iOS decides the actual cadence — 30min–12h. Not
   blocking; morning-open covers most of the need.
6. EAS dev build → test on a real iPhone (simulator returns no
   data) → App Store build.

## Alternative considered, rejected

- **Apple Health → HealthKit via a background push from Apple to our
  server.** Doesn't exist. HealthKit is device-local; the app has to
  pull + forward.
- **Skipping HealthKit + using Apple Watch APIs directly.** Apple
  Watch data *is* in HealthKit on the paired iPhone. Same code path.

## Privacy posture

HealthKit data never leaves the device unless the user taps Connect.
Once connected:
- Only the 4 aggregates listed above leave the device.
- Raw sleep segments / heart-rate waveforms stay in HealthKit.
- Correlation outputs are stored per-user (not aggregated in a
  shared cohort table).
- Revocation: iOS Settings → Privacy & Security → Health → Acuity →
  turn off. Client should also surface a disconnect toggle that
  clears `healthConnectedAt` + optionally deletes all
  `HealthSnapshot` rows (user choice).
