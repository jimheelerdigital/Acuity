/**
 * Re-seed demo@example.com (cmqfmxowu0000y9z6tpgh65jn) with realistic data
 * for App Store / Play Store screenshot capture.
 *
 * SCOPE — single user only. Verifies the email matches before any write and
 * aborts otherwise. Leaves the User identity + subscription (PRO) + trial +
 * emailVerified intact; only touches passwordHash + the derived stat fields
 * (currentStreak, totalRecordings). Deletes + recreates ONLY this user's:
 *   Entry, Theme, ThemeMention, Task, TaskGroup, Goal, UserInsight,
 *   UserAchievement, LifeMapArea, LifeMapAreaHistory.
 * All other users are untouched.
 *
 * Idempotent — safe to re-run (deletes-then-creates).
 *
 * Run (password REQUIRED — via flag or DEMO_USER_PASSWORD env, never hardcoded):
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/reseed-demo-user.ts --password 'YourDemoPassw0rd!'
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const TARGET_ID = "cmqfmxowu0000y9z6tpgh65jn";
const TARGET_EMAIL = "demo@example.com";
const BCRYPT_COST = 12;

const prisma = new PrismaClient();

/**
 * Password is REQUIRED and never hardcoded — pass `--password <value>` (min 8
 * chars) or set DEMO_USER_PASSWORD. Resolved before any DB write so a missing
 * password aborts immediately rather than half-seeding.
 */
function resolvePassword(): string {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--password");
  const pw = (i >= 0 ? argv[i + 1] : undefined) ?? process.env.DEMO_USER_PASSWORD;
  if (!pw || pw.length < 8) {
    console.error(
      "[reseed] Missing/short password. Pass --password <value> (min 8 chars) or set DEMO_USER_PASSWORD."
    );
    process.exit(1);
  }
  return pw;
}

const MOOD_SCORE: Record<string, number> = { GREAT: 5, GOOD: 4, NEUTRAL: 3, LOW: 2, ROUGH: 1 };

function at(daysAgo: number, hour: number, min = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d;
}
function sentimentFor(mood: string): string {
  if (mood === "GREAT" || mood === "GOOD") return "POSITIVE";
  if (mood === "ROUGH" || mood === "LOW") return "NEGATIVE";
  return "NEUTRAL";
}
function mostRecentSundayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

// ── Entry corpus — 27 reflective debriefs over the last 30 days ──────────────
// (daysAgo, hour, mood, energy, transcript, summary, themes[])
type Seed = { d: number; h: number; mood: string; energy: number; t: string; s: string; th: string[] };
const ENTRIES: Seed[] = [
  { d: 29, h: 22, mood: "ROUGH", energy: 2, t: "First real attempt at this. Honestly today was a lot — work spilled into the evening again and I snapped at the kids over nothing. I keep saying I'll protect the evenings and then I don't.", s: "Work bled into the evening; short-tempered at home.", th: ["Career", "Family"] },
  { d: 28, h: 21, mood: "LOW", energy: 2, t: "Didn't sleep well, maybe five hours. The whole day had that underwater feeling. Got through the standup but nothing creative landed.", s: "Poor sleep, foggy and uncreative.", th: ["Sleep", "Career"] },
  { d: 27, h: 8, mood: "NEUTRAL", energy: 3, t: "Tried the morning walk before logging on. It helped a little. Still anxious about the Q3 review but at least I started the day on my own terms.", s: "Morning walk before work; pre-review nerves.", th: ["Exercise", "Anxiety", "Career"] },
  { d: 26, h: 23, mood: "LOW", energy: 2, t: "Money stuff. Looked at the savings account and felt that drop in my stomach. We're fine, but 'fine' doesn't feel like enough of a cushion.", s: "Anxiety looking at savings.", th: ["Money", "Anxiety"] },
  { d: 24, h: 20, mood: "NEUTRAL", energy: 3, t: "Called Mom. She's doing okay. We talked for forty minutes and I realized I hadn't done that in weeks. Need to make it a standing thing.", s: "Long overdue call with Mom.", th: ["Family"] },
  { d: 23, h: 13, mood: "GOOD", energy: 4, t: "Lunch walk with Priya turned into a real conversation about the senior PM track. She thinks I'm closer than I think. Left feeling like maybe I'm not crazy for wanting it.", s: "Encouraging career chat with Priya.", th: ["Career", "Friendships", "Growth"] },
  { d: 22, h: 21, mood: "GOOD", energy: 4, t: "Made it to the gym for the first time in two weeks. Just twenty minutes but I feel like a person again.", s: "Back to the gym after a gap.", th: ["Exercise"] },
  { d: 21, h: 7, mood: "NEUTRAL", energy: 3, t: "Up early, quiet house. Wrote for fifteen minutes before anyone else was awake. This is the version of me I like.", s: "Quiet early-morning writing.", th: ["Creativity", "Growth"] },
  { d: 20, h: 22, mood: "ROUGH", energy: 1, t: "Hard day. The deploy broke, I missed the kids' bedtime, and I ate standing up at the counter at 9pm. One of those days where I'm just absorbing.", s: "Rough day: outage, missed bedtime.", th: ["Career", "Family"] },
  { d: 18, h: 20, mood: "NEUTRAL", energy: 3, t: "Better. Apologized to the kids for being short the other night and we actually had a good evening — board games, no screens. Small repair.", s: "Repaired with the kids; screen-free evening.", th: ["Family"] },
  { d: 16, h: 12, mood: "GOOD", energy: 4, t: "The Q3 review went better than the story I'd been telling myself. My manager flagged the onboarding work specifically. Filing that away for the promo case.", s: "Q3 review went well; promo signal.", th: ["Career", "Growth"] },
  { d: 15, h: 21, mood: "GOOD", energy: 4, t: "Date night. We actually talked instead of scrolling. I forget how much I like him when we're not just running logistics at each other.", s: "Connected date night with partner.", th: ["Relationship"] },
  { d: 13, h: 9, mood: "NEUTRAL", energy: 3, t: "Signed up for the pottery class I keep talking about. Felt silly and also kind of thrilling. First one is Thursday.", s: "Signed up for pottery class.", th: ["Creativity", "Fun"] },
  { d: 13, h: 23, mood: "LOW", energy: 2, t: "Couldn't fall asleep, mind racing about the mortgage renewal. Why is it always money at midnight.", s: "Late-night money rumination.", th: ["Money", "Sleep", "Anxiety"] },
  { d: 12, h: 18, mood: "GOOD", energy: 4, t: "Ran 4k without stopping. Three months ago I couldn't do one. The 10k in spring suddenly feels real.", s: "Ran 4k — 10k goal feels reachable.", th: ["Exercise", "Growth"] },
  { d: 11, h: 21, mood: "GOOD", energy: 4, t: "Dinner with Sam and Ade. Laughed until I cried about nothing. I need more of this and I let it slide first when things get busy.", s: "Restorative dinner with friends.", th: ["Friendships"] },
  { d: 9, h: 8, mood: "NEUTRAL", energy: 3, t: "Pottery was messy and humbling and I loved it. My bowl looks like a sad ashtray. Going back.", s: "First pottery class — humbling, fun.", th: ["Creativity", "Fun"] },
  { d: 8, h: 20, mood: "GOOD", energy: 4, t: "Booked the 1:1 with my skip-level to actually float the promotion. Scary to say it out loud but I did the brave thing today.", s: "Set up promo conversation with skip-level.", th: ["Career", "Growth"] },
  { d: 7, h: 22, mood: "NEUTRAL", energy: 3, t: "Tired but okay. Read to the kids, lights out on time. The small systems are starting to hold.", s: "Calm evening; routines holding.", th: ["Family"] },
  { d: 6, h: 7, mood: "GREAT", energy: 5, t: "Woke up before the alarm actually rested. Walked, journaled, made real coffee. I don't know what I did right but I want to bottle it.", s: "Genuinely rested morning.", th: ["Sleep", "Exercise"] },
  { d: 6, h: 19, mood: "GOOD", energy: 4, t: "Partner and I mapped out a loose budget for the year together instead of me white-knuckling it alone. The money fear got a little smaller.", s: "Shared budget planning eased money stress.", th: ["Money", "Relationship"] },
  { d: 5, h: 13, mood: "GOOD", energy: 4, t: "Mentored the new hire for an hour and remembered I'm actually good at this. Helping someone else find their footing is its own kind of clarity.", s: "Rewarding mentoring session.", th: ["Career", "Growth"] },
  { d: 4, h: 21, mood: "NEUTRAL", energy: 3, t: "Quiet one. Nothing dramatic. Folded laundry, watched a show, in bed early. Not every day needs to be a story.", s: "Low-key restful evening.", th: ["Family"] },
  { d: 3, h: 9, mood: "GOOD", energy: 4, t: "Ran 5k. New distance record. The body remembers more than I give it credit for.", s: "5k run — new personal best.", th: ["Exercise", "Growth"] },
  { d: 3, h: 22, mood: "GOOD", energy: 4, t: "Long call with my sister, the good kind. We're planning a weekend with Mom in the spring. Family feels less like a duty this month and more like a place I want to be.", s: "Warm call with sister; spring plans.", th: ["Family"] },
  { d: 1, h: 20, mood: "GREAT", energy: 5, t: "Skip-level went well — she said the promo case is strong and to keep documenting. I floated it, I survived, and the answer was basically yes-if. Proud of myself for not shrinking.", s: "Promo conversation landed well.", th: ["Career", "Growth"] },
  { d: 0, h: 21, mood: "GOOD", energy: 4, t: "Looking back at the month tonight. There were some genuinely hard days early on, but the shape of it is upward. More movement, more sleep, more actual conversations. I want to keep this going.", s: "Month-end reflection — upward arc.", th: ["Growth", "Sleep"] },
];

// ── Themes (relational, for the Theme Map) ───────────────────────────────────
const THEME_NAMES = ["Career", "Family", "Sleep", "Exercise", "Anxiety", "Friendships", "Money", "Creativity", "Relationship", "Growth", "Fun"];

// ── Life areas — current scores moved off the 50 baseline (upward overall) ───
const LIFE_AREAS = [
  { area: "CAREER",          name: "Career",              color: "#3B82F6", icon: "briefcase",     score100: 72, trend: "up",     w: 4,  m: 11, mentions: 9, topThemes: ["Career", "Growth"] },
  { area: "MONEY",           name: "Money",               color: "#F59E0B", icon: "wallet",        score100: 57, trend: "up",     w: 2,  m: 4,  mentions: 4, topThemes: ["Money"] },
  { area: "ROMANCE",         name: "Romance",             color: "#EC4899", icon: "heart",         score100: 65, trend: "up",     w: 3,  m: 7,  mentions: 3, topThemes: ["Relationship"] },
  { area: "FAMILY",          name: "Family",              color: "#F43F5E", icon: "people",        score100: 70, trend: "up",     w: 3,  m: 9,  mentions: 8, topThemes: ["Family"] },
  { area: "FRIENDS",         name: "Friends & Community", color: "#14B8A6", icon: "people-circle", score100: 54, trend: "down",   w: -2, m: -3, mentions: 2, topThemes: ["Friendships"] },
  { area: "PHYSICAL_HEALTH", name: "Physical Health",     color: "#84CC16", icon: "fitness",       score100: 63, trend: "up",     w: 5,  m: 10, mentions: 6, topThemes: ["Exercise", "Sleep"] },
  { area: "MENTAL_HEALTH",   name: "Mental Health",       color: "#8B5CF6", icon: "happy",         score100: 66, trend: "up",     w: 4,  m: 13, mentions: 5, topThemes: ["Anxiety"] },
  { area: "GROWTH",          name: "Growth & Learning",   color: "#A855F7", icon: "leaf",          score100: 75, trend: "up",     w: 3,  m: 12, mentions: 7, topThemes: ["Growth"] },
  { area: "FUN",             name: "Fun",                 color: "#F97316", icon: "color-palette", score100: 52, trend: "up",     w: 2,  m: 4,  mentions: 2, topThemes: ["Creativity", "Fun"] },
  { area: "PURPOSE",         name: "Purpose & Meaning",   color: "#6366F1", icon: "compass",       score100: 62, trend: "stable", w: 0,  m: 5,  mentions: 3, topThemes: ["Growth"] },
];

const TASK_GROUPS = [
  { name: "Work",     icon: "briefcase", color: "#3B82F6" },
  { name: "Personal", icon: "sparkles",  color: "#A855F7" },
  { name: "Health",   icon: "fitness",   color: "#84CC16" },
];

const GOALS = [
  { title: "Run a 10k by spring",        description: "Build from 5k to 10k with two runs a week.",          lifeArea: "PHYSICAL_HEALTH", progress: 50 },
  { title: "Make the senior PM case",    description: "Document wins and have the promotion conversation.",   lifeArea: "CAREER",          progress: 65 },
  { title: "Read 12 books this year",    description: "One a month — fiction and non-fiction.",               lifeArea: "GROWTH",          progress: 33 },
  { title: "Build a 3-month cushion",    description: "Steady transfers into the emergency fund.",            lifeArea: "MONEY",           progress: 45 },
];

const ACHIEVEMENTS = [
  { id: "ach_e33029ac103244c281ca08d59ed638d1", days: 29, points: 10 }, // first_night
  { id: "ach_33bda9fb7ab949139a207eca5161bcdd", days: 27, points: 20 }, // first_theme
  { id: "ach_ef7a1fc31f894aac927744b8afc95949", days: 22, points: 25 }, // week_one
  { id: "ach_0f065105b64c4af3a885424ae289aae0", days: 20, points: 20 }, // goal_setter
  { id: "ach_aa8a52ea00ad47fba73eb13ac6dc6719", days: 15, points: 50 }, // fortnight
  { id: "ach_3ebe7cdd422341f5a1ebe0a14a283954", days: 13, points: 20 }, // night_owl
  { id: "ach_4df2ccd959c64ad29a0131c6c889fd14", days: 9,  points: 30 }, // theme_map
];

async function main() {
  const password = resolvePassword();

  // ── safety: confirm we're touching the right single user ──
  const user = await prisma.user.findUnique({
    where: { id: TARGET_ID },
    select: { id: true, email: true },
  });
  if (!user) throw new Error(`Target user ${TARGET_ID} not found — aborting.`);
  if (user.email !== TARGET_EMAIL) {
    throw new Error(`SAFETY ABORT: ${TARGET_ID} email is "${user.email}", expected "${TARGET_EMAIL}".`);
  }
  console.log(`[reseed] target confirmed: ${user.email} (${user.id})`);

  // ── delete (scoped to this user only) ──
  const wh = { userId: TARGET_ID };
  await prisma.userAchievement.deleteMany({ where: wh });
  await prisma.userInsight.deleteMany({ where: wh });
  await prisma.task.deleteMany({ where: wh });
  await prisma.goal.deleteMany({ where: wh });
  await prisma.theme.deleteMany({ where: wh });            // cascades ThemeMention via themeId
  await prisma.entry.deleteMany({ where: wh });            // cascades remaining ThemeMention via entryId
  await prisma.taskGroup.deleteMany({ where: wh });
  await prisma.lifeMapAreaHistory.deleteMany({ where: wh });
  await prisma.lifeMapArea.deleteMany({ where: wh });
  console.log(`[reseed] cleared prior data for ${TARGET_ID}`);

  // ── entries ──
  const entryIds: string[] = [];
  for (const e of ENTRIES) {
    const when = at(e.d, e.h);
    const row = await prisma.entry.create({
      data: {
        userId: TARGET_ID,
        transcript: e.t,
        summary: e.s,
        mood: e.mood,
        moodScore: MOOD_SCORE[e.mood],
        energy: e.energy,
        themes: e.th,
        wins: [],
        blockers: [],
        status: "COMPLETE",
        extracted: true,
        extractionCommittedAt: when,
        entryDate: when,
        createdAt: when,
      },
      select: { id: true },
    });
    entryIds.push(row.id);
  }
  console.log(`[reseed] created ${entryIds.length} entries`);

  // ── themes + mentions ──
  const themeId: Record<string, string> = {};
  for (const name of THEME_NAMES) {
    const th = await prisma.theme.create({ data: { userId: TARGET_ID, name }, select: { id: true } });
    themeId[name] = th.id;
  }
  let mentionCount = 0;
  for (let i = 0; i < ENTRIES.length; i++) {
    const e = ENTRIES[i];
    const when = at(e.d, e.h);
    for (const name of e.th) {
      if (!themeId[name]) continue;
      await prisma.themeMention.create({
        data: { themeId: themeId[name], entryId: entryIds[i], sentiment: sentimentFor(e.mood), createdAt: when },
      });
      mentionCount++;
    }
  }
  console.log(`[reseed] created ${THEME_NAMES.length} themes + ${mentionCount} mentions`);

  // ── task groups ──
  const groupId: Record<string, string> = {};
  for (let i = 0; i < TASK_GROUPS.length; i++) {
    const g = TASK_GROUPS[i];
    const row = await prisma.taskGroup.create({
      data: { userId: TARGET_ID, name: g.name, icon: g.icon, color: g.color, order: i, isAIGenerated: true },
      select: { id: true },
    });
    groupId[g.name] = row.id;
  }

  // ── goals ──
  const goalId: string[] = [];
  for (const g of GOALS) {
    const row = await prisma.goal.create({
      data: {
        userId: TARGET_ID,
        title: g.title,
        description: g.description,
        lifeArea: g.lifeArea,
        status: "IN_PROGRESS",
        progress: g.progress,
        progressNotes: [],
        entryRefs: [],
        lastMentionedAt: at(2, 9),
      },
      select: { id: true },
    });
    goalId.push(row.id);
  }
  console.log(`[reseed] created ${GOALS.length} goals + ${TASK_GROUPS.length} task groups`);

  // ── tasks (mix of open + done) ──
  const tasks = [
    { title: "Document the onboarding wins for the promo case", status: "DONE",  group: "Work",     goal: 1, done: 1 },
    { title: "Book the spring weekend with Mom + sis",           status: "OPEN",  group: "Personal", goal: null, due: -20 },
    { title: "Two runs this week (Tue / Sat)",                   status: "OPEN",  group: "Health",   goal: 0, due: -3 },
    { title: "Set up auto-transfer to the emergency fund",       status: "DONE",  group: "Personal", goal: 3, done: 6 },
    { title: "Reply to the pottery studio about the next term",  status: "OPEN",  group: "Personal", goal: null, due: -5 },
    { title: "Prep talking points for the skip-level 1:1",       status: "DONE",  group: "Work",     goal: 1, done: 2 },
    { title: "Schedule the kids' dentist appointments",          status: "OPEN",  group: "Personal", goal: null, due: -7 },
  ];
  for (const t of tasks) {
    await prisma.task.create({
      data: {
        userId: TARGET_ID,
        title: t.title,
        text: t.title,
        status: t.status,
        priority: "MEDIUM",
        groupId: groupId[t.group] ?? null,
        goalId: t.goal != null ? goalId[t.goal] : null,
        dueDate: t.due != null ? at(t.due, 9) : null,
        completedAt: t.done != null ? at(t.done, 18) : null,
      },
    });
  }
  console.log(`[reseed] created ${tasks.length} tasks`);

  // ── life map areas (+ weekly history showing the climb) ──
  const sun = mostRecentSundayUTC();
  for (let i = 0; i < LIFE_AREAS.length; i++) {
    const a = LIFE_AREAS[i];
    await prisma.lifeMapArea.create({
      data: {
        userId: TARGET_ID,
        area: a.area,
        name: a.name,
        color: a.color,
        icon: a.icon,
        sortOrder: i,
        score: Math.round(a.score100 / 10),
        score100: a.score100,
        baselineScore: 50,
        trend: a.trend,
        weeklyDelta: a.w,
        monthlyDelta: a.m,
        mentionCount: a.mentions,
        topThemes: a.topThemes,
        activeGoals: GOALS.filter((g) => g.lifeArea === a.area).length,
        lastMentioned: at(2, 20),
        historicalHigh: Math.max(a.score100, 50),
        historicalLow: Math.min(a.score100 - a.m, 50),
        summary: null,
      },
    });
    // 5 weekly snapshots climbing toward the current score
    for (let w = 4; w >= 0; w--) {
      const weekStart = new Date(sun);
      weekStart.setUTCDate(weekStart.getUTCDate() - w * 7);
      const score = Math.round(a.score100 - (a.m * w) / 4);
      await prisma.lifeMapAreaHistory.create({
        data: { userId: TARGET_ID, area: a.area, score, weekStart },
      });
    }
  }
  console.log(`[reseed] created ${LIFE_AREAS.length} life-map areas + weekly history`);

  // ── insights ──
  const insights = [
    { text: "Your Mental Health score climbed 13 points this month — the morning walks keep showing up alongside your better days.", severity: "POSITIVE", area: "MENTAL_HEALTH" },
    { text: "Sleep came up in several entries this month, usually on the days your energy dipped. Worth protecting.", severity: "NEUTRAL", area: "PHYSICAL_HEALTH" },
    { text: "Friends were mentioned less this month than last. The dinners you do make seem to recharge you.", severity: "CONCERNING", area: "FRIENDS" },
    { text: "Career and Growth are moving together — your learning is feeding your work, not competing with it.", severity: "POSITIVE", area: "CAREER" },
  ];
  for (const ins of insights) {
    await prisma.userInsight.create({
      data: { userId: TARGET_ID, observationText: ins.text, severity: ins.severity, linkedAreaId: ins.area, generationModel: "heuristic", createdAt: at(1, 8) },
    });
  }
  console.log(`[reseed] created ${insights.length} insights`);

  // ── achievements (link to global catalog) ──
  for (const a of ACHIEVEMENTS) {
    await prisma.userAchievement.create({
      data: { userId: TARGET_ID, achievementId: a.id, earnedAt: at(a.days, 21), shownToUser: true, shownAt: at(a.days, 21), pointsAwarded: a.points },
    });
  }
  console.log(`[reseed] created ${ACHIEVEMENTS.length} achievements`);

  // ── user: password + derived stats only (identity/subscription untouched) ──
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await prisma.user.update({
    where: { id: TARGET_ID },
    data: { passwordHash, currentStreak: 10, totalRecordings: ENTRIES.length },
  });
  console.log(`[reseed] set passwordHash + currentStreak=10 + totalRecordings=${ENTRIES.length}`);

  console.log(`\n[reseed] DONE for ${TARGET_EMAIL}`);
}

main()
  .catch((err) => {
    console.error("[reseed] threw:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
