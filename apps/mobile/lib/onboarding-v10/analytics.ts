import { Platform } from "react-native";

import { trackOnboardingEvent } from "@/lib/onboarding-events";

/**
 * Onboarding v10 — event emission.
 *
 * Every v10 event carries `flow_version: "v10"`, platform, and the experiment
 * assignment, per spec §7. Centralised so no call site can forget one: the
 * whole point of the v10 funnel dashboard is comparing ratios across the
 * flow, and one screen omitting `flow_version` silently drops out of every
 * ratio it should appear in.
 *
 * Spec §8 says assignment is "persisted at install" and that launch runs a
 * CLEAN BASELINE — no holdout, because volume is too low to read. So
 * `experiment` defaults to "baseline" and there is deliberately no
 * randomisation here yet; wiring a bucketer now would invite turning it on
 * before there's traffic to justify it.
 */

export const V10_FLOW_VERSION = "v10" as const;

/** Every event name in spec §4. Keeping them in one union stops drift. */
export type V10Event =
  | "v10_recognition_viewed"
  | "v10_branch_selected"
  | "v10_mirror_viewed"
  | "v10_start_tapped"
  | "v10_mic_result"
  | "v10_recording_started"
  | "v10_chip_tapped"
  | "v10_recording_completed"
  | "v10_processing_viewed"
  | "v10_processing_latency"
  | "v10_reveal_viewed"
  | "v10_compounding_viewed"
  | "v10_keep_building_tapped"
  | "v10_paywall_viewed"
  | "v10_plan_toggled"
  | "v10_plan_decision"
  | "v10_purchase_completed"
  | "v10_save_viewed"
  | "v10_save_later"
  | "v10_account_completed"
  | "v10_reminder_viewed"
  | "v10_reminder_selected"
  | "v10_os_push_prompt"
  // Returning user took the escape hatch on Screen 1 rather than
  // signing up. Worth measuring: a high rate means cold-start routing
  // is catching people it should not.
  | "v10_signin_from_funnel";

/**
 * Experiment assignment. "baseline" until §8 test #1 actually starts —
 * a clean baseline is the launch condition, not a placeholder.
 */
export type V10Assignment = "baseline" | string;

let assignment: V10Assignment = "baseline";

/** Set once at install/session start if an experiment is running. */
export function setV10Assignment(next: V10Assignment): void {
  assignment = next;
}

export function getV10Assignment(): V10Assignment {
  return assignment;
}

/**
 * Emit a v10 event. Fire-and-forget by design: analytics must never block or
 * break the flow — a dropped event costs a data point, a thrown error costs
 * the activation this whole funnel exists to produce.
 */
export function trackV10(
  event: V10Event,
  props: Record<string, unknown> = {}
): void {
  try {
    void trackOnboardingEvent(event, {
      metadata: {
        ...props,
        flow_version: V10_FLOW_VERSION,
        platform: Platform.OS,
        experiment: assignment,
      },
    });
  } catch {
    // Swallowed deliberately — see above.
  }
}
