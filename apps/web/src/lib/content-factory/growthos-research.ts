/**
 * Content Factory — growthos research feed (2026-08-21, per Keenan:
 * "link up our carousel to Jim's pre built social research engine").
 *
 * growthos (jimheelerdigital/growthos) is Jim's social research engine:
 * its own Supabase project holds canonical research — verified claims,
 * opportunities, learning insights from posted content, and tracked
 * competitor videos scored for breakout performance. This module reads
 * that research over the Supabase REST API and formats it as a prompt
 * block that generateTopic() feeds to Claude alongside Keenan's manual
 * performance feedback.
 *
 * Design rules:
 * - BEST-EFFORT ONLY. If the env vars are unset, the DB is empty (it is
 *   at link time — growthos hasn't been seeded yet), a query fails, or
 *   the whole fetch times out, carousel generation continues exactly as
 *   before. This link must never be able to break a daily post.
 * - Reads only. The write-back (publishing results into growthos's
 *   learning loop) is a later phase, agreed with Jim first.
 *
 * Env (all optional — feature is off until the first two are set):
 * - GROWTHOS_SUPABASE_URL          e.g. https://<ref>.supabase.co
 * - GROWTHOS_SUPABASE_SERVICE_KEY  service-role key (server-only!)
 * - GROWTHOS_WORKSPACE_ID          uuid; scopes queries when growthos
 *                                  hosts more than one workspace
 */

const FETCH_TIMEOUT_MS = 8_000;
const PER_TABLE_LIMIT = 8;

export interface GrowthosResearch {
  /** learning_insights: signal + recommendation from posted content. */
  insights: string[];
  /** canonical_claims with verification_state=verified. */
  claims: string[];
  /** canonical_opportunities (open content angles). */
  opportunities: string[];
  /** competitor_videos ranked by breakout_score. */
  breakoutVideos: string[];
}

/** Pull a human-readable line out of a canonical_payload jsonb blob. */
function payloadText(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    // Try the likely text-bearing keys; exact shape TBC with Jim.
    for (const key of ["claim", "statement", "summary", "text", "title", "headline", "description", "angle"]) {
      if (typeof p[key] === "string" && (p[key] as string).trim()) {
        return (p[key] as string).trim();
      }
    }
    return JSON.stringify(payload).slice(0, 200);
  }
  return "";
}

async function restGet(
  baseUrl: string,
  serviceKey: string,
  pathAndQuery: string
): Promise<Record<string, unknown>[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/rest/v1/${pathAndQuery}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`growthos REST ${res.status} on ${pathAndQuery.split("?")[0]}`);
    }
    return (await res.json()) as Record<string, unknown>[];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the current research picture from growthos. Returns null when
 * the link is unconfigured or there is nothing usable — callers treat
 * null as "generate exactly as before".
 */
export async function fetchGrowthosResearch(): Promise<GrowthosResearch | null> {
  const baseUrl = process.env.GROWTHOS_SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.GROWTHOS_SUPABASE_SERVICE_KEY;
  if (!baseUrl || !serviceKey) return null;

  const ws = process.env.GROWTHOS_WORKSPACE_ID
    ? `&workspace_id=eq.${process.env.GROWTHOS_WORKSPACE_ID}`
    : "";
  const lim = `limit=${PER_TABLE_LIMIT}`;

  const [insightsQ, claimsQ, oppsQ, videosQ] = await Promise.allSettled([
    restGet(
      baseUrl,
      serviceKey,
      `learning_insights?select=signal,summary,recommendation&order=created_at.desc&${lim}${ws}`
    ),
    restGet(
      baseUrl,
      serviceKey,
      `canonical_claims?select=canonical_payload,classification,impact_class&verification_state=eq.verified&order=created_at.desc&${lim}${ws}`
    ),
    restGet(
      baseUrl,
      serviceKey,
      `canonical_opportunities?select=canonical_payload,communication_job,status&order=created_at.desc&${lim}${ws}`
    ),
    restGet(
      baseUrl,
      serviceKey,
      `competitor_videos?select=title,topic_labels,breakout_score,view_count&breakout_score=not.is.null&order=breakout_score.desc&${lim}${ws}`
    ),
  ]);

  const rows = (r: PromiseSettledResult<Record<string, unknown>[]>) => {
    if (r.status === "rejected") {
      console.warn("[growthos-research]", r.reason instanceof Error ? r.reason.message : r.reason);
      return [];
    }
    return r.value;
  };

  const insights = rows(insightsQ)
    .map((r) => {
      const parts = [r.signal, r.summary, r.recommendation]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim());
      return parts.join(" — ");
    })
    .filter(Boolean);

  const claims = rows(claimsQ)
    .map((r) => {
      const text = payloadText(r.canonical_payload);
      const tag = typeof r.classification === "string" ? ` (${r.classification})` : "";
      return text ? `${text}${tag}` : "";
    })
    .filter(Boolean);

  const opportunities = rows(oppsQ)
    .map((r) => {
      const text = payloadText(r.canonical_payload);
      const job = typeof r.communication_job === "string" && r.communication_job.trim()
        ? ` [job: ${r.communication_job.trim()}]`
        : "";
      return text ? `${text}${job}` : "";
    })
    .filter(Boolean);

  const breakoutVideos = rows(videosQ)
    .map((r) => {
      if (typeof r.title !== "string" || !r.title.trim()) return "";
      const topics = Array.isArray(r.topic_labels)
        ? (r.topic_labels as unknown[]).filter((t) => typeof t === "string").join(", ")
        : "";
      const score = typeof r.breakout_score === "number" ? ` (breakout ${r.breakout_score.toFixed(1)})` : "";
      return `"${r.title.trim()}"${score}${topics ? ` — topics: ${topics}` : ""}`;
    })
    .filter(Boolean);

  if (
    insights.length === 0 &&
    claims.length === 0 &&
    opportunities.length === 0 &&
    breakoutVideos.length === 0
  ) {
    return null;
  }
  return { insights, claims, opportunities, breakoutVideos };
}

/**
 * Format the research as a prompt block for generateTopic's user prompt
 * (same pattern as the existing performanceBlock). Empty string when
 * there's nothing to say.
 */
export function growthosResearchBlock(research: GrowthosResearch | null): string {
  if (!research) return "";
  const section = (label: string, lines: string[]) =>
    lines.length > 0 ? `${label}:\n${lines.map((l) => `- ${l}`).join("\n")}\n` : "";

  const body =
    section("LEARNINGS from this account's posted content (what the data says works)", research.insights) +
    section("VERIFIED AUDIENCE CLAIMS from the research engine (truths about this audience you can build on)", research.claims) +
    section("OPEN CONTENT OPPORTUNITIES the research engine surfaced (angles worth covering)", research.opportunities) +
    section("BREAKOUT COMPETITOR CONTENT (titles over-performing in this niche right now)", research.breakoutVideos);

  if (!body) return "";
  return (
    `\n\nAUDIENCE RESEARCH — live data from our social research engine. Use it to pick a RESONANT angle, not to copy:\n` +
    body +
    `Treat this as directional intelligence: lean toward the themes the learnings and opportunities point at, echo the emotional appeal (never the wording) of breakout titles, and stay inside the brand rules above. The avoid list still applies.`
  );
}
