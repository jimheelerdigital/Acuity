/**
 * Guest mode rules (spec §9: "Guest: one debrief + tasks read-only; mic tap
 * → save wall (hard on 2nd tap)").
 *
 * Pure and dependency-free so the escalation is testable. The screens read
 * these answers; they don't decide.
 *
 * ── Why a guest exists at all ────────────────────────────────────────
 * v10 puts the whole value before the account: record, reveal, paywall,
 * THEN sign-up. "Later" has to be real or the flow is a bait-and-switch.
 * But a guest has no account, so their debrief lives only on this device
 * under an anonymous token — nothing is backed up and nothing survives a
 * reinstall. That is the honest reason to ask again, and it's what the wall
 * copy says.
 */

export type SaveWallKind = "soft" | "hard";

/**
 * Which wall a guest sees for a given prior-attempt count.
 *
 * `attempts` is how many times they have ALREADY hit the wall, so the
 * first tap passes 0.
 *
 * Soft first, hard after. The first tap is a genuine intent to record and
 * deserves a dismissible explanation; by the second, "Later" has been
 * offered twice and a third pass-through would mean recording debriefs that
 * silently overwrite the one they already have. Hard is not a punishment —
 * it's the point at which continuing would start losing their data.
 */
export function saveWallFor(attempts: number): SaveWallKind {
  return attempts >= 1 ? "hard" : "soft";
}

export const SAVE_WALL_COPY: Record<
  SaveWallKind,
  { title: string; body: string; primary: string; secondary: string | null }
> = {
  soft: {
    title: "Save this first?",
    body: "Your debrief is only on this phone right now. Save it and the next one can build on it.",
    primary: "Save my debrief",
    // Dismissible: they asked to record, and a first refusal should not
    // trap them.
    secondary: "Not yet",
  },
  hard: {
    title: "Save your debrief to keep going",
    body: "Recording again would replace the one on this phone. Save it first and nothing gets lost.",
    primary: "Save my debrief",
    // No escape. Stated plainly rather than hidden behind a greyed button.
    secondary: null,
  },
};

/**
 * Whether a guest may open the recorder at all.
 *
 * Always false — every guest mic tap goes through a wall. The FIRST wall is
 * dismissible, but dismissing it returns them to where they were rather
 * than into the recorder: letting one recording through would create a
 * second unclaimed debrief with no way to distinguish which one the claim
 * endpoint should take.
 */
export function guestMayRecord(): boolean {
  return false;
}

/**
 * Whether a surface is read-only for a guest.
 *
 * Spec §9 gives a guest "one debrief + tasks read-only". Read-only rather
 * than hidden because hiding it would leave the never-empty-dashboard
 * promise unmet — they should see exactly what they made. What they cannot
 * do is mutate it, because there is no account to reconcile edits against
 * and the claim endpoint would silently discard them.
 */
export function guestCanEdit(): boolean {
  return false;
}
