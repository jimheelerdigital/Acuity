import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";

import { WELCOME_TOUR_KEY, type WelcomeTourRequest } from "@/components/tour/welcome-tour";
import { api } from "@/lib/api";
import { claimAnonymousDebrief } from "@/lib/onboarding-v10/claim";
import { clearStoredTrySession } from "@/lib/try-session";

import { clearAnswers, loadAnswers } from "./answers";

/**
 * End of the funnel (Miro #15 paywall → #16 app walkthrough).
 *
 * Moved here from the v10 reminders screen (check-in time is now chosen
 * while the debrief analyzes). Same four jobs, same order:
 *   1. hand the app tour its request — the welcome-mode tour, because the
 *      first-login auto tour skips anyone who has recorded, and every
 *      funnel finisher has;
 *   2. make sure the first debrief is on her account (backstop for a slow
 *      claim during processing);
 *   3. mark onboarding complete server-side so routing never sends her back;
 *   4. refresh the user and go Home, where the tour starts.
 * Every step is best-effort: a stuck funnel is worse than any one of them
 * failing.
 */
let finishing = false;

export async function finishOnboarding({
  firstName,
  refresh,
}: {
  firstName: string | null;
  refresh: () => Promise<unknown>;
}): Promise<void> {
  if (finishing) return;
  finishing = true;
  try {
    const answers = await loadAnswers();
    try {
      const req: WelcomeTourRequest = {
        setupScreens: 5,
        stepOf: 5,
        firstName: answers.firstName || firstName,
        checkInTime: answers.checkInTime ? clock(answers.checkInTime) : null,
      };
      await AsyncStorage.setItem(WELCOME_TOUR_KEY, JSON.stringify(req));
    } catch {
      /* non-fatal — no tour beats a stuck funnel */
    }
    try {
      const claim = await claimAnonymousDebrief();
      if (claim.status !== "failed") await clearStoredTrySession();
    } catch {
      /* non-fatal */
    }
    try {
      await api.post<{ ok: boolean }>("/api/onboarding/complete", { skipped: false });
    } catch {
      /* non-fatal — AuthGate's v10Offered guard is the local backstop */
    }
    await clearAnswers();
    await refresh().catch(() => {});
    router.replace("/(tabs)");
  } finally {
    finishing = false;
  }
}

/** "21:00" → "9:00 PM" (tour copy: "We'll check in at 9:00 PM"). */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
