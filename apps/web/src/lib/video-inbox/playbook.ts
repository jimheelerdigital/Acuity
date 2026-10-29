/**
 * Video playbook: memory for the video inbox (2026-10-29, per Keenan: "how
 * do we build memory into this?").
 *
 *   library (VideoLesson)  → every breakdown, kept forever
 *   playbook (PlaybookLesson) → short per-brand lessons distilled weekly
 *
 * Weekly (Sunday 9am Central): Claude reads the week's new breakdowns next
 * to the brand's current lessons and says which lessons the new videos back
 * (strength += one per video) and which new lessons they suggest
 * (PROPOSED). Lessons nothing backed this week fade ×0.85; approved lessons
 * below 0.5 retire, proposals Keenan never answered expire after 28 days.
 * Keenan approves or rejects proposals from the weekly email (signed
 * links); only APPROVED lessons reach the writers, through readBriefBlock
 * (content-factory/weekly-brief.ts). Locked lessons are Keenan's own rules
 * from his notes: they never fade.
 */

import { createHmac, timingSafeEqual } from "crypto";

import { contentAnthropic, CONTENT_MODEL, lastJsonText, messageText } from "@/lib/content-factory/claude-client";
import { escapeHtml } from "@/lib/escape-html";
import { BRAND_CONTEXT, KEENAN, logClaude, type Breakdown } from "./watch";

export type PlaybookBrand = "ripple" | "bwk" | "mythicals";
export const PLAYBOOK_BRANDS: PlaybookBrand[] = ["ripple", "bwk", "mythicals"];

/** Lessons the writers see per brand (locked first, then strongest). */
const PLAYBOOK_CAP = 15;
const FADE = 0.85;
const RETIRE_BELOW = 0.5;
/** "Proven" once this many videos back it. */
export const PROVEN_AT = 5;
const PROPOSAL_TTL_MS = 28 * 24 * 3600 * 1000;

// ─── Writers ───────────────────────────────────────────────────────────────

/** Approved lessons as a prompt block for the brand's writers. "" when none. */
export async function playbookBlock(brand: PlaybookBrand): Promise<string> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.playbookLesson.findMany({
    where: { brand, status: "APPROVED" },
    orderBy: [{ locked: "desc" }, { strength: "desc" }],
    take: PLAYBOOK_CAP,
    select: { lesson: true, locked: true, strength: true, videoIds: true },
  });
  if (!rows.length) return "";
  return [
    "VIDEO PLAYBOOK: lessons from standout videos Keenan saved and approved for this account.",
    ...rows.map((r) =>
      r.locked
        ? `- KEENAN'S RULE: ${r.lesson}`
        : `- ${r.lesson} (${r.videoIds.length >= PROVEN_AT ? "proven" : `seen in ${r.videoIds.length} video${r.videoIds.length === 1 ? "" : "s"}`})`
    ),
    "Follow Keenan's rules whenever they apply to this post. Use the other lessons where they fit this lane naturally; the lane's own format, theme and voice rules come first. Never copy another creator's wording or mention research in the copy.",
  ].join("\n");
}

// ─── Weekly distill ────────────────────────────────────────────────────────

interface DistillResult {
  reinforce: { lessonId: string; videoIds: string[] }[];
  proposals: { lesson: string; videoIds: string[] }[];
}

export interface BrandDistill {
  brand: PlaybookBrand;
  videos: number;
  proposed: string[];
  promoted: string[];
  retired: string[];
}

export async function distillBrand(brand: PlaybookBrand): Promise<BrandDistill> {
  const { prisma } = await import("@/lib/prisma");
  const now = new Date();
  const videos = await prisma.videoLesson.findMany({
    where: { brand, status: "DONE", distilledAt: null },
    orderBy: { createdAt: "asc" },
    take: 60,
  });
  const lessons = await prisma.playbookLesson.findMany({
    where: { brand, status: { in: ["PROPOSED", "APPROVED"] } },
    orderBy: { strength: "desc" },
  });
  const rejected = await prisma.playbookLesson.findMany({
    where: { brand, status: "REJECTED" },
    orderBy: { decidedAt: "desc" },
    take: 40,
    select: { lesson: true },
  });

  const out: BrandDistill = { brand, videos: videos.length, proposed: [], promoted: [], retired: [] };
  const seen = new Set<string>();

  if (videos.length) {
    const videoBlock = videos
      .map((v) => {
        const b = v.breakdown as unknown as Breakdown;
        return `[${v.id}] ${b.summary} Hook: ${b.hook} Structure: ${b.structure} Why it worked: ${b.whyItWorked} Lessons: ${b.lessons.join(" | ")}${v.views != null ? ` (${v.views.toLocaleString()} views)` : ""}${v.note ? ` Keenan's note: ${v.note}` : ""}`;
      })
      .join("\n");
    const res = await contentAnthropic.messages.create({
      model: CONTENT_MODEL,
      max_tokens: 3000,
      effort: "medium",
      system: `You keep the video playbook for one social account: ${BRAND_CONTEXT[brand]}

The playbook is a short list of lessons, each one sentence a writer can follow ("open on the payoff image, then rewind to how she got there"). You get the current lessons and this week's new video breakdowns. Decide:
1. reinforce: which existing lessons each new video clearly backs. Only when the video really shows the same mechanic.
2. proposals: new lessons the videos suggest that no current lesson covers. Prefer a lesson two or more videos share; a single video can propose one only when the mechanic is strong and clearly transferable. Never propose something a rejected lesson already covers, never duplicate a current lesson, and at most 4 proposals.

Lessons are about mechanics (hook, structure, pacing, format, sound, ending), not topics or a creator's wording. Return ONLY JSON:
{"reinforce": [{"lessonId": "...", "videoIds": ["..."]}], "proposals": [{"lesson": "...", "videoIds": ["..."]}]}`,
      messages: [
        {
          role: "user",
          content: [
            "CURRENT LESSONS:",
            lessons.length ? lessons.map((l) => `[${l.id}] ${l.lesson}`).join("\n") : "(none yet)",
            "",
            "REJECTED BY KEENAN (don't propose these again):",
            rejected.length ? rejected.map((l) => `- ${l.lesson}`).join("\n") : "(none)",
            "",
            "NEW VIDEOS THIS WEEK:",
            videoBlock,
          ].join("\n"),
        },
      ],
    });
    await logClaude("video-inbox-distill", res.usage);
    const parsed = JSON.parse(lastJsonText(messageText(res))) as Partial<DistillResult>;
    const videoIds = new Set(videos.map((v) => v.id));
    const byId = new Map(lessons.map((l) => [l.id, l]));

    for (const r of Array.isArray(parsed.reinforce) ? parsed.reinforce : []) {
      const lesson = byId.get(r?.lessonId);
      const ids = (Array.isArray(r?.videoIds) ? r.videoIds : []).filter((id) => videoIds.has(id) && !lesson?.videoIds.includes(id));
      if (!lesson || !ids.length) continue;
      const before = lesson.videoIds.length;
      lesson.videoIds = [...lesson.videoIds, ...ids];
      lesson.strength += ids.length;
      seen.add(lesson.id);
      await prisma.playbookLesson.update({
        where: { id: lesson.id },
        data: { videoIds: lesson.videoIds, strength: lesson.strength, lastSeenAt: now },
      });
      if (before < PROVEN_AT && lesson.videoIds.length >= PROVEN_AT && lesson.status === "APPROVED") out.promoted.push(lesson.lesson);
    }
    for (const p of (Array.isArray(parsed.proposals) ? parsed.proposals : []).slice(0, 4)) {
      const text = typeof p?.lesson === "string" ? p.lesson.trim() : "";
      const ids = (Array.isArray(p?.videoIds) ? p.videoIds : []).filter((id) => videoIds.has(id));
      if (!text || !ids.length) continue;
      const row = await prisma.playbookLesson.create({
        data: { brand, lesson: text.slice(0, 600), status: "PROPOSED", strength: ids.length, videoIds: ids, lastSeenAt: now },
      });
      seen.add(row.id);
      out.proposed.push(text);
    }
    await prisma.videoLesson.updateMany({ where: { id: { in: [...videoIds] } }, data: { distilledAt: now } });
  }

  // Fade what nothing backed this week; retire the faded and the unanswered.
  for (const l of lessons) {
    if (l.locked || seen.has(l.id)) continue;
    const strength = l.strength * FADE;
    const expired = l.status === "PROPOSED" && now.getTime() - l.createdAt.getTime() > PROPOSAL_TTL_MS;
    const faded = l.status === "APPROVED" && strength < RETIRE_BELOW;
    await prisma.playbookLesson.update({
      where: { id: l.id },
      data: expired || faded ? { strength, status: "RETIRED", decidedAt: now } : { strength },
    });
    if (faded) out.retired.push(l.lesson);
  }
  return out;
}

// ─── Approval links ────────────────────────────────────────────────────────

function secret(): string {
  const s = process.env.VIDEO_INBOX_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!s) throw new Error("VIDEO_INBOX_SECRET not set");
  return s;
}

export function lessonSignature(id: string, action: "approve" | "reject"): string {
  return createHmac("sha256", secret()).update(`playbook:${id}:${action}`).digest("base64url");
}

export function verifyLessonSignature(id: string, action: "approve" | "reject", sig: string): boolean {
  const want = Buffer.from(lessonSignature(id, action));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

function lessonLink(id: string, action: "approve" | "reject"): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://goripple.io";
  return `${base}/api/video-inbox/lesson?id=${id}&action=${action}&sig=${lessonSignature(id, action)}`;
}

// ─── Weekly email ──────────────────────────────────────────────────────────

const LABEL: Record<PlaybookBrand, string> = { ripple: "Ripple", bwk: "BWK", mythicals: "Mythicals" };

/** "What we learned this week" to Keenan. Skipped when nothing happened. */
export async function sendPlaybookEmail(results: BrandDistill[]): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  const { sendEmailOrThrow } = await import("@/lib/resend");
  const pending = await prisma.playbookLesson.findMany({
    where: { status: "PROPOSED" },
    orderBy: [{ brand: "asc" }, { strength: "desc" }],
  });
  const approved = await prisma.playbookLesson.groupBy({ by: ["brand"], where: { status: "APPROVED" }, _count: true });
  const general = await prisma.videoLesson.count({
    where: { brand: "general", status: "DONE", createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
  });
  const videos = results.reduce((n, r) => n + r.videos, 0) + general;
  const changed = results.some((r) => r.promoted.length || r.retired.length);
  if (!videos && !pending.length && !changed) return false;

  const btn = (href: string, label: string, color: string) =>
    `<a href="${href}" style="display:inline-block;padding:6px 14px;margin-right:6px;border-radius:8px;background:${color};color:#fff;text-decoration:none;font-size:13px;font-weight:600">${label}</a>`;
  const sections = PLAYBOOK_BRANDS.map((brand) => {
    const r = results.find((x) => x.brand === brand);
    const mine = pending.filter((p) => p.brand === brand);
    if (!r?.videos && !mine.length && !r?.promoted.length && !r?.retired.length) return "";
    const count = approved.find((a) => a.brand === brand)?._count ?? 0;
    return `<div style="margin:18px 0;padding:14px 16px;border:1px solid #eee;border-radius:12px">
      <div style="font-weight:700;font-size:15px">${LABEL[brand]}</div>
      <div style="color:#666;font-size:13px">${r?.videos ?? 0} new video${r?.videos === 1 ? "" : "s"} this week · ${count} lesson${count === 1 ? "" : "s"} in use</div>
      ${mine
        .map(
          (p) => `<div style="margin:12px 0;padding:10px 12px;background:#FFF4EF;border-radius:10px">
            <div>${escapeHtml(p.lesson)}</div>
            <div style="font-size:12px;color:#888;margin:4px 0 8px">Seen in ${p.videoIds.length} video${p.videoIds.length === 1 ? "" : "s"}</div>
            ${btn(lessonLink(p.id, "approve"), "Use it", "#2E7D4F")}${btn(lessonLink(p.id, "reject"), "Skip it", "#999")}
          </div>`
        )
        .join("")}
      ${r?.promoted.length ? `<div style="margin-top:10px;font-size:13px"><strong>Now proven (${PROVEN_AT}+ videos):</strong><ul style="margin:4px 0 0;padding-left:18px">${r.promoted.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul></div>` : ""}
      ${r?.retired.length ? `<div style="margin-top:10px;font-size:13px;color:#666"><strong>Dropped (no new videos backed them):</strong><ul style="margin:4px 0 0;padding-left:18px">${r.retired.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul></div>` : ""}
    </div>`;
  }).join("");

  await sendEmailOrThrow({
    from: "hello@goripple.io",
    to: [KEENAN],
    replyTo: KEENAN,
    subject: `Video playbook: ${pending.length} lesson${pending.length === 1 ? "" : "s"} to review from ${videos} video${videos === 1 ? "" : "s"}`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;font-size:14px;line-height:1.5">
      <h2 style="margin:0 0 4px;color:#C4451C">What we learned this week</h2>
      <div style="color:#666;font-size:13px">From the videos you sent. "Use it" puts a lesson in front of that brand's writers; "Skip it" means it won't be suggested again. Unanswered ones expire after 4 weeks.</div>
      ${sections}
      ${general ? `<div style="color:#666;font-size:13px">${general} video${general === 1 ? "" : "s"} didn't fit a brand and stay in the library only.</div>` : ""}
    </div>`,
  });
  return true;
}
