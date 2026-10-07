/**
 * Creator brief, generated when Keenan marks a creator "deal". Built on
 * lib/adlab/ugc-brief.ts (the loose hook → problem → demo → CTA shape and
 * the copy rules); this adds the per-video plan: one pain branch per video
 * (tagged), two hooks each, talking points not a script, the creator rules,
 * the credentialed line, and the money terms restated.
 *
 * Claims-checked like every draft; Keenan approves before it's sent.
 */
import { CONTENT_MODEL } from "@/lib/content-factory/claude-client";
import { buildUgcBrief } from "@/lib/adlab/ugc-brief";
import { PAIN_BRANCH_STARTERS, normalizePainBranch } from "@/lib/positioning";
import { callUgcModel, parseJsonReply } from "@/lib/ugc/ai";
import { claimsCheck, type ClaimsResult } from "@/lib/ugc/claims-check";
import {
  BUNDLE_SIZE,
  HOOKS_PER_VIDEO,
  PAYMENT_TERMS,
  PERSONAS,
  RIGHTS_EXTENSION_FEE,
  USAGE_RIGHTS_MONTHS,
  WINNER_BONUS_PER_VIDEO,
  type CreatorType,
  type Persona,
} from "@/lib/ugc/config";
import { allowedDollars } from "@/lib/ugc/draft";

export interface BriefVideo {
  n: number;
  painBranch: string;
  hooks: string[];
  talkingPoints: string[];
}

export interface BriefCreator {
  handle: string;
  displayName: string | null;
  persona: Persona | null;
  creatorType: CreatorType | null;
  feePerVideoCents: number;
  credentials: string | null;
}

export const CREDENTIALED_LINE =
  "Speak as someone who uses Ripple, not as a professional prescribing it.";
export const PARTNERSHIP_LINE =
  "Anything you post yourself carries a paid partnership label.";

export function moneyTerms(feePerVideoCents: number): string[] {
  const fee = feePerVideoCents / 100;
  return [
    `Fee: $${fee} per video, ${BUNDLE_SIZE} videos ($${fee * BUNDLE_SIZE} total), ${PAYMENT_TERMS}.`,
    `Winner bonus: $${WINNER_BONUS_PER_VIDEO} for any video that becomes a winning ad.`,
    `Usage rights: paid ad usage for ${USAGE_RIGHTS_MONTHS} months from delivery. We run the videos as ads from Ripple's own accounts.`,
    `Extension: $${RIGHTS_EXTENSION_FEE} per video for each extra ${USAGE_RIGHTS_MONTHS} months, winners only.`,
    "Free Ripple premium. Month-to-month, no auto-renew.",
  ];
}

export function composeBrief(c: BriefCreator, videos: BriefVideo[]): string {
  const first = (c.displayName ?? "").trim().split(/\s+/)[0] || undefined;
  const base = buildUgcBrief({ creatorName: first });
  const plan = videos.flatMap((v) => {
    const branch = PAIN_BRANCH_STARTERS.find((b) => b.key === v.painBranch);
    return [
      "",
      `VIDEO ${v.n} — pain: ${branch ? `${branch.name} (${branch.pain})` : v.painBranch} [branch: ${v.painBranch}]`,
      ...v.hooks.map((h, i) => `  Hook ${String.fromCharCode(65 + i)}: ${h}`),
      "  Talking points (say them your way):",
      ...v.talkingPoints.map((t) => `  - ${t}`),
    ];
  });
  return [
    base,
    "",
    `What to send: ${BUNDLE_SIZE} videos, each with ${HOOKS_PER_VIDEO} different hooks (film the opening twice), plus all raw footage. Vertical 9:16, talking to camera, natural light, phone audio is fine.`,
    ...plan,
    "",
    "Rules for you:",
    "- You may state your credentials and your personal experience.",
    "- You may not say Ripple treats, diagnoses, cures, or replaces therapy.",
    `- ${PARTNERSHIP_LINE}`,
    ...(c.creatorType === "credentialed" ? [`- ${CREDENTIALED_LINE}`] : []),
    "",
    "Money:",
    ...moneyTerms(c.feePerVideoCents).map((m) => `- ${m}`),
  ].join("\n");
}

export async function generateBriefVideos(c: BriefCreator): Promise<{ videos: BriefVideo[]; costUsd: number }> {
  const system = `You plan ${BUNDLE_SIZE} UGC ad videos for Ripple for one creator. Each video targets ONE different pain branch. For each: ${HOOKS_PER_VIDEO} different hooks (one line each, in the creator's natural voice, opening on a real moment) and 3-4 short talking points that follow problem → demo → call to action. Talking points, never a script. Customer words like "brain dump" and "voice journal" are fine. Never claim Ripple treats, diagnoses, cures or replaces therapy; no health-outcome promises; don't pin Ripple to a time of day. Answer ONLY JSON: [{"painBranch": "<key>", "hooks": ["...", "..."], "talkingPoints": ["..."]}]`;
  const user = JSON.stringify({
    creator: {
      persona: c.persona ? PERSONAS[c.persona].description : null,
      creatorType: c.creatorType,
      credentials: c.credentials,
    },
    painBranches: PAIN_BRANCH_STARTERS.map((b) => ({ key: b.key, name: b.name, pain: b.pain })),
    ...(c.creatorType === "credentialed" ? { note: CREDENTIALED_LINE } : {}),
  });
  const { text, costUsd } = await callUgcModel({
    purpose: "brief",
    model: CONTENT_MODEL,
    system,
    user,
    maxTokens: 1500,
    effort: "medium",
  });
  const rows = parseJsonReply<{ painBranch?: string; hooks?: string[]; talkingPoints?: string[] }[]>(text);
  const videos = rows.slice(0, BUNDLE_SIZE).map((r, i) => ({
    n: i + 1,
    painBranch: normalizePainBranch(r.painBranch) ?? PAIN_BRANCH_STARTERS[i % PAIN_BRANCH_STARTERS.length].key,
    hooks: (r.hooks ?? []).slice(0, HOOKS_PER_VIDEO).map((h) => String(h).trim()),
    talkingPoints: (r.talkingPoints ?? []).slice(0, 5).map((t) => String(t).trim()),
  }));
  if (videos.length < BUNDLE_SIZE) throw new Error(`brief: model returned ${videos.length} videos`);
  return { videos, costUsd };
}

export async function checkBrief(c: BriefCreator, body: string): Promise<ClaimsResult> {
  const fee = c.feePerVideoCents / 100;
  return claimsCheck("brief", body, {
    allowedDollars: [...allowedDollars(), fee, fee * BUNDLE_SIZE],
    mustInclude: [PARTNERSHIP_LINE, ...(c.creatorType === "credentialed" ? [CREDENTIALED_LINE] : [])],
  });
}
