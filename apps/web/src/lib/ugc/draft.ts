/**
 * Offer drafts for UGC outreach: one plain-text email (under
 * EMAIL_MAX_WORDS) and one short DM (under DM_MAX_WORDS) per creator.
 *
 * The model writes the personal part only. Code appends the opt-out line
 * and the signature + mailing address, so those can never be dropped or
 * reworded. Every draft goes through claims-check.ts; a flagged draft gets
 * one rewrite with the issues listed, then whatever it scores is what
 * Keenan sees.
 */
import { CONTENT_MODEL } from "@/lib/content-factory/claude-client";
import { callUgcModel, parseJsonReply } from "@/lib/ugc/ai";
import { claimsCheck, type ClaimsResult } from "@/lib/ugc/claims-check";
import {
  BUNDLE_SIZE,
  DM_MAX_WORDS,
  EMAIL_MAX_WORDS,
  HOOKS_PER_VIDEO,
  MAX_FEE_PER_VIDEO,
  OPT_OUT_LINE,
  PERSONAS,
  RIGHTS_EXTENSION_FEE,
  RIPPLE_PRICING,
  SIGNATURE_BLOCK,
  USAGE_RIGHTS_MONTHS,
  WINNER_BONUS_PER_VIDEO,
} from "@/lib/ugc/config";
import { ACQUISITION_TERM_RULE, CLAIMS_RULE, PRODUCT_ONE_LINER, TIME_OF_DAY_RULE } from "@/lib/positioning";
import type { Candidate } from "@/lib/ugc/sources/types";

/** Every dollar figure a draft may mention. */
export function allowedDollars(c?: Pick<Candidate, "costPerVideoCents" | "quotedRateCents"> | null): number[] {
  const prices = RIPPLE_PRICING.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return [
    MAX_FEE_PER_VIDEO,
    WINNER_BONUS_PER_VIDEO,
    RIGHTS_EXTENSION_FEE,
    MAX_FEE_PER_VIDEO * BUNDLE_SIZE,
    ...prices,
    ...(c?.quotedRateCents ? [c.quotedRateCents / 100] : []),
    ...(c?.costPerVideoCents ? [c.costPerVideoCents / 100] : []),
  ];
}

export function offerTerms(): string {
  return [
    `${BUNDLE_SIZE} videos, ${HOOKS_PER_VIDEO} hooks each (two different openings per video)`,
    `up to $${MAX_FEE_PER_VIDEO} per video`,
    `plus a $${WINNER_BONUS_PER_VIDEO} bonus for any video that becomes a winning ad`,
    "raw footage included",
    `paid ad usage rights for ${USAGE_RIGHTS_MONTHS} months (we run the videos as ads from Ripple's own accounts; they don't post them)`,
    "free Ripple premium",
    "paid on delivery",
    "month-to-month, no auto-renew",
  ].join("; ");
}

export function composeEmail(body: string): string {
  return `${body.trim()}\n\n${OPT_OUT_LINE}\n\n${SIGNATURE_BLOCK}`;
}

/** Email check on the full email as it would be sent. Words count everything above the signature. */
export async function checkEmail(c: Candidate, subject: string, full: string): Promise<ClaimsResult> {
  const res = await claimsCheck("email", `${subject}\n\n${full}`, {
    allowedDollars: allowedDollars(c),
    maxLinks: 1,
    mustInclude: [OPT_OUT_LINE, SIGNATURE_BLOCK],
  });
  const aboveSignature = full.split(SIGNATURE_BLOCK)[0];
  const words = aboveSignature.split(/\s+/).filter(Boolean).length;
  if (words > EMAIL_MAX_WORDS) res.issues.push(`${words} words (max ${EMAIL_MAX_WORDS})`);
  const head = full.split("\n").filter((l) => l.trim()).slice(0, 3).join(" ");
  if (!/ripple/i.test(head)) res.issues.push("doesn't say it's about Ripple in the first two lines");
  if (!/ripple/i.test(subject)) res.issues.push("subject doesn't mention Ripple");
  if (res.issues.length && res.status === "passed") res.status = "flagged";
  return res;
}

export async function checkDm(c: Candidate, dm: string): Promise<ClaimsResult> {
  return claimsCheck("dm", dm, { allowedDollars: allowedDollars(c), maxWords: DM_MAX_WORDS, maxLinks: 1 });
}

// Words creators put in display names that aren't names ("UGC Mairim" → "Hi UGC," in the 10-06 dry run).
const NOT_A_NAME = new Set(["ugc", "creator", "creators", "creates", "content", "official", "the", "by", "its", "it's", "im", "i'm", "mrs", "miss", "ms", "mr", "mama", "mom", "team", "shop", "studio", "media"]);

/** First real name from the display name, or null (the draft then says "Hi there,"). */
function firstName(c: Candidate): string | null {
  const words = (c.displayName ?? "").replace(/[^\p{L}\s'-]/gu, " ").trim().split(/\s+/);
  const n = words.find((w) => !NOT_A_NAME.has(w.toLowerCase()));
  if (!n || n.length < 2 || n.length > 20) return null;
  if (n.toLowerCase() === c.handle.toLowerCase().replace(/[^a-z]/g, "")) return null; // display name is just the handle
  return n[0].toUpperCase() + n.slice(1);
}

function rateSituation(c: Candidate): string {
  if (!c.costPerVideoCents) return "They have NOT quoted a rate. Pitch our offer and ask for their rate and availability.";
  const per = c.costPerVideoCents / 100;
  return per <= MAX_FEE_PER_VIDEO
    ? `They ALREADY quoted $${per} per video, which is within our budget. Respond to THEIR rate (say it works for a ${BUNDLE_SIZE}-video test), restate the rest of the terms briefly, and ask for their availability. Don't pitch our own number.`
    : `They ALREADY quoted $${per} per video, above our $${MAX_FEE_PER_VIDEO} test budget. Respond to their rate honestly: we're testing at up to $${MAX_FEE_PER_VIDEO} per video plus the $${WINNER_BONUS_PER_VIDEO} winner bonus, and winners get more work. Ask if they can do a ${BUNDLE_SIZE}-video test at that, and their availability.`;
}

const SYSTEM = `You write short cold outreach from Keenan, co-founder of Ripple, to one UGC creator. One person writing to one person. Plain text, no formatting, no emojis, no exclamation-mark gushing.

What Ripple is: ${PRODUCT_ONE_LINER}
Ripple pricing (only if relevant): ${RIPPLE_PRICING}.

Rules:
- Greeting: "Hi <firstName>," using the firstName given. If firstName is null, write "Hi there," and never use their handle or username as a name.
- Keenan's email address says "Heeler Digital", so the FIRST TWO LINES after the greeting must make clear this is about Ripple and who he is (co-founder of Ripple). Never mention Heeler Digital or his email address in the text.
- Open with ONE specific, real detail from their content, taken only from the "detail", captions or transcripts provided. Never invent one. No generic compliments ("love your content", "your energy").
- Pick a detail about their work as a creator (a hook, a video idea, their delivery, what they said about their routine, workload or goals). Never their private life: no engagements, relationships, pregnancies, kids' diagnoses, health, money troubles or where they live. A stranger quoting those reads as creepy.
- ONE clear ask: reply with their rate and availability (or, if they quoted, availability).
- No links in the body. No images. Don't add a sign-off, opt-out line or signature; those are appended automatically.
- ${CLAIMS_RULE}
- ${ACQUISITION_TERM_RULE}
- ${TIME_OF_DAY_RULE}
- Never say "mirror, not a coach". No recording-duration claims. No health or mental-health outcome promises.
- Only use the dollar amounts given to you.`;

export async function writeDrafts(c: Candidate, fixIssues?: string[]): Promise<{ costUsd: number; subject: string; body: string; dm: string }> {
  const detail = (c.scoreDetail as { detail?: string | null } | undefined)?.detail ?? null;
  const name = firstName(c);
  const user = JSON.stringify({
    creator: {
      handle: `@${c.handle}`,
      platform: c.platform,
      firstName: name,
      persona: c.persona ? PERSONAS[c.persona].description : null,
      creatorType: c.creatorType,
      credentials: c.credentials ?? null,
      detail,
      captions: (c.recentVideos ?? []).slice(0, 3).map((v) => v.caption).filter(Boolean),
      transcripts: (c.recentVideos ?? []).slice(0, 2).map((v) => v.transcript?.slice(0, 400)).filter(Boolean),
      keenansNotes: c.notes ?? null,
    },
    offer: offerTerms(),
    rate: rateSituation(c),
    ...(c.creatorType === "credentialed"
      ? { credentialedNote: "They'd speak as someone who uses Ripple, not as a professional prescribing it. Don't mention their clients." }
      : {}),
    limits: {
      emailBodyMaxWords: EMAIL_MAX_WORDS - 25,
      dmMaxWords: DM_MAX_WORDS,
    },
    ...(fixIssues?.length ? { fixTheseIssuesFromTheLastDraft: fixIssues } : {}),
    answerFormat:
      '{"subject": "short, plain, includes the word Ripple", "body": "greeting line, then the email body only", "dm": "the DM version (under the DM limit, same rules, can end with \\"No worries if it\'s not a fit.\\")"}',
  });
  const { text, costUsd } = await callUgcModel({
    purpose: fixIssues ? "draft-rewrite" : "draft",
    model: CONTENT_MODEL,
    system: SYSTEM,
    user,
    maxTokens: 900,
    effort: "medium",
  });
  const r = parseJsonReply<{ subject?: string; body?: string; dm?: string }>(text);
  return {
    costUsd,
    subject: (r.subject ?? "Ripple: paid UGC videos").trim().slice(0, 120),
    body: (r.body ?? "").trim(),
    dm: (r.dm ?? "").trim(),
  };
}

/** Write, check, one rewrite if flagged, check again. Mutates the candidate. */
export async function draftForCandidate(c: Candidate): Promise<{ costUsd: number }> {
  let d = await writeDrafts(c);
  let cost = d.costUsd;
  let email = await checkEmail(c, d.subject, composeEmail(d.body));
  let dm = await checkDm(c, d.dm);
  if (email.status === "flagged" || dm.status === "flagged") {
    const issues = [...email.issues.map((i) => `email: ${i}`), ...dm.issues.map((i) => `dm: ${i}`)].filter(
      (i) => !/Jev didn't answer/.test(i)
    );
    d = await writeDrafts(c, issues);
    cost += d.costUsd;
    email = await checkEmail(c, d.subject, composeEmail(d.body));
    dm = await checkDm(c, d.dm);
  }
  c.emailSubject = d.subject;
  c.emailDraft = composeEmail(d.body);
  c.dmDraft = d.dm;
  const statuses = [email.status, dm.status];
  c.claimsStatus = statuses.includes("flagged") ? "flagged" : statuses.includes("unchecked") ? "unchecked" : "passed";
  c.claimsNotes = [...email.issues.map((i) => `email: ${i}`), ...dm.issues.map((i) => `dm: ${i}`)].join("; ") || undefined;
  return { costUsd: cost };
}

/** The single follow-up (no model, so nothing new to claims-check). */
export function followUpBody(firstNameOrNull: string | null): string {
  const hi = firstNameOrNull ? `Hi ${firstNameOrNull},` : "Hi,";
  return composeEmail(
    `${hi}\n\nBumping my note about making ${BUNDLE_SIZE} ad videos for Ripple in case it got buried. If you're up for it, just reply with your rate and availability.`
  );
}

/** Re-check an edited draft (admin Edit). */
export async function recheckDraft(
  c: Candidate,
  subject: string,
  emailFull: string,
  dm: string
): Promise<{ status: ClaimsResult["status"]; notes: string | null }> {
  const email = await checkEmail(c, subject, emailFull);
  const d = await checkDm(c, dm);
  const statuses = [email.status, d.status];
  return {
    status: statuses.includes("flagged") ? "flagged" : statuses.includes("unchecked") ? "unchecked" : "passed",
    notes: [...email.issues.map((i) => `email: ${i}`), ...d.issues.map((i) => `dm: ${i}`)].join("; ") || null,
  };
}

export { firstName };
