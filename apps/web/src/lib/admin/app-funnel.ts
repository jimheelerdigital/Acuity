/**
 * In-app onboarding funnel for the admin "App funnel" tab (2026-10-20, per
 * Keenan: "track every stage of our funnel in app to see if people are
 * dropping off at any stage").
 *
 * Source: OnboardingEvent rows the app logs (v10_* screens, app_signed_in).
 * A person = userId, else the event's sessionToken. Most screens before
 * sign-in carry neither yet (Jimmy is adding a per-install id), so the very
 * first screen is a raw view count and everything after sign-in is exact.
 *
 * Two paths:
 *   - New installs (onboarding): questions → recording → reveal → paywall →
 *     skip ("Keep building") or an App Store / Play trial.
 *   - Web payers (welcome): welcome screens → habit → tour.
 */
import type { PrismaClient } from "@prisma/client";

type Ev = { event: string; value: string | null; userId: string | null; sessionToken: string | null };

export interface AppFunnelStep {
  key: string;
  label: string;
  /** Times the step happened (most onboarding runs before sign-in, without an id). */
  views: number;
  /** Distinct identifiable people (signed in / with a session id) who reached it. */
  people: number;
  /** Share of the cohort's first step. */
  pctOfTop: number;
  /** Share of the step before it. */
  pctOfPrev: number;
  /** Indented outcome rows (e.g. paywall → skip / trial). */
  branch?: boolean;
  /** Section: "questions" (1.9.x only) or "core" (record → paywall, every version). */
  group: "questions" | "core";
}

const parse = (v: string | null): Record<string, unknown> => {
  try {
    return v ? (JSON.parse(v) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export async function getAppFunnel(prisma: PrismaClient, start: Date, end: Date) {
  const events = (await prisma.onboardingEvent.findMany({
    where: {
      createdAt: { gte: start, lte: end },
      isBot: false,
      OR: [{ event: { startsWith: "v10_" } }, { event: "app_signed_in" }],
    },
    select: { event: true, value: true, userId: true, sessionToken: true },
  })) as Ev[];

  const who = (e: Ev) => e.userId ?? e.sessionToken;
  const peopleWhere = (pred: (e: Ev, v: Record<string, unknown>) => boolean) => {
    const s = new Set<string>();
    for (const e of events) {
      const id = who(e);
      if (id && pred(e, parse(e.value))) s.add(id);
    }
    return s;
  };
  const is = (name: string, screen?: string) => (e: Ev, v: Record<string, unknown>) =>
    e.event === name && (screen === undefined || v.screen === screen);
  const views = (pred: (e: Ev, v: Record<string, unknown>) => boolean) => events.filter((e) => pred(e, parse(e.value))).length;

  // ── New installs: everyone who reached the first question ───────────
  const cohort = peopleWhere(is("v10_q_viewed", "hook"));
  const inCohort = (s: Set<string>) => new Set([...s].filter((id) => cohort.has(id)));
  type Pred = (e: Ev, v: Record<string, unknown>) => boolean;
  const mic: Pred = (e, v) => e.event === "v10_mic_result" && v.result === "granted";
  // Two app versions are live (2026-10-20): 1.9.x asks questions before the
  // recording; older builds go first screen → "This is me" → "I'm new" →
  // record. Both meet at "tap to record", so the questions are their own
  // section and the core funnel starts at the record tap.
  const stageDefs: { key: string; label: string; pred: Pred; group: "questions" | "core" }[] = [
    { key: "q_first", label: "Saw the first question", pred: is("v10_q_viewed", "hook"), group: "questions" },
    { key: "q_hook", label: "Answered the first question", pred: is("v10_q_answered", "hook"), group: "questions" },
    { key: "q_ready", label: "Finished the questions", pred: is("v10_q_answered", "ready"), group: "questions" },
    { key: "consent", label: "Agreed to AI processing", pred: is("v10_q_answered", "consent"), group: "questions" },
    { key: "start", label: "Tapped start recording", pred: is("v10_start_tapped"), group: "core" },
    { key: "mic", label: "Allowed the microphone", pred: mic, group: "core" },
    { key: "rec_start", label: "Started a recording", pred: is("v10_recording_started"), group: "core" },
    { key: "rec_done", label: "Finished the recording", pred: is("v10_recording_completed"), group: "core" },
    { key: "reveal", label: "Saw their results (reveal)", pred: is("v10_reveal_viewed"), group: "core" },
    { key: "paywall", label: "Saw the paywall", pred: is("v10_paywall_viewed"), group: "core" },
  ];
  const stages: { key: string; label: string; set: Set<string>; views: number; branch?: boolean; group: "questions" | "core" }[] = stageDefs.map((d, i) => ({
    key: d.key,
    label: d.label,
    set: i === 0 ? cohort : peopleWhere(d.pred),
    views: views(d.pred),
    group: d.group,
  }));
  // The paywall comes after sign-in, so everyone who saw it is identifiable.
  const paywallAll = peopleWhere(is("v10_paywall_viewed"));

  // Paywall outcomes. No purchase events yet (Jimmy is adding them), so a
  // store trial is read from the user record (subscriptionSource apple /
  // google). Skip = "Keep building" / "Later".
  const paywallSet = paywallAll;
  const skipped = peopleWhere((e) => e.event === "v10_keep_building_tapped" || e.event === "v10_save_later");
  const userIds = [...paywallSet].filter((id) => id.startsWith("c")); // cuid user ids
  const storeUsers = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, subscriptionSource: { in: ["apple", "google"] }, subscriptionStatus: { in: ["TRIAL", "PRO"] } },
        select: { id: true },
      })
    : [];
  const bought = new Set(storeUsers.map((u) => u.id));
  const trialSet = new Set([...paywallSet].filter((id) => bought.has(id)));
  const skipSet = new Set([...skipped].filter((id) => paywallSet.has(id) && !bought.has(id)));
  stages.push(
    { key: "trial", label: "Started an App Store / Play trial", set: trialSet, views: trialSet.size, branch: true, group: "core" },
    { key: "skip", label: "Skipped (“Keep building” / “Later”)", set: skipSet, views: skipSet.size, branch: true, group: "core" },
  );

  // Percentages run on views: most onboarding happens before sign-in with no
  // id, so per-person counts are a small subset until the app sends one.
  // Paywall outcomes are people (everyone at the paywall is signed in).
  // The paywall row and its outcomes are people (everyone there is signed
  // in); the steps before it are event counts.
  const paywallPeople = paywallSet.size || 1;
  const steps: AppFunnelStep[] = [];
  let top = 1;
  let prev = 1;
  let group = "";
  for (const s of stages) {
    const n = s.key === "paywall" ? paywallSet.size : s.views;
    if (s.group !== group) {
      group = s.group;
      top = n || 1;
      prev = n || 1;
    }
    const base = s.branch ? paywallPeople : prev;
    steps.push({ key: s.key, label: s.label, views: n, people: s.set.size, pctOfTop: Math.round((n / top) * 1000) / 10, pctOfPrev: Math.round((n / base) * 1000) / 10, branch: s.branch, group: s.group });
    if (!s.branch) prev = n || 1;
  }

  // ── Problems along the way (people) ─────────────────────────────────
  const problems = [
    { label: "Denied the microphone", people: inCohort(peopleWhere((e, v) => e.event === "v10_mic_result" && v.result !== "granted")).size },
    { label: "Recording failed to start", people: inCohort(peopleWhere(is("v10_recording_start_failed"))).size },
    { label: "Processing failed (had to retry)", people: inCohort(peopleWhere(is("v10_processing_failed"))).size },
  ];

  // ── Before sign-in: raw screen views (no per-person id yet) ─────────
  const raw = (name: string) => events.filter((e) => e.event === name).length;
  const preSignIn = [
    { label: "First screen views", views: raw("v10_start_viewed") },
    { label: "“This is me” screen views", views: raw("v10_recognition_viewed") },
    { label: "Tapped “I’m new”", views: raw("v10_start_new") },
    { label: "Tapped sign in (existing account)", views: raw("v10_signin_from_funnel") },
  ];
  const unlinked = events.filter((e) => !who(e)).length;

  // ── Web payers: the welcome flow ────────────────────────────────────
  const welcomeTop = peopleWhere(is("v10_welcome_viewed"));
  const welcome = [
    { label: "Opened the welcome flow", people: welcomeTop.size },
    { label: "Finished the welcome screens", people: peopleWhere(is("v10_welcome_completed")).size },
    { label: "Added a habit", people: peopleWhere(is("v10_welcome_habit_added")).size },
    { label: "Finished the app tour", people: peopleWhere(is("v10_welcome_tour_completed")).size },
  ];

  // Biggest drop between consecutive main steps.
  let biggest: { from: string; to: string; lost: number; pct: number } | null = null;
  const main = steps.filter((s) => !s.branch);
  for (let i = 1; i < main.length; i++) {
    if (main[i].group !== main[i - 1].group) continue;
    const lost = main[i - 1].views - main[i].views;
    const pct = main[i - 1].views ? Math.round((lost / main[i - 1].views) * 1000) / 10 : 0;
    if (lost > 0 && (!biggest || lost > biggest.lost)) biggest = { from: main[i - 1].label, to: main[i].label, lost, pct };
  }

  return { steps, problems, preSignIn, welcome, biggestDrop: biggest, totals: { events: events.length, unlinkedEvents: unlinked } };
}
