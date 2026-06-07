# Art. 9 Enforcement (URL-jump hardening) — read-only audit

**Status:** AUDIT ONLY. No code. Confirm scope before touching the entry pipeline.
**Purpose:** server-side gate so entries can't be created / transcribed / AI-processed without a granted `special_category_processing` (art9-v1) ConsentRecord — closes the gap where a user URL-jumps past the onboarding consent step.

## The chokepoint (good news: it's basically ONE place)
Every real entry is created at **`POST /api/record`** (`apps/web/src/app/api/record/route.ts`, auth via `getAnySessionUserId`). It creates the Entry, then dispatches the Inngest pipeline (Whisper → Claude). **Gate here and everything downstream is protected** — no Entry ⇒ no transcription, no extraction, no weekly/state-of-me/life-audit/ask-past (they all read existing entries).

**Recommended gate set (minimal, blocks everything):**
1. **`POST /api/record`** — primary. Reject before entry creation if no granted art9-v1 ConsentRecord.
2. **`POST /api/try-recording/claim`** — converts an anonymous try-session into a real Entry for a signed-in user; same gate.

**Downstream (protected by #1 — optional defensive re-checks only):** Inngest `process-entry` (Whisper + Claude + memory), `/api/entries/[id]/reprocess`, `/api/weekly`, `/api/state-of-me`, `/api/life-audit`, `/api/insights/ask-past`, the weekly insights cron. None create entries; all require an Entry that #1 already gated.

**Open question — anonymous try-flow:** `POST /api/try-recording` + `POST /api/mobile/try-recording` transcribe + AI-process audio for *unauthenticated* try-sessions (marketing funnel). There's no user to look up a ConsentRecord for. Decision needed: rely on the try-flow's own terms/consent posture, or add an inline acknowledgment there? (Separate from the logged-in gate.)

## ⚠️ HIGH RISK — this is bigger than a server check
1. **Existing-user lockout.** Gating `/api/record` on "has a ConsentRecord" will **block recording for any user who signed up before the Art. 9 consent existed** (no row for them). That's most of the current base. **Requires a grandfather/backfill decision first** — e.g., backfill granted ConsentRecords for active pre-cutoff users, or gate only signups after a cutoff date. Do NOT ship the gate without this.
2. **Live mobile contract.** `/api/record` is called by the **live iOS app**. Adding a 403 changes a mobile-consumed contract. The current shipped app won't understand a new "consent_required" 403 → recording would just fail. The structured-error + route-to-consent handling needs a **mobile client release** in lockstep (and Android). This is a coordinated cross-platform change, not a web-only slice.
3. **Sequencing.** Realistically: (a) ship the web onboarding consent step (slice A) + backfill/grandfather existing users → (b) then enable the server gate once the consenting population is covered and the mobile client handles the 403.

## Scope to confirm before I implement
- Gate at **#1 + #2** only (recommended), or add defensive re-checks downstream?
- Grandfather strategy for existing users (backfill vs cutoff date)?
- Anonymous try-flow: gate or leave to its own consent posture?
- Mobile/Android client handling of the 403 — separate coordinated release (Jim owns the go/no-go on the live contract).
