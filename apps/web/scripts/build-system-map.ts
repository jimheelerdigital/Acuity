/**
 * Builds the admin System Map (/admin/system-map) from the codebase.
 *
 *   npx tsx apps/web/scripts/build-system-map.ts
 *
 * Scans web, mobile and packages/shared source files and writes
 * apps/web/src/data/system-map.json: every file tagged with the system
 * it belongs to, plus what ties files together (imports, calls from a
 * screen/page to an API route, Inngest events), the database tables
 * each file touches, the outside services it calls, and every Inngest
 * job with its schedule and whether it's registered (live).
 *
 * The SYSTEMS list below is the hand-curated part: which folders/files
 * make up "the content factory", "payments" and so on. First matching
 * rule wins, so specific systems sit above broad ones. Anything no rule
 * claims lands in "Core platform". Re-run after adding a new area and
 * check the "Core platform" bucket didn't swallow it.
 *
 * Runs on every web build (prebuild) so the map tracks main; the
 * committed JSON is the fallback if the scan ever fails.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const OUT = path.join(ROOT, "apps/web/src/data/system-map.json");

type Group = "product" | "mobile" | "money" | "growth" | "social" | "infra";
type Status = "live" | "partial" | "retired";

interface SystemDef {
  id: string;
  label: string;
  group: Group;
  description: string;
  status?: Status;
  statusNote?: string;
  match: RegExp;
}

// Order matters: first match wins.
const SYSTEMS: SystemDef[] = [
  // ── Mobile app ──────────────────────────────────────────────────
  {
    id: "mobile-billing",
    label: "App purchases",
    group: "mobile",
    description:
      "The in-app paywall and subscriptions on iPhone and Android: Apple/Google purchases through RevenueCat, restore purchases, web-subscriber redemption.",
    match: /^apps\/mobile\/.*(iap|revenuecat|paywall|subscri|pricing|purchase|redemption|withdrawal|trial)/i,
  },
  {
    id: "mobile-notify",
    label: "App reminders & widgets",
    group: "mobile",
    description:
      "Push notifications, reminder scheduling, home-screen widgets, Siri shortcuts and quick actions in the mobile app.",
    match: /^apps\/mobile\/.*(notification|push|reminder|widget|siri|quick-action|targets\/|badge)/i,
  },
  {
    id: "mobile-onboarding",
    label: "App onboarding & sign-in",
    group: "mobile",
    description:
      "First-run flow in the mobile app: welcome screens, onboarding versions (v10/v11), sign in with Apple/Google/email, setup.",
    match: /^apps\/mobile\/.*(onboarding|welcome|\(auth\)|auth|setup|session|token-bridge|app-lock|security|lock-screen)/i,
  },
  {
    id: "mobile-app",
    label: "Mobile app",
    group: "mobile",
    description:
      "The Ripple iPhone/Android app (Expo): recording a Debrief, home, tasks, habits, goals, insights, Life Matrix, settings.",
    match: /^apps\/mobile\//,
  },
  {
    id: "shared",
    label: "Shared code",
    group: "infra",
    description:
      "Code both the web and mobile apps use: pricing plans, free-tier rules, habit rules, progression, copy and theme.",
    match: /^packages\/shared\//,
  },

  // ── Social content / growth engines ─────────────────────────────
  {
    id: "mythicals",
    label: "Legendary Mythicals",
    group: "social",
    description:
      "The third brand: daily 'which one is you?' fantasy video posts (Kling clips + music), YouTube Shorts, legendarymythicals.com and its quiz.",
    match: /mythic|egg-hatch|app\/lm\//i,
  },
  {
    id: "jev",
    label: "Jev (judge & ranker)",
    group: "social",
    description:
      "The decision layer: drafts several options, sense-checks them, ranks with the weekly brief, and recalibrates against real post performance.",
    match: /(\/|-)jev|candidate-(calibration|pipeline)|gate-calibration|publish-gate|cover-picker|learning-health|weekly-brief/i,
  },
  {
    id: "research",
    label: "Research engine",
    group: "social",
    description:
      "Weekly competitor and niche research: scrapes competitors (Apify), Reddit and hashtags, then writes briefs that feed posts and ads.",
    match: /content-factory\/(research|competitor-|niche-research|reddit-trends|hashtag-trends|growthos|trend-report)|functions\/(competitor-scrape|niche-|reddit-trends|lane-intelligence)|api\/admin\/(research|niche|trends)|content-factory\/niche/i,
  },
  {
    id: "content-factory",
    label: "Social content factory",
    group: "social",
    description:
      "Makes and posts the daily Ripple and BWK content: carousels, pick posts, lists, animated covers, reels and voiced videos, then auto-posts to Instagram, Facebook, YouTube and TikTok and tracks how they do.",
    match: /content-factory|carousel|voiced|social-|music-|storyboard|performance-loop|quote-loop|living-reel|tiktok|youtube|threads|top-videos|video-compare|save-video|\/tts\//i,
  },
  {
    id: "adlab",
    label: "AdLab (Meta ads)",
    group: "growth",
    description:
      "The paid ads engine: writes and generates ads, launches them on Meta in their own ad sets, applies the cost-per-trial verdict rules daily, and researches competitor ads.",
    match: /adlab|meta-spend|AdsTab/i,
  },
  {
    id: "ugc-creators",
    label: "UGC & creators",
    group: "growth",
    description:
      "Creator partnerships: the creator platform (referral links, 25% revenue share, payouts) and UGC ad tooling.",
    status: "partial",
    statusNote: "Creator scraping/outreach retired 10-21 (Keenan uses a ChatGPT agent); UGC ad tooling and creator payouts still live.",
    match: /ugc|creator/i,
  },
  {
    id: "seo",
    label: "SEO & blog",
    group: "growth",
    description:
      "Search traffic: the auto-blog (writes, refreshes and prunes posts), comparison and 'best app' pages, the research data page, sitemap, Google Search Console.",
    match: /auto-blog|blog|seo|sitemap|robots\.ts|app\/(for|compare|alternatives|best-ai-journaling-apps|voice-journaling|mental-load|brain-dump-app|habit-tracker-app|mood-tracker-app|ai-journal-app|research)\/|persona-pages|compare-data|lib\/google\/|indexing/i,
  },

  // ── Money ───────────────────────────────────────────────────────
  {
    id: "founder-reports",
    label: "Founder reports",
    group: "money",
    description:
      "What lands in Keenan and Jimmy's inboxes and Slack: the nightly 'Ripple today' email, the Saturday weekly digest, signup/payment alerts.",
    match: /founder-|weekly-metrics|stripe-webhook-health|social-health-check/i,
  },
  {
    id: "lifecycle-email",
    label: "User emails & push",
    group: "money",
    description:
      "Emails and notifications to users: trial countdown, payment-failed, win-back, recovery, drips, weekly digest, reminders, release announcements.",
    match: /app\/api\/(emails|webhooks\/resend|cron\/waitlist)|src\/emails\/|drip|winback|recovery|trial-countdown|trial-email|trial-expiration|rc-trial-reminder|notification|day2|push|waitlist|download-reminder|release-(announce|email)|resend|email-(tokens|enabled|variants)|weekly-digest|monthly-digest|send-email|apple-duplicate|payment-failed/i,
  },
  {
    id: "billing",
    label: "Payments & subscriptions",
    group: "money",
    description:
      "Who has paid and what they can use: Stripe checkout and webhooks, Apple/Google receipts, RevenueCat, entitlements, pricing and the price test.",
    match: /stripe|revenuecat|rc-|iap|entitlement|subscri|billing|pricing|price-test|paywall-compare|app-access|free-cap|free-tier|link-apple|comp\/|cancel|past-due|payment-failure|pro-locked|locked-feature|founding-member/i,
  },
  {
    id: "analytics",
    label: "Tracking & attribution",
    group: "money",
    description:
      "Where signups came from and what they did: Meta pixel + Conversions API, PostHog, GA4, ad attribution, onboarding events, internal-traffic filtering.",
    match: /capi|meta-(event|match|pixel)|posthog|attribution|acquisition|internal-traffic|onboarding-events|track-|tracking|google-analytics|analytics|experiments|consent/i,
  },
  {
    id: "funnel",
    label: "Web signup funnel",
    group: "money",
    description:
      "The path from an ad to a paid trial on the web: /start and test funnels, the A/B split, quiz screens, first Debrief, password step, paywall and checkout handoff.",
    match: /app\/(start|start-test|start-bwk|start-test-bwk|try|upgrade|pro-trial|free-month|free-week|go|get|open|with|u|onboarding)\/|funnel|(^|\/)try-|try-(recording|debrief|session|result|it)|paywall|checkout|first-debrief|welcome|onboarding|free-(month|week)|pay-in-browser/i,
  },

  // ── Product (Ripple itself) ─────────────────────────────────────
  {
    id: "recording",
    label: "Debrief processing",
    group: "product",
    description:
      "What happens after someone records: upload, transcription, then AI pulls out tasks, mood, themes and people, and the result is shown back.",
    match: /process-entry|entry-|\/record|audio|whisper|transcri|extraction|pipeline\.ts|direct-upload|recording|handwriting|\/entries|processing|mic-test|debrief/i,
  },
  {
    id: "insights",
    label: "Insights & reports",
    group: "product",
    description:
      "The 'what's really going on' layer: weekly report, State of Me, Life Audit, Life Matrix, patterns, people, memory, lifts & drains.",
    match: /insight|weekly-report|state-of-me|life-audit|lifemap|life-matrix|life-map|memory|pattern|people|theme-map|theme-detail|wrapped|lifts-drains|how-you-talk|open-loops|follow-through|first-read|recommendation|api\/weekly|comparisons|health-correlations|day-7-audit|daily-snapshot|red-flags|evidence|\/why|embeddings/i,
  },
  {
    id: "habits-tasks",
    label: "Habits, tasks & goals",
    group: "product",
    description:
      "Turning words into action: tasks and task groups, habits and streaks, goals, achievements, progression and plan-my-day.",
    match: /habit|task|goal|achievement|progression|streak|plan-day|day-plan|focus|milestone|unlock/i,
  },
  {
    id: "calendar",
    label: "Calendar sync",
    group: "product",
    description: "Two-way sync of tasks with Google/Apple calendars.",
    match: /calendar/i,
  },
  {
    id: "mcp",
    label: "AI connectors (MCP)",
    group: "product",
    description:
      "Lets people connect Ripple to Claude/ChatGPT (MCP server + OAuth) and export to Obsidian.",
    match: /mcp|oauth|obsidian/i,
  },
  {
    id: "web-app",
    label: "Web app",
    group: "product",
    description:
      "The signed-in Ripple website: home, entries, account, settings, and the shared app shell and UI pieces.",
    match: /app\/(dashboard|home|account|entries|shared|delete-account|c)\/|api\/(home|user|feedback|backfill)\/|src\/contexts\/|backfill-banner|crisis-footer|recommended-activity|components\/(acuity|app-shell|nav-bar|user-menu|page-|skeleton|theme-toggle|checkbox|back-button|providers|keyboard|web-tour|mood)|web-tour|themes?\b|display-name|mood/i,
  },
  {
    id: "auth",
    label: "Accounts & sign-in",
    group: "infra",
    description:
      "Sign-up, sign-in (email code, password, Apple, Google), sessions, account deletion.",
    match: /auth|session|password|email-code|bootstrap-user|mobile-session|deleted-user|account|sign/i,
  },
  {
    id: "admin",
    label: "Admin dashboard",
    group: "infra",
    description:
      "This dashboard: Command Center, funnel and business metrics, users, AI costs, settings and the admin tools.",
    match: /\/admin\b|admin-/i,
  },
  {
    id: "marketing-site",
    label: "Marketing site",
    group: "growth",
    description:
      "goripple.io's public pages: homepage, why, roadmap, what's new, privacy/terms/support, testimonials and positioning copy.",
    match: /app\/(page\.tsx|layout\.tsx|privacy|terms|support|roadmap|whats-new|landing-page|founding-members|not-found)|components\/marketing|landing|testimonial|social-proof|positioning|roadmap|app-store-cta|install/i,
  },
  {
    id: "platform",
    label: "Core platform",
    group: "infra",
    description:
      "The plumbing everything sits on: database client, background jobs (Inngest), feature flags, rate limits, logging, error tracking.",
    match: /.*/,
  },
];

interface ServiceDef {
  id: string;
  label: string;
  match: RegExp;
}

const SERVICES: ServiceDef[] = [
  { id: "claude", label: "Anthropic Claude", match: /@anthropic-ai\/sdk|ANTHROPIC_API_KEY/ },
  { id: "openai", label: "OpenAI", match: /from ["']openai["']|OPENAI_API_KEY|api\.openai\.com|ACUITY_ADLAB_OPENAI_KEY/ },
  { id: "openrouter", label: "OpenRouter", match: /OPENROUTER|openrouter\.ai/ },
  { id: "stripe", label: "Stripe", match: /from ["']stripe["']|@stripe\/|STRIPE_SECRET_KEY|api\.stripe\.com/ },
  { id: "revenuecat", label: "RevenueCat", match: /react-native-purchases|@revenuecat|api\.revenuecat\.com|RC_SECRET_KEY/ },
  { id: "apple", label: "Apple (App Store / Sign in)", match: /APPLE_IAP|api\.storekit|appleid\.apple\.com|expo-apple-authentication|APPLE_CLIENT_ID|searchads/i },
  { id: "google-play", label: "Google Play", match: /GOOGLE_PLAY|androidpublisher/ },
  { id: "meta", label: "Meta (FB / IG / Ads)", match: /graph\.facebook\.com|graph\.instagram\.com|META_ACCESS_TOKEN|META_AD_ACCOUNT|IG_ACCESS_TOKEN|META_PIXEL_ID|fbq\(|react-native-fbsdk/ },
  { id: "tiktok", label: "TikTok", match: /tiktokapis|TIKTOK_CLIENT/ },
  { id: "youtube", label: "YouTube", match: /youtube\/v3|upload\/youtube|YOUTUBE_API_KEY/ },
  { id: "threads", label: "Threads", match: /graph\.threads\.net/ },
  { id: "higgsfield", label: "Higgsfield (Kling video)", match: /HIGGSFIELD_|higgsfield\.ai/ },
  { id: "fal", label: "fal.ai", match: /FAL_KEY|fal\.run|@fal-ai/ },
  { id: "elevenlabs", label: "ElevenLabs (voice)", match: /ELEVENLABS|elevenlabs\.io/ },
  { id: "resend", label: "Resend (email)", match: /from ["']resend["']|RESEND_API_KEY|@\/lib\/resend["']/ },
  { id: "posthog", label: "PostHog", match: /posthog/i },
  { id: "supabase", label: "Supabase storage", match: /@supabase\/|SUPABASE_SERVICE_ROLE_KEY|supabase\.storage/ },
  { id: "apify", label: "Apify (scraping)", match: /APIFY_|api\.apify\.com/ },
  { id: "reddit", label: "Reddit", match: /reddit\.com\/r\/|REDDIT_USER_AGENT|oauth\.reddit/ },
  { id: "google", label: "Google (Analytics / Search / Calendar)", match: /GA4_|GSC_PROPERTY|searchconsole|webmasters\/v3|@google-analytics|googleapis\.com\/calendar|NEXT_PUBLIC_GA_MEASUREMENT_ID|indexing\.googleapis/ },
  { id: "slack", label: "Slack", match: /SLACK_[A-Z_]*WEBHOOK/ },
  { id: "upstash", label: "Upstash Redis", match: /@upstash\// },
  { id: "sentry", label: "Sentry", match: /@sentry\/(nextjs|react-native)/ },
  { id: "expo-push", label: "Expo push", match: /exp\.host\/--\/api\/v2\/push|expo-server-sdk/ },
  { id: "growthos", label: "GrowthOS", match: /GROWTHOS_/ },
];

// ── File discovery ────────────────────────────────────────────────

const SCAN_DIRS = [
  "apps/web/src",
  "apps/mobile/app",
  "apps/mobile/components",
  "apps/mobile/lib",
  "apps/mobile/hooks",
  "apps/mobile/contexts",
  "packages/shared/src",
];
const SKIP = /(\.test\.|\.spec\.|__tests__|\/tests\/|node_modules|\.d\.ts$)/;

function walk(dir: string, out: string[]) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full);
    if (SKIP.test(rel)) continue;
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
}

const files: string[] = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);
files.sort();
const fileIndex = new Map(files.map((f, i) => [f, i]));
const source = new Map(files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

function systemFor(file: string): string {
  return SYSTEMS.find((s) => s.match.test(file))!.id;
}

function kindFor(file: string): string {
  if (/^apps\/web\/src\/app\/api\/.*\/route\.tsx?$/.test(file)) return "route";
  if (/^apps\/web\/src\/app\/.*\/page\.tsx$|^apps\/web\/src\/app\/page\.tsx$/.test(file)) return "page";
  if (/^apps\/web\/src\/inngest\/functions\//.test(file)) return "job";
  if (/^apps\/mobile\/app\//.test(file)) return "screen";
  if (/\/components\//.test(file)) return "component";
  return "lib";
}

/** URL a Next page/route file serves, with route groups dropped. */
function urlFor(file: string): string | null {
  const m = file.match(/^apps\/web\/src\/app(\/.*)?\/(page|route)\.tsx?$/);
  if (!m) return null;
  const segs = (m[1] ?? "").split("/").filter((s) => s && !/^\(.*\)$/.test(s));
  return "/" + segs.join("/");
}

/** First sentence of the file's leading comment, as a plain summary. */
function summaryFor(text: string): string {
  const m = text.match(/^\s*(?:["']use (?:client|server)["'];?\s*)?(?:\/\*\*?([\s\S]*?)\*\/|((?:\s*\/\/.*\n)+))/);
  if (!m) return "";
  const raw = (m[1] ?? m[2] ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*(\*|\/\/)\s?/, "").trim())
    .filter((l) => l && !l.startsWith("@") && !/^(GET|POST|PUT|PATCH|DELETE)\b/.test(l) && !/^eslint/.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = raw.match(/^.{20,220}?[.!?](\s|$)/)?.[0] ?? raw.slice(0, 200);
  return sentence.trim();
}

// ── Import resolution ─────────────────────────────────────────────

function aliasRoot(file: string): string {
  if (file.startsWith("apps/mobile/")) return "apps/mobile";
  return "apps/web/src";
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec === "@acuity/shared") base = "packages/shared/src/index";
  else if (spec.startsWith("@acuity/shared/")) base = "packages/shared/src/" + spec.slice(15);
  else if (spec.startsWith("@/")) base = path.posix.join(aliasRoot(from), spec.slice(2));
  else if (spec.startsWith(".")) base = path.posix.join(path.posix.dirname(from), spec);
  else return null;
  base = base.replace(/\.(js|ts|tsx)$/, "");
  for (const c of [base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx", base]) {
    if (fileIndex.has(c)) return c;
  }
  return null;
}

const IMPORT_RE = /(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

// ── API route table (for screen/page → route edges) ───────────────

const routes = files
  .filter((f) => kindFor(f) === "route")
  .map((f) => {
    const url = urlFor(f)!;
    const re = new RegExp(
      "^" + url.split("/").map((s) => (/^\[.*\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/") + "/?$"
    );
    return { file: f, url, re, specificity: url.split("/").filter((s) => !s.startsWith("[")).length };
  })
  .sort((a, b) => b.specificity - a.specificity);

function resolveApi(url: string): string | null {
  const clean = url.replace(/\$\{[^}]*\}/g, "x").split("?")[0].replace(/\/$/, "");
  return routes.find((r) => r.re.test(clean))?.file ?? null;
}

// ── Prisma models ─────────────────────────────────────────────────

const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
const modelByAccessor = new Map(models.map((m) => [m[0].toLowerCase() + m.slice(1), m]));

// ── Inngest functions ─────────────────────────────────────────────

const inngestRoute = source.get("apps/web/src/app/api/inngest/route.ts") ?? "";
const registeredBlock = inngestRoute.slice(inngestRoute.indexOf("functions:"));
const registeredNames = new Set(
  registeredBlock
    .replace(/\/\/.*$/gm, "")
    .match(/\b\w+Fn\b|\.\.\.\w+/g)
    ?.map((s) => s.replace("...", "")) ?? []
);

interface Job {
  name: string;
  label: string;
  file: number;
  crons: string[];
  events: string[];
  registered: boolean;
}
const jobs: Job[] = [];
const eventListeners = new Map<string, number[]>();

for (const f of files) {
  if (!f.startsWith("apps/web/src/inngest/") && !f.startsWith("apps/web/src/lib/")) continue;
  const text = source.get(f)!;
  const re = /export const (\w+)\s*=\s*inngest\.createFunction\(\s*\{([\s\S]*?)\n\s{0,4}\}/g;
  let m: RegExpExecArray | null;
  // Functions exported as an array spread (e.g. ...creatorsFunctions)
  // count as registered when the array is.
  const arrays = [...text.matchAll(/export const (\w+)\s*=\s*\[([\s\S]*?)\]/g)];
  while ((m = re.exec(text))) {
    const name = m[1];
    const cfg = m[2] + text.slice(re.lastIndex, re.lastIndex + 600);
    const label = cfg.match(/name:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? name;
    const crons = [...cfg.matchAll(/cron:\s*["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
    const events = [...cfg.matchAll(/event:\s*["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
    const inArray = arrays.some((a) => registeredNames.has(a[1]) && new RegExp(`\\b${name}\\b`).test(a[2]));
    const idx = fileIndex.get(f)!;
    jobs.push({ name, label, file: idx, crons: [...new Set(crons)], events: [...new Set(events)], registered: registeredNames.has(name) || inArray });
    for (const ev of events) eventListeners.set(ev, [...(eventListeners.get(ev) ?? []), idx]);
  }
}

// ── Per-file scan ─────────────────────────────────────────────────

interface FileOut {
  p: string; // path
  s: string; // system id
  k: string; // kind
  n: number; // lines
  d?: string; // summary
  u?: string; // url (page/route)
  t?: string[]; // tables
  v?: string[]; // services
}

const outFiles: FileOut[] = [];
const edges = new Set<string>(); // "src,dst,type"

for (const f of files) {
  const text = source.get(f)!;
  const idx = fileIndex.get(f)!;
  const rec: FileOut = { p: f, s: systemFor(f), k: kindFor(f), n: text.split("\n").length };
  const d = summaryFor(text);
  if (d) rec.d = d;
  const u = urlFor(f);
  if (u) rec.u = u;

  // imports
  let m: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(text))) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    const target = resolveImport(f, spec);
    if (target && target !== f) edges.add(`${idx},${fileIndex.get(target)},i`);
  }

  // calls to our own API routes (fetch("/api/…"), api.get("/api/…"))
  if (rec.k !== "route" || true) {
    for (const am of text.matchAll(/["'`](\/api\/[A-Za-z0-9_\-/${}.]+)/g)) {
      const target = resolveApi(am[1]);
      if (target && target !== f) edges.add(`${idx},${fileIndex.get(target)},a`);
    }
  }

  // Inngest events sent from this file → the jobs that listen for them
  if (/\.send\(|sendEvent\(/.test(text)) {
    for (const em of text.matchAll(/name:\s*["'`]([a-z0-9_.-]+\/[a-z0-9_./-]+)["'`]/gi)) {
      for (const listener of eventListeners.get(em[1]) ?? []) {
        if (listener !== idx) edges.add(`${idx},${listener},e`);
      }
    }
  }

  // tables
  const tables = new Set<string>();
  for (const pm of text.matchAll(/\b(?:prisma|tx|db)\.([a-z]\w*)\.(?:find|create|update|upsert|delete|count|aggregate|groupBy)/g)) {
    const model = modelByAccessor.get(pm[1]);
    if (model) tables.add(model);
  }
  if (tables.size) rec.t = [...tables].sort();

  // outside services
  const svcs = SERVICES.filter((s) => s.match.test(text)).map((s) => s.id);
  if (svcs.length) rec.v = svcs;

  outFiles.push(rec);
}

// ── Roll up to systems ────────────────────────────────────────────

const edgeList = [...edges].map((e) => e.split(",")).map(([a, b, t]) => [Number(a), Number(b), t] as [number, number, string]);

const sysEdges = new Map<string, { i: number; a: number; e: number }>();
for (const [a, b, t] of edgeList) {
  const sa = outFiles[a].s;
  const sb = outFiles[b].s;
  if (sa === sb) continue;
  const key = `${sa}>${sb}`;
  const cur = sysEdges.get(key) ?? { i: 0, a: 0, e: 0 };
  cur[t as "i" | "a" | "e"]++;
  sysEdges.set(key, cur);
}

const systemsOut = SYSTEMS.map((s) => {
  const mine = outFiles.map((f, i) => ({ f, i })).filter(({ f }) => f.s === s.id);
  const tableCount = new Map<string, number>();
  const svcCount = new Map<string, number>();
  for (const { f } of mine) {
    for (const t of f.t ?? []) tableCount.set(t, (tableCount.get(t) ?? 0) + 1);
    for (const v of f.v ?? []) svcCount.set(v, (svcCount.get(v) ?? 0) + 1);
  }
  return {
    id: s.id,
    label: s.label,
    group: s.group,
    description: s.description,
    status: s.status ?? "live",
    statusNote: s.statusNote,
    files: mine.length,
    lines: mine.reduce((n, { f }) => n + f.n, 0),
    tables: [...tableCount].sort((a, b) => b[1] - a[1]),
    services: [...svcCount].sort((a, b) => b[1] - a[1]),
  };
}).filter((s) => s.files > 0);

let commit = "";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
} catch {
  commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "";
}

const out = {
  generatedAt: new Date().toISOString(),
  commit,
  systems: systemsOut,
  services: SERVICES.map(({ id, label }) => ({ id, label })),
  files: outFiles,
  edges: edgeList,
  systemEdges: [...sysEdges].map(([k, v]) => {
    const [source, target] = k.split(">");
    return { source, target, ...v };
  }),
  jobs,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const platform = systemsOut.find((s) => s.id === "platform");
console.log(
  `system-map: ${outFiles.length} files, ${edgeList.length} links, ${jobs.length} jobs (${jobs.filter((j) => !j.registered).length} not registered), ${systemsOut.length} systems; core platform catch-all = ${platform?.files ?? 0} files → ${path.relative(ROOT, OUT)}`
);
