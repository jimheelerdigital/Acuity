/**
 * Manual rewrite for the one triage post the prod Inngest engine failed
 * validation on twice (source body contained banned phrases the model
 * kept echoing). Content hand-written to the same SYSTEM_PROMPT rules.
 * Run: cd apps/web && npx dotenv -e .env.local -- npx tsx scripts/fix-lifecoach-rewrite.ts
 */
import { prisma } from "../src/lib/prisma";
import { notifyPublish } from "../src/lib/google/indexing";

const SLUG = "the-best-journaling-prompts-for-life-coaches-to-use-with-cli";
const TITLE = "Journaling Prompts for Coaching Clients: 12 That Work";
const META =
  "Twelve journaling prompts life coaches assign between sessions, covering goal clarity, patterns, accountability, and reinvention, plus tips clients follow through on.";
const KEYWORD = "journaling prompts for life coaching clients";

const FAQ = [
  {
    question: "How many journaling prompts should I assign a coaching client per week?",
    answer:
      "One prompt per week is ideal. Assign it after a session and ask the client to respond to it two or three times before your next meeting. Revisiting one question builds depth rather than surface-level check-ins.",
  },
  {
    question: "Should coaching clients write or speak their journal entries?",
    answer:
      "Either works, but voice entries tend to be less filtered and faster to produce. Clients who resist writing often find speaking into an app far more natural. The goal is reducing friction so they actually do it consistently.",
  },
  {
    question: "How do I use client journal entries in coaching sessions?",
    answer:
      "Ask clients to bring one insight or one pattern they noticed since the last session. Reviewing weekly summaries together also works well for spotting recurring themes. This turns journaling from homework into something that visibly shapes the session.",
  },
  {
    question: "What if a coaching client refuses to journal?",
    answer:
      "Reframe it. Call it a voice check-in or a debrief instead of journaling, since the word journal carries baggage for many people. Removing the writing component and shrinking the ask usually dissolves the resistance.",
  },
];

const BODY = `<p>Most journaling prompts you find online are vague feel-good fluff. Asking a client what they are grateful for will not help them figure out why they keep self-sabotaging at work.</p>
<p>Good <strong>journaling prompts for life coaching clients</strong> do something specific: they extend the coaching session into the days between meetings. They keep clients in the work when you are not in the room.</p>
<p>Here are twelve prompts organized by what you are actually trying to accomplish with each client, plus a quick reference table for choosing the right category.</p>
<table>
<thead><tr><th>Prompt category</th><th>When to assign it</th><th>What it surfaces</th></tr></thead>
<tbody>
<tr><td>Goal clarity</td><td>Client wants more but cannot articulate what that means</td><td>Specific desires vs. borrowed obligations</td></tr>
<tr><td>Patterns and blocks</td><td>Mid-engagement, once trust is established</td><td>Emotional triggers and self-sabotage narratives</td></tr>
<tr><td>Accountability and action</td><td>Client has clarity but struggles with execution</td><td>Real blockers behind missed commitments</td></tr>
<tr><td>Transition and reinvention</td><td>Career changes, relationship shifts, identity work</td><td>Outdated identities and unarticulated values</td></tr>
</tbody>
</table>
<h2>Prompts for goal clarity</h2>
<p>Use these when a client knows they want something different but cannot name it.</p>
<ul>
<li><strong>Describe a day, five years from now, where everything went right. Walk through it hour by hour.</strong> Forces specificity. Clients cannot hide behind abstractions when they have to fill a whole day.</li>
<li><strong>What would you stop doing tomorrow if no one would judge you?</strong> Reveals obligation-driven goals vs. intrinsic ones. Research from <a href="https://selfdeterminationtheory.org" target="_blank" rel="noopener noreferrer">Self-Determination Theory</a> shows that autonomous motivation predicts follow-through far better than external pressure.</li>
<li><strong>Name three things you said yes to this month that you wish you had declined.</strong> Surfaces the gap between stated priorities and actual behavior.</li>
</ul>
<h2>Prompts for identifying patterns and blocks</h2>
<p>These work best mid-engagement, when you have built enough trust that clients will be honest.</p>
<ul>
<li><strong>What situation triggered the strongest emotional reaction this week? What did you do next?</strong> Connects emotions to behavioral patterns. <a href="https://www.apa.org/topics/psychotherapy/understanding" target="_blank" rel="noopener noreferrer">The APA</a> notes that recognizing emotional patterns is foundational to behavioral change.</li>
<li><strong>Write about a time you were close to getting what you wanted and pulled back. What story were you telling yourself?</strong> Self-sabotage often has a narrative engine. This prompt surfaces it.</li>
<li><strong>What is the thing you keep circling back to in our sessions but never fully address?</strong> Gives clients permission to name the elephant.</li>
</ul>
<h2>Prompts for accountability and action</h2>
<p>Assign these when a client has clarity but struggles with execution.</p>
<ul>
<li><strong>What is one commitment you made to yourself last week? Did you keep it? If not, what got in the way?</strong> No judgment, just data. Patterns across multiple entries reveal the real blockers.</li>
<li><strong>What is the smallest possible version of the thing you have been putting off?</strong> Shrinks resistance. A <a href="https://jamesclear.com/atomic-habits" target="_blank" rel="noopener noreferrer">core principle in habit research</a>: reduce the action until starting feels trivial.</li>
<li><strong>Rate your energy this week from 1 to 10. What drained it? What restored it?</strong> Builds self-awareness about capacity, not just willpower.</li>
</ul>
<h2>Prompts for transition and reinvention</h2>
<p>For clients navigating career changes, relationship shifts, or identity work.</p>
<ul>
<li><strong>What identity are you holding onto that no longer serves you?</strong> Identity-level change is harder than behavior change. This prompt names what needs to shift.</li>
<li><strong>Who do you admire? What specifically about their life appeals to you?</strong> Reveals values the client may not have articulated yet.</li>
<li><strong>What would you attempt if you knew your current skills were enough?</strong> Separates real skill gaps from imposter syndrome.</li>
</ul>
<h2>How to actually get clients to journal</h2>
<p><strong>Make it voice-first.</strong> Many clients resist writing. Talking into their phone removes the friction of a blank page, and studies on verbal processing suggest speaking produces more honest, less edited responses than writing.</p>
<p><strong>Assign one prompt per week, not five.</strong> Depth beats breadth. One prompt revisited three times across a week yields more insight than a different prompt daily.</p>
<p><strong>Review entries together.</strong> Journaling that feeds back into sessions creates a closed loop. Clients see that the work matters, so they keep doing it.</p>
<p>If you want between-session reflection to stick, <a href="/for/therapists">Ripple</a> is worth a look. Clients talk through their day and the app pulls out tasks, tracks mood and life patterns, and builds a weekly report some coaches use as session prep. It costs $4.99 a month after a 7-day free trial, no credit card required.</p>
<h2>FAQ</h2>
${FAQ.map((f) => `<h3>${f.question}</h3>\n<p>${f.answer}</p>`).join("\n")}`;

async function main() {
  const banned = [
    "unlock", "elevate", "journey", "transform", "ai-powered", "seamless",
    "game-changer", "in today's fast-paced world", "revolutionize",
    "harness the power of", "empower", "cutting-edge", "leverage",
    "brain dump", "delve", "tapestry", "testament to", "let's dive",
    "let's explore", "in the heart of", "nightly", "before bed", "acuity",
  ];
  const text = `${TITLE} ${META} ${BODY}`.toLowerCase();
  for (const b of banned) if (text.includes(b)) throw new Error(`banned phrase present: ${b}`);
  if (BODY.includes("\u2014")) throw new Error("em dash present");
  const words = BODY.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  if (words < 500) throw new Error(`too short: ${words} words`);
  console.log(`checks pass (title ${TITLE.length} chars, meta ${META.length} chars, ${words} words)`);

  const metaTag = `<meta name="description" content="${META}">`;
  const post = await prisma.contentPiece.findFirst({ where: { slug: SLUG }, select: { id: true } });
  if (!post) throw new Error("post not found");
  await prisma.contentPiece.update({
    where: { id: post.id },
    data: {
      title: TITLE,
      hook: META,
      targetKeyword: KEYWORD,
      finalBody: `${metaTag}\n${BODY}`,
      faqSchema: FAQ,
    },
  });
  const res = await notifyPublish(`https://goripple.io/blog/${SLUG}`);
  console.log(`saved + indexnow=${res.success}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
