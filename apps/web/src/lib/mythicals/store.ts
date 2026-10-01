/**
 * Legendary Mythicals site state (2026-10-01): kept as JSON in Supabase
 * storage so the site needs no schema change. Data (events, subscribers,
 * orders: these hold emails) lives in the PRIVATE "mythicals-data" bucket,
 * created on first write; content-factory is public, so only images go
 * there (content-factory/mythicals-site/...). Volumes are small (a few hundred writes a day); appends are
 * read-modify-write, so a rare concurrent append can be lost. That is
 * acceptable for analytics, and subscribers/orders also get emailed.
 */

const PUBLIC_BUCKET = "content-factory";
const DATA_BUCKET = "mythicals-data";
const ROOT = "mythicals-site";

let dataBucketReady: Promise<void> | null = null;

async function storage() {
  const { supabase } = await import("@/lib/supabase.server");
  dataBucketReady ??= (async () => {
    const { data } = await supabase.storage.getBucket(DATA_BUCKET);
    if (!data) {
      const { error } = await supabase.storage.createBucket(DATA_BUCKET, { public: false });
      if (error && !/exists/i.test(error.message)) {
        dataBucketReady = null;
        throw new Error(`[mythicals-store] create bucket: ${error.message}`);
      }
    }
  })();
  await dataBucketReady;
  return supabase.storage.from(DATA_BUCKET);
}

async function publicStorage() {
  const { supabase } = await import("@/lib/supabase.server");
  return supabase.storage.from(PUBLIC_BUCKET);
}

async function readText(path: string): Promise<string | null> {
  const s = await storage();
  const { data } = await s.download(path);
  return data ? await data.text() : null;
}

async function writeText(path: string, body: string, contentType = "application/json"): Promise<void> {
  const s = await storage();
  const { error } = await s.upload(path, Buffer.from(body), { contentType, upsert: true });
  if (error) throw new Error(`[mythicals-store] write ${path}: ${error.message}`);
}

async function appendLine(path: string, obj: unknown): Promise<void> {
  const prev = (await readText(path)) ?? "";
  await writeText(path, `${prev}${JSON.stringify(obj)}\n`, "application/x-ndjson");
}

export type SiteEvent =
  | "page_view"
  | "quiz_start"
  | "quiz_complete"
  | "result_view"
  | "share"
  | "signup"
  | "checkout_start"
  | "order_paid"
  | "order_delivered";

/** Analytics: one JSON line per event, one file per UTC day. Never throws. */
export async function logEvent(type: SiteEvent, data: Record<string, unknown> = {}): Promise<void> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    await appendLine(`${ROOT}/events/${day}.jsonl`, { t: new Date().toISOString(), type, ...data });
  } catch (err) {
    console.warn("[mythicals] logEvent failed:", err instanceof Error ? err.message : err);
  }
}

export interface Subscriber {
  email: string;
  slug: string;
  at: string;
  source?: string;
}

export async function addSubscriber(sub: Subscriber): Promise<{ isNew: boolean }> {
  const path = `${ROOT}/subscribers.jsonl`;
  const prev = (await readText(path)) ?? "";
  const email = sub.email.toLowerCase();
  if (prev.split("\n").some((l) => l.includes(`"email":"${email}"`))) return { isNew: false };
  await writeText(path, `${prev}${JSON.stringify({ ...sub, email })}\n`, "application/x-ndjson");
  return { isNew: true };
}

export interface PortraitOrder {
  sessionId: string;
  status: "paid" | "generating" | "delivered" | "failed";
  email: string | null;
  heroName: string;
  element: string;
  slug: string;
  answers: number[];
  amountCents: number | null;
  createdAt: string;
  updatedAt: string;
  portraitUrl?: string;
  cardUrl?: string;
  lore?: { creatureName: string; title: string; powers: string[]; backstory: string };
  error?: string;
}

export async function readOrder(sessionId: string): Promise<PortraitOrder | null> {
  const t = await readText(`${ROOT}/orders/${sessionId}.json`);
  return t ? (JSON.parse(t) as PortraitOrder) : null;
}

export async function writeOrder(order: PortraitOrder): Promise<void> {
  await writeText(`${ROOT}/orders/${order.sessionId}.json`, JSON.stringify(order, null, 1));
}

/** Public image upload (content-factory/mythicals-site/<path>) → public URL. */
export async function uploadAsset(path: string, buf: Buffer, contentType: string): Promise<string> {
  const s = await publicStorage();
  const full = `${ROOT}/${path}`;
  const { error } = await s.upload(full, buf, { contentType, upsert: true });
  if (error) throw new Error(`[mythicals-store] upload ${full}: ${error.message}`);
  return s.getPublicUrl(full).data.publicUrl;
}

/** Unsubscribes are appended; any future send must skip these emails. */
export async function addUnsubscribe(email: string): Promise<void> {
  await appendLine(`${ROOT}/unsubscribed.jsonl`, { email: email.toLowerCase(), at: new Date().toISOString() });
}
