/**
 * Generate many, cut hard, then rank (2026-10-13, per Keenan: "we're
 * supposed to be feeding JEV multiple prompts from OPUS, at which point jev
 * helps us narrow down the best one ... based on data that we pull").
 *
 * For one post slot (Ripple selfie, Mythicals choice) the caller drafts
 * several complete candidates with Opus, then:
 *   1. HARD RULES (code, pass/fail) — the caller's own reject();
 *   2. PLAIN SENSE (Opus editor, pass/fail) — the caller's senseCheck();
 *   3. RANK — Jev scores every survivor on the brand's calibrated questions
 *      (candidate-calibration.ts) with the weekly brief in its state; when
 *      Jev is off, killed by calibration, or fails, Opus ranks instead.
 * Nothing that failed 1 or 2 can win. With no survivors the caller gets
 * null and decides (Ripple holds the post from auto-posting).
 */

import { askJev, jevEnabled, noulOf, type JevQuestion } from "./jev";
import {
  CANDIDATE_DIMS,
  readCandidateWeights,
  type CandidateBrand,
} from "./candidate-calibration";
import { readBriefBlock } from "./weekly-brief";
import { contentAnthropic, lastJsonText, messageText, VISION_MODEL } from "./claude-client";

/** Opus writes candidates (Keenan, 2026-10-13: "use opus"). Env-overridable. */
export const CANDIDATE_WRITER_MODEL = (process.env.CANDIDATE_WRITER_MODEL || "claude-opus-5-5").trim();
export const CANDIDATE_COUNT = Math.max(2, Math.min(6, Number(process.env.CANDIDATE_COUNT) || 5));

const AUDIENCE: Record<CandidateBrand, string> = {
  ripple:
    "Women roughly 40-50 carrying the mental load for everyone around them (work, kids, partner, aging parents), scrolling Instagram or Facebook on a phone. They stop for posts that name their exact life plainly; they skip anything preachy, clever-for-its-own-sake, or written like a brand.",
  mythicals:
    "Fans of fantasy, mythology, games, anime and epic film, mostly 16-35, scrolling Instagram, YouTube Shorts or TikTok. They stop for an epic 'which would you choose' debate and comment their pick.",
};

const QUESTIONS: Record<CandidateBrand, Record<string, (i: number) => string>> = {
  ripple: {
    comment: (i) =>
      `Would the reader described in \`audience\` comment on or answer the post \`candidates[${i}]\`, because it describes her own life and asks something she wants to answer?`,
    send: (i) =>
      `Would the reader described in \`audience\` send the post \`candidates[${i}]\` to a friend or partner with a message like "this is so me"?`,
  },
  mythicals: {
    comment: (i) =>
      `Would a fan described in \`audience\` comment their pick on the post \`candidates[${i}]\`, because the choice is genuinely hard and every option is something they'd love to be or own?`,
    watch: (i) =>
      `Would a fan described in \`audience\` watch the reel of \`candidates[${i}]\` all the way to the last option?`,
  },
};

export interface RankedCandidate<T> {
  winner: T;
  index: number;
  /** Winner's Jev answers per dimension (null when Opus ranked). */
  jev: Record<string, number> | null;
  rankedBy: "jev" | "opus" | "only-survivor";
  survivors: number;
  rejected: { index: number; reason: string }[];
  table: string;
}

export async function rankCandidates<T>(opts: {
  brand: CandidateBrand;
  label: string;
  candidates: T[];
  /** Reader-facing text of one candidate, as the audience would read it. */
  render: (c: T) => string;
  /** Code rules: return a reason to cut, or null. */
  reject?: (c: T) => Promise<string | null> | string | null;
  /** Opus plain-sense editor: return a reason to cut, or null. */
  senseCheck: (c: T) => Promise<string | null>;
}): Promise<RankedCandidate<T> | null> {
  const { brand, label, candidates } = opts;
  const rejected: { index: number; reason: string }[] = [];

  // 1 + 2: code rules, then the sense editor, all candidates in parallel.
  const verdicts = await Promise.all(
    candidates.map(async (c, i) => {
      const rule = opts.reject ? await opts.reject(c) : null;
      if (rule) return { i, reason: `rule: ${rule}` };
      const sense = await opts.senseCheck(c);
      return sense ? { i, reason: `sense: ${sense}` } : { i, reason: null };
    })
  );
  const survivors: number[] = [];
  for (const v of verdicts) {
    if (v.reason) rejected.push({ index: v.i, reason: v.reason });
    else survivors.push(v.i);
  }
  for (const r of rejected) console.log(`[candidates] ${label} #${r.index} cut — ${r.reason}`);
  if (survivors.length === 0) return null;
  if (survivors.length === 1) {
    const i = survivors[0];
    return { winner: candidates[i], index: i, jev: null, rankedBy: "only-survivor", survivors: 1, rejected, table: `only #${i} survived` };
  }

  // 3: rank survivors.
  const texts = survivors.map((i) => opts.render(candidates[i]));
  const brief = await readBriefBlock(brand);
  const { weights, jevOff } = await readCandidateWeights(brand);
  if (jevEnabled() && !jevOff) {
    const dims = CANDIDATE_DIMS[brand];
    const questions: Record<string, JevQuestion> = {};
    texts.forEach((_, k) => {
      for (const d of dims) questions[`${d}_${k}`] = { type: "noul", instructions: QUESTIONS[brand][d](k) };
    });
    const r = await askJev(
      `candidate-rank:${label}`,
      { audience: AUDIENCE[brand], whatWorks: brief.slice(0, 4000), candidates: texts },
      questions
    );
    if (r) {
      const rows = texts.map((_, k) => {
        const s: Record<string, number> = {};
        for (const d of dims) s[d] = noulOf(r, `${d}_${k}`) ?? 0;
        const total = dims.reduce((a, d) => a + (weights[d] ?? 0) * s[d], 0);
        return { k, s, total };
      });
      if (rows.some((x) => x.total > 0)) {
        rows.sort((a, b) => b.total - a.total);
        const best = rows[0];
        const table = rows
          .map(
            (x) =>
              `  ${x === best ? "*" : " "} ${x.total.toFixed(3)} ${dims.map((d) => `${d}=${x.s[d].toFixed(2)}`).join(" ")}  #${survivors[x.k]} ${texts[x.k].split("\n")[0].slice(0, 90)}`
          )
          .join("\n");
        console.log(`[candidates] ${label} ranked by Jev (${survivors.length}/${candidates.length} survived)\n${table}`);
        const i = survivors[best.k];
        return { winner: candidates[i], index: i, jev: best.s, rankedBy: "jev", survivors: survivors.length, rejected, table };
      }
    }
  }

  // Opus ranks when Jev is off / killed / failed.
  const k = await opusPick(brand, label, texts, brief);
  const i = survivors[k];
  console.log(`[candidates] ${label} ranked by Opus: #${i} (${survivors.length}/${candidates.length} survived)`);
  return { winner: candidates[i], index: i, jev: null, rankedBy: "opus", survivors: survivors.length, rejected, table: `opus picked #${i}` };
}

async function opusPick(brand: CandidateBrand, label: string, texts: string[], brief: string): Promise<number> {
  try {
    const res = await contentAnthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 300,
      effort: "medium",
      system: `You pick the one social post most likely to earn comments, shares and views from this audience: ${AUDIENCE[brand]}\n\n${brief.slice(0, 4000)}\n\nReturn only JSON: {"best": <index>, "why": "one sentence"}`,
      messages: [{ role: "user", content: texts.map((t, k) => `#${k}\n${t}`).join("\n\n") }],
    });
    const parsed = JSON.parse(lastJsonText(messageText(res))) as { best?: number };
    const b = Number(parsed.best);
    return Number.isInteger(b) && b >= 0 && b < texts.length ? b : 0;
  } catch (err) {
    console.warn(`[candidates] ${label} Opus pick failed — taking the first survivor:`, err instanceof Error ? err.message : err);
    return 0;
  }
}
