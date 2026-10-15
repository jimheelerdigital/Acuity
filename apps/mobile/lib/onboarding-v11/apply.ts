import { api } from "@/lib/api";
import { ART9_CONSENT_TEXT, ART9_WORDING_VERSION, recordConsent } from "@/lib/consent";
import { REFLECTION_HABIT_NAME, addReflectionHabit, createHabit, fetchHabits, isReflectionHabit } from "@/lib/habits-api";
import { claimAnonymousDebrief } from "@/lib/onboarding-v10/claim";
import { setV10Guest } from "@/lib/onboarding-v10/state";
import { registerPushTokenForReminderSlot } from "@/lib/push-token";

import { loadAnswers, saveAnswers } from "./answers";

/**
 * Apply everything she chose before her account existed (Jimmy 2026-10-15:
 * questions + first debrief + results come first, account right before the
 * paywall). Called once, right after sign-up succeeds:
 *
 *   1. attach the anonymous first debrief to the account (the claim creates
 *      every extracted task) — the one step that matters most;
 *   2. write the AI-consent ledger row she agreed to on the consent screen
 *      (same ART9 text she saw);
 *   3. save the first name she asked Ripple to call her;
 *   4. save the check-in time and register the push token (permission was
 *      already asked while the debrief analyzed);
 *   5. create the habits she picked.
 *
 * Each step is best-effort and independent: a failed habit must never
 * block the paywall. The claim is retried by finishOnboarding() too.
 */
export async function applyPendingSetup(): Promise<{ entryId: string | null }> {
  const a = await loadAnswers();
  await setV10Guest(false);

  let entryId: string | null = null;
  try {
    const claim = await claimAnonymousDebrief();
    if (claim.status === "claimed" && claim.entryId) entryId = claim.entryId;
  } catch {
    /* finishOnboarding retries */
  }

  if (a.consentAgreedAt) {
    await recordConsent({
      consentType: "special_category_processing",
      granted: true,
      consentText: ART9_CONSENT_TEXT,
      wordingVersion: ART9_WORDING_VERSION,
    }).catch(() => {});
  }

  if (a.firstName) {
    await api.post("/api/user/name", { name: a.firstName }).catch(() => {});
  }

  if (a.reminderPending) {
    const time = a.checkInTime ?? null;
    await api
      .put("/api/account/reminders", {
        reminders: time ? [{ time, daysActive: [0, 1, 2, 3, 4, 5, 6], enabled: true }] : [],
      })
      .catch(() => {});
    // Permission was granted (or not) during processing; this only posts
    // the token now that there's an account to attach it to.
    if (time) await registerPushTokenForReminderSlot().catch(() => "error");
  }

  if (a.pendingHabits?.length) {
    try {
      const existing = await fetchHabits().catch(() => ({ habits: [], checks: [] }));
      const have = new Set(existing.habits.map((h) => h.name.trim().toLowerCase()));
      const hasReflection = existing.habits.some((h) => isReflectionHabit(h));
      for (const name of a.pendingHabits) {
        if (name === REFLECTION_HABIT_NAME) {
          if (!hasReflection) await addReflectionHabit().catch(() => null);
        } else if (!have.has(name.trim().toLowerCase())) {
          await createHabit(name).catch(() => null);
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  await saveAnswers({ consentAgreedAt: undefined, pendingHabits: undefined, reminderPending: false });
  return { entryId };
}
