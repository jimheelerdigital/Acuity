/**
 * Apify runs with a hard dollar cap (UGC outreach). The rest of the repo
 * uses run-sync-get-dataset-items (competitor-mimic.ts runApifyActor), which
 * can't cap spend; this starts the run async with maxItems and
 * maxTotalChargeUsd, waits for it inside the caller's step, and reports
 * what the run cost so the pipeline can stop at APIFY_SPEND_CAP_PER_RUN.
 */
const APIFY_BASE = "https://api.apify.com/v2";
/** Used when Apify doesn't report a run's result charge (per 1,000 items). */
const FALLBACK_USD_PER_ITEM = 0.003;
const WAIT_BUDGET_MS = 230_000;

export function apifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

export interface CappedRun {
  items: Record<string, unknown>[];
  costUsd: number;
}

type RunData = {
  id: string;
  status: string;
  defaultDatasetId: string;
  usageTotalUsd?: number;
  chargedEventCounts?: Record<string, number>;
  pricingInfo?: {
    pricingModel?: string;
    pricePerUnitUsd?: number;
    pricingPerEvent?: { actorChargeEvents?: Record<string, { eventPriceUsd?: number }> };
  };
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN not set");
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${APIFY_BASE}${path}${sep}token=${token}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(70_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify ${path.split("?")[0]} → ${res.status}: ${body.slice(0, 200)}`);
  }
  // Run endpoints wrap the payload in { data }; dataset items are a bare array.
  const json = (await res.json()) as unknown;
  return (Array.isArray(json) ? json : (json as { data: T }).data) as T;
}

function runCost(run: RunData, itemCount: number): number {
  let cost = run.usageTotalUsd ?? 0;
  const p = run.pricingInfo;
  if (p?.pricingModel === "PRICE_PER_DATASET_ITEM" && p.pricePerUnitUsd) {
    cost += itemCount * p.pricePerUnitUsd;
  } else if (p?.pricingModel === "PAY_PER_EVENT" && run.chargedEventCounts) {
    const prices = p.pricingPerEvent?.actorChargeEvents ?? {};
    for (const [ev, n] of Object.entries(run.chargedEventCounts)) {
      cost += n * (prices[ev]?.eventPriceUsd ?? 0);
    }
  } else if (!p && !run.usageTotalUsd) {
    cost = itemCount * FALLBACK_USD_PER_ITEM;
  }
  return Math.round(cost * 10_000) / 10_000;
}

/**
 * Run one actor with at most `maxItems` results and `maxUsd` spend. Throws
 * on config/HTTP failure (the caller records it loudly on the run).
 */
export async function runApifyCapped(
  actorId: string,
  input: object,
  opts: { maxItems: number; maxUsd: number }
): Promise<CappedRun> {
  if (opts.maxUsd <= 0 || opts.maxItems <= 0) return { items: [], costUsd: 0 };
  const qs = new URLSearchParams({
    maxItems: String(Math.floor(opts.maxItems)),
    maxTotalChargeUsd: opts.maxUsd.toFixed(2),
    memory: "1024",
    timeout: String(Math.floor(WAIT_BUDGET_MS / 1000)),
    waitForFinish: "60",
  });
  let run = await api<RunData>(`/acts/${actorId}/runs?${qs}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  const deadline = Date.now() + WAIT_BUDGET_MS;
  while (["READY", "RUNNING"].includes(run.status) && Date.now() < deadline) {
    run = await api<RunData>(`/actor-runs/${run.id}?waitForFinish=60`);
  }
  if (["READY", "RUNNING"].includes(run.status)) {
    run = await api<RunData>(`/actor-runs/${run.id}/abort`, { method: "POST" });
  }
  const items = await api<Record<string, unknown>[]>(
    `/datasets/${run.defaultDatasetId}/items?clean=true&limit=${Math.floor(opts.maxItems)}`
  ).catch(() => [] as Record<string, unknown>[]);
  const list = Array.isArray(items) ? items : [];
  // Re-read the run for its final usage numbers.
  const final = await api<RunData>(`/actor-runs/${run.id}`).catch(() => run);
  return { items: list, costUsd: runCost(final, list.length) };
}
