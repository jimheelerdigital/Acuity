/**
 * Phase 1 approved prune (Keenan sign-off 2026-09-23): 50 zero-demand
 * posts — 40 from the triage PRUNE list (<5 imp in 90d, 60d+ old) plus
 * 10 HOLD posts with ZERO impressions at 14+ days old.
 *
 * Each post gets status PRUNED_DAY90 + redirectTo the closest surviving
 * KEEP post (keyword-token overlap), which the blog page serves as a 308
 * permanent redirect — no hard 404s, residual equity flows to keepers.
 * Every action is logged to BlogPrunerRun and pinged to IndexNow.
 *
 * Run: npx dotenv -e apps/web/.env.local -- tsx apps/web/scripts/blog-phase1-prune.ts
 */
import { prisma } from "../src/lib/prisma";
import { notifyPublish } from "../src/lib/google/indexing";

const PRUNE_SLUGS = [
  // Triage PRUNE list (40)
  "student-productivity-hacks-voice-brain-dumps-between-classes",
  "how-perfectionist-students-can-stop-overthinking-with-brain-",
  "perfectionist-trap-how-voice-journaling-reduces-self-critici",
  "how-to-use-voice-journaling-during-your-commute-for-maximum-",
  "sleep-journaling-how-recording-racing-thoughts-at-3am-helps-",
  "acuity-vs-reflectr-comparing-ai-journaling-for-emotional-ins",
  "how-startup-founders-use-60-second-reflections-for-better-de",
  "how-voice-journaling-boosts-adhd-focus-and-task-completion",
  "how-to-build-a-consistent-journaling-habit-when-you-hate-wri",
  "using-voice-notes-to-track-toddler-milestones-without-the-ov",
  "the-parent-s-guilt-journal-how-to-process-mom-guilt-and-dad-",
  "adhd-task-paralysis-how-talking-through-your-to-do-list-gets",
  "sobriety-journaling-prompts-30-voice-prompts-for-your-first-",
  "how-parents-can-process-mom-guilt-in-under-2-minutes-a-day",
  "the-science-behind-mood-tracking-for-knowledge-workers",
  "how-freelancers-can-use-daily-check-ins-to-avoid-burnout",
  "study-journaling-how-to-reflect-on-what-you-learned-to-retai",
  "the-best-evening-routines-for-founders-who-can-t-turn-off-th",
  "adhd-emotional-dysregulation-how-voice-journaling-helps-you-",
  "how-new-dads-can-process-identity-shifts-with-daily-micro-re",
  "dopamine-menu-journaling-how-adhd-brains-can-plan-rewarding-",
  "how-coaches-can-use-post-session-voice-notes-to-improve-thei",
  "why-creatives-should-record-their-process-not-just-their-out",
  "decision-fatigue-in-founders-how-audio-reflection-reduces-co",
  "creative-block-solutions-using-voice-notes-to-capture-ideas-",
  "solo-business-owner-productivity-weekly-progress-voice-revie",
  "creative-inspiration-capture-why-audio-beats-text-notes",
  "executive-decision-making-how-daily-brain-dumps-improve-clar",
  "how-to-turn-voice-journal-entries-into-actionable-personal-i",
  "how-solopreneurs-use-decision-journals-to-avoid-costly-mista",
  "how-to-use-voice-journaling-for-addiction-recovery-daily-che",
  "how-to-journal-when-you-hate-writing-a-guide-for-non-writers",
  "acuity-vs-notion-journal-which-is-better-for-structured-refl",
  "how-freelancers-can-set-boundaries-without-guilt-a-reflectio",
  "why-executives-should-dictate-their-thoughts-instead-of-typi",
  "how-graduate-students-can-use-reflection-to-avoid-dissertati",
  "sunday-reset-routine-how-solopreneurs-plan-their-week-with-v",
  "insomnia-and-worry-loops-how-externalizing-thoughts-improves",
  "how-freelancers-can-track-client-feedback-patterns-to-raise-",
  "quarterly-life-reviews-a-solopreneur-s-guide-to-measuring-wh",
  // HOLD posts with zero impressions at 14+ days old (10)
  "relapse-prevention-how-daily-voice-check-ins-build-self-awar",
  "how-working-parents-can-decompress-during-their-commute-with",
  "how-coaches-can-identify-client-patterns-faster-with-ai-anal",
  "bedtime-anxiety-journaling-a-5-minute-protocol-for-better-sl",
  "how-solopreneurs-can-conduct-their-own-monthly-retrospective",
  "adhd-time-blindness-using-voice-timestamps-to-build-time-awa",
  "how-freelance-designers-can-articulate-their-creative-decisi",
  "imposter-syndrome-in-executives-how-private-reflection-build",
  "how-students-can-reflect-on-internship-experiences-to-build-",
  "trigger-tracking-in-recovery-how-voice-journals-help-you-see",
];

const STOP = new Set([
  "how", "why", "what", "when", "the", "a", "an", "to", "for", "of", "and",
  "with", "your", "you", "can", "use", "using", "in", "on", "vs", "is",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

const FALLBACK = "the-7-best-ai-journaling-apps-in-2026-tested-and-compared";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const keepers = await prisma.contentPiece.findMany({
    where: {
      type: "BLOG",
      slug: { not: null, notIn: PRUNE_SLUGS },
      status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] },
    },
    select: { slug: true, title: true, targetKeyword: true },
  });

  let pruned = 0;
  for (const slug of PRUNE_SLUGS) {
    const post = await prisma.contentPiece.findFirst({
      where: { slug, type: "BLOG" },
      select: { id: true, title: true, targetKeyword: true, status: true, publishedAt: true, distributedAt: true, createdAt: true },
    });
    if (!post) {
      console.log(`SKIP (not found): ${slug}`);
      continue;
    }
    if (!["DISTRIBUTED", "AUTO_PUBLISHED"].includes(post.status)) {
      console.log(`SKIP (status ${post.status}): ${slug}`);
      continue;
    }

    // Closest surviving post by token overlap
    const myTokens = tokens(`${post.title} ${post.targetKeyword ?? ""}`);
    let best = { slug: FALLBACK, score: 0 };
    for (const k of keepers) {
      const kt = tokens(`${k.title} ${k.targetKeyword ?? ""}`);
      let overlap = 0;
      for (const t of kt) if (myTokens.has(t)) overlap++;
      if (overlap > best.score) best = { slug: k.slug!, score: overlap };
    }
    const target = best.score >= 1 ? best.slug : FALLBACK;

    const published = post.publishedAt ?? post.distributedAt ?? post.createdAt;
    const ageDays = Math.floor((Date.now() - published.getTime()) / 864e5);
    const url = `https://goripple.io/blog/${slug}`;

    if (dryRun) {
      console.log(`[dry] ${slug} -> ${target} (overlap ${best.score})`);
      continue;
    }

    await prisma.contentPiece.update({
      where: { id: post.id },
      data: { status: "PRUNED_DAY90", redirectTo: target },
    });
    await prisma.blogPrunerRun.create({
      data: {
        postId: post.id,
        postUrl: url,
        postSlug: slug,
        daysSincePublish: ageDays,
        recommendedAction: "REDIRECT_TRIAGE_2026_09",
        actualActionTaken: `308 -> /blog/${target}`,
        isDryRun: false,
        runStatus: "executed",
      },
    });
    const res = await notifyPublish(url);
    console.log(`pruned ${slug} -> ${target} (overlap ${best.score}) indexnow=${res.success}`);
    pruned++;
  }
  console.log(`\nDone: ${pruned}/${PRUNE_SLUGS.length} pruned${dryRun ? " (dry run)" : ""}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
