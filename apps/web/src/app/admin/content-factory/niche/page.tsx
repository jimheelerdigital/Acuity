"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NicheAccount {
  id: string;
  platform: "INSTAGRAM" | "TIKTOK";
  handle: string;
  displayName: string | null;
  notes: string | null;
  followers: number | null;
  active: boolean;
  discovered: boolean;
  addedAt: string;
  lastScrapedAt: string | null;
  _count: { posts: number };
}

interface NicheHashtag {
  id: string;
  tag: string;
  postCount: number | null;
  medianViews: number | null;
  medianLikes: number | null;
  score: number | null;
  lastCheckedAt: string | null;
}

interface NicheMemo {
  id: string;
  weekOf: string;
  content: string;
  createdAt: string;
}

interface NichePost {
  id: string;
  url: string;
  caption: string | null;
  hashtags: string[];
  mediaType: string | null;
  thumbnailUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  postedAt: string;
  engagementRatio: number | null;
  suggestedComment?: string | null;
  account: {
    handle: string;
    displayName: string | null;
    followers: number | null;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtNum = (n: number | null): string => {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const daysAgo = (iso: string): string => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
};

/** Ratio badge: ≥2 = breakout (good), ≥1.3 = above average, else quiet. */
function RatioBadge({ ratio }: { ratio: number | null }) {
  if (ratio === null) return null;
  const style =
    ratio >= 2
      ? "bg-acuity-good-soft text-acuity-good"
      : ratio >= 1.3
        ? "bg-acuity-primary-soft text-acuity-primary"
        : "bg-acuity-bg-inset text-acuity-text-quiet";
  return (
    <span className={`rounded-acuity-pill px-2 py-0.5 text-[9px] font-mono font-bold tabular-nums ${style}`}>
      {ratio.toFixed(1)}×
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function NicheLabPage() {
  const [accounts, setAccounts] = useState<NicheAccount[]>([]);
  const [topPosts, setTopPosts] = useState<NichePost[]>([]);
  const [memo, setMemo] = useState<NicheMemo | null>(null);
  const [memoOpen, setMemoOpen] = useState(false);
  const [queue, setQueue] = useState<NichePost[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<NicheHashtag[]>([]);
  const [tagsCopied, setTagsCopied] = useState(false);
  const [apifyConfigured, setApifyConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [newHandle, setNewHandle] = useState("");
  const [scrapeMsg, setScrapeMsg] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<{ id: string; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/niche?days=${days}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      setTopPosts(data.topPosts ?? []);
      setMemo(data.latestMemo ?? null);
      setQueue(data.engagementQueue ?? []);
      setHashtags(data.hashtags ?? []);
      setApifyConfigured(Boolean(data.apifyConfigured));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const doAction = async (action: string, params: Record<string, string> = {}) => {
    setBusy(action + (params.accountId ?? ""));
    try {
      const res = await fetch("/api/admin/niche", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...params }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const addAccount = async () => {
    if (!newHandle.trim()) return;
    await doAction("add-account", { handle: newHandle });
    setNewHandle("");
  };

  const scrapeNow = async () => {
    await doAction("scrape-now");
    setScrapeMsg("Scrape queued — results land in a few minutes. Refresh to see them.");
    setTimeout(() => setScrapeMsg(null), 8000);
  };

  return (
    <div
      className="min-h-[100dvh] bg-acuity-bg px-4 pb-16"
      data-theme="dark"
      style={{ paddingTop: "max(16px, env(safe-area-inset-top, 16px))" }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Content Factory
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-acuity-text">
            Niche Lab
          </h1>
        </div>
        <button
          onClick={scrapeNow}
          disabled={busy === "scrape-now" || !apifyConfigured}
          className="min-h-[40px] shrink-0 rounded-acuity-pill bg-acuity-primary px-4 text-sm font-medium text-white active:opacity-80 disabled:opacity-50"
        >
          {busy === "scrape-now" ? "Queuing…" : "Scrape now"}
        </button>
      </div>

      {!apifyConfigured && (
        <div className="mb-4 rounded-acuity-lg bg-acuity-warn-soft p-3 text-xs text-acuity-warn">
          APIFY_TOKEN is not set — nightly scraping is off. Add it in Vercel env vars to turn the lab on.
        </div>
      )}
      {scrapeMsg && (
        <p className="mb-3 text-[11px] font-mono text-acuity-good">{scrapeMsg}</p>
      )}
      {error && (
        <div className="mb-4 rounded-acuity-lg bg-acuity-bad-soft p-3 text-xs text-acuity-bad">
          {error}
        </div>
      )}

      {/* ── Weekly strategy memo ───────────────────────────────────── */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-mono font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Strategy memo
            {memo
              ? ` · week of ${new Date(memo.weekOf).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : ""}
          </p>
          <button
            onClick={() => {
              doAction("memo-now");
              setScrapeMsg("Memo queued — it lands here and in your email in ~1 minute.");
              setTimeout(() => setScrapeMsg(null), 8000);
            }}
            disabled={busy === "memo-now"}
            className="min-h-[32px] rounded-acuity-pill border border-acuity-line px-3 text-[11px] text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-50"
          >
            {busy === "memo-now" ? "…" : "Write memo now"}
          </button>
        </div>
        {memo ? (
          <div className="rounded-acuity-lg bg-acuity-card-bg p-4">
            <pre
              className={`whitespace-pre-wrap font-sans text-xs leading-relaxed text-acuity-text-sec ${memoOpen ? "" : "line-clamp-6"}`}
            >
              {memo.content}
            </pre>
            <button
              onClick={() => setMemoOpen((o) => !o)}
              className="mt-2 text-[11px] font-mono text-acuity-primary"
            >
              {memoOpen ? "Collapse" : "Read full memo"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-acuity-text-quiet">
            No memo yet — one is written every Monday morning once niche data exists.
          </p>
        )}
      </section>

      {/* ── Tracked accounts ───────────────────────────────────────── */}
      <section className="mb-6">
        <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          Tracked accounts · {accounts.filter((a) => a.active).length} active
        </p>

        <div className="mb-3 flex items-center gap-2">
          <input
            type="text"
            placeholder="@handle or instagram.com link"
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAccount()}
            className="min-w-0 flex-1 rounded-acuity-sm bg-acuity-bg-inset px-3 py-2.5 text-sm text-acuity-text placeholder:text-acuity-text-quiet focus:outline-none focus:ring-1 focus:ring-acuity-primary"
          />
          <button
            onClick={addAccount}
            disabled={busy?.startsWith("add-account") || !newHandle.trim()}
            className="min-h-[40px] shrink-0 rounded-acuity-pill border border-acuity-line px-4 text-sm text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-50"
          >
            {busy?.startsWith("add-account") ? "…" : "Track"}
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-acuity-text-quiet">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="text-xs text-acuity-text-quiet">
            No accounts yet. Add the accounts in your niche whose posts you want to learn from.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {accounts.map((a) => (
              <div
                key={a.id}
                className={`rounded-acuity-lg bg-acuity-card-bg p-3 ${a.active ? "" : "opacity-50"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://www.instagram.com/${a.handle}/`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-sm font-semibold text-acuity-text"
                      >
                        @{a.handle}
                      </a>
                      {a.discovered && (
                        <span className="rounded-acuity-pill bg-acuity-secondary-soft px-2 py-0.5 text-[9px] font-mono text-acuity-secondary">
                          Discovered
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono tabular-nums text-acuity-text-quiet">
                      {fmtNum(a.followers)} followers · {a._count.posts} posts tracked
                      {a.lastScrapedAt ? ` · scraped ${daysAgo(a.lastScrapedAt)}` : " · never scraped"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() =>
                        setNotesDraft(
                          notesDraft?.id === a.id ? null : { id: a.id, text: a.notes ?? "" }
                        )
                      }
                      className="min-h-[36px] rounded-acuity-pill border border-acuity-line px-3 text-xs text-acuity-text-sec active:bg-acuity-bg-sub"
                    >
                      Notes
                    </button>
                    <button
                      onClick={() => doAction("toggle-active", { accountId: a.id })}
                      disabled={busy === `toggle-active${a.id}`}
                      className="min-h-[36px] rounded-acuity-pill border border-acuity-line px-3 text-xs text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-50"
                    >
                      {a.active ? "Pause" : "Resume"}
                    </button>
                  </div>
                </div>
                {a.notes && notesDraft?.id !== a.id && (
                  <p className="mt-1.5 text-xs text-acuity-text-sec">{a.notes}</p>
                )}
                {notesDraft?.id === a.id && (
                  <div className="mt-2 flex items-end gap-2">
                    <textarea
                      value={notesDraft.text}
                      onChange={(e) => setNotesDraft({ id: a.id, text: e.target.value })}
                      placeholder="Why track this account? What should we emulate?"
                      rows={2}
                      className="min-w-0 flex-1 rounded-acuity-sm bg-acuity-bg-inset px-3 py-2 text-xs text-acuity-text placeholder:text-acuity-text-quiet focus:outline-none focus:ring-1 focus:ring-acuity-primary"
                    />
                    <button
                      onClick={async () => {
                        await doAction("update-notes", {
                          accountId: a.id,
                          notes: notesDraft.text,
                        });
                        setNotesDraft(null);
                      }}
                      className="min-h-[36px] shrink-0 rounded-acuity-pill bg-acuity-primary px-3 text-xs font-medium text-white active:opacity-80"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Engagement queue (manual — nothing is auto-posted) ─────── */}
      {queue.length > 0 && (
        <section className="mb-6">
          <p className="mb-1 text-[10px] font-mono font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Engagement queue · {queue.length}
          </p>
          <p className="mb-2 text-[11px] text-acuity-text-quiet">
            Breakout posts worth a comment. Copy the draft, open the post, comment yourself — nothing is ever posted automatically.
          </p>
          <div className="flex flex-col gap-2">
            {queue.map((p) => (
              <div key={p.id} className="rounded-acuity-lg bg-acuity-card-bg p-3">
                <div className="flex items-center gap-2">
                  <RatioBadge ratio={p.engagementRatio} />
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[11px] font-mono text-acuity-secondary"
                  >
                    @{p.account.handle} · {daysAgo(p.postedAt)} ↗
                  </a>
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] text-acuity-text-quiet">
                  {p.caption ?? ""}
                </p>
                <p className="mt-1.5 rounded-acuity-sm bg-acuity-bg-inset px-3 py-2 text-xs leading-relaxed text-acuity-text">
                  {p.suggestedComment}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(p.suggestedComment ?? "");
                      setCopiedId(p.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }}
                    className="min-h-[36px] rounded-acuity-pill bg-acuity-primary px-4 text-xs font-medium text-white active:opacity-80"
                  >
                    {copiedId === p.id ? "Copied ✓" : "Copy comment"}
                  </button>
                  <button
                    onClick={() => doAction("mark-engaged", { postId: p.id })}
                    disabled={busy === `mark-engaged`}
                    className="min-h-[36px] rounded-acuity-pill border border-acuity-line px-4 text-xs text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-50"
                  >
                    Mark engaged
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Hashtag research ───────────────────────────────────────── */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-mono font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Best hashtags
          </p>
          <div className="flex gap-1.5">
            {hashtags.length > 0 && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    hashtags.slice(0, 15).map((h) => `#${h.tag}`).join(" ")
                  );
                  setTagsCopied(true);
                  setTimeout(() => setTagsCopied(false), 2000);
                }}
                className="min-h-[32px] rounded-acuity-pill border border-acuity-line px-3 text-[11px] text-acuity-text-sec active:bg-acuity-bg-sub"
              >
                {tagsCopied ? "Copied ✓" : "Copy top 15"}
              </button>
            )}
            <button
              onClick={() => {
                doAction("discover-now");
                setScrapeMsg("Discovery queued — new hashtag scores and suggested accounts land in a few minutes.");
                setTimeout(() => setScrapeMsg(null), 8000);
              }}
              disabled={busy === "discover-now" || !apifyConfigured}
              className="min-h-[32px] rounded-acuity-pill border border-acuity-line px-3 text-[11px] text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-50"
            >
              {busy === "discover-now" ? "…" : "Run discovery"}
            </button>
          </div>
        </div>
        {hashtags.length === 0 ? (
          <p className="text-xs text-acuity-text-quiet">
            No hashtag data yet — discovery runs weekly (or run it now) once tracked accounts have posts.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {hashtags.map((h) => (
              <span
                key={h.id}
                title={`median ${fmtNum(h.medianLikes)} likes${h.medianViews !== null ? ` · ${fmtNum(h.medianViews)} views` : ""} across ${h.postCount ?? "?"} top posts`}
                className="rounded-acuity-pill bg-acuity-bg-sub px-3 py-1.5 text-[11px] font-mono text-acuity-text-sec"
              >
                #{h.tag}
                <span className="ml-1.5 tabular-nums text-acuity-text-quiet">
                  {fmtNum(h.medianLikes)}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── Overperforming posts ───────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-mono font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Overperforming in the niche
          </p>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-acuity-pill px-3 py-1 text-[11px] font-mono tabular-nums ${
                  days === d
                    ? "bg-acuity-primary text-white"
                    : "bg-acuity-bg-sub text-acuity-text-sec"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-acuity-text-quiet">Loading…</p>
        ) : topPosts.length === 0 ? (
          <p className="text-xs text-acuity-text-quiet">
            Nothing yet — posts appear after the first scrape of a tracked account.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {topPosts.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="flex gap-3 rounded-acuity-lg bg-acuity-card-bg p-3 active:bg-acuity-bg-sub"
              >
                {p.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnailUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-acuity-sm object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 shrink-0 rounded-acuity-sm bg-acuity-bg-inset" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <RatioBadge ratio={p.engagementRatio} />
                    <span className="truncate text-[11px] font-mono text-acuity-text-ter">
                      @{p.account.handle} · {daysAgo(p.postedAt)}
                      {p.mediaType ? ` · ${p.mediaType.toLowerCase()}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-acuity-text-sec">
                    {p.caption ?? "(no caption)"}
                  </p>
                  <p className="mt-1 text-[10px] font-mono tabular-nums text-acuity-text-quiet">
                    {fmtNum(p.likes)} likes · {fmtNum(p.comments)} comments
                    {p.views !== null ? ` · ${fmtNum(p.views)} views` : ""}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
