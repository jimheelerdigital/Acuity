/**
 * Sends a referral code typed on a sign-up screen right after the account
 * exists (Road 2, POST /api/creators/code). Safe to call more than once and
 * on sign-IN: the server ignores accounts that already have a referral or
 * aren't brand new. Never throws, never blocks sign-up.
 */
import { api } from "@/lib/api";
import { loadAnswers } from "@/lib/onboarding-v11/answers";

export async function submitPendingReferral(): Promise<void> {
  try {
    const a = await loadAnswers();
    if (!a.creatorCode) return;
    await api.post("/api/creators/code", { code: a.creatorCode });
  } catch {
    // Best effort: onboarding's applyPendingSetup() retries the same code.
  }
}
