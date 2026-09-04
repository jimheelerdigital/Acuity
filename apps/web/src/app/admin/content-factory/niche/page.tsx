"use client";

import { useCallback, useEffect, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NicheProfile {
  description: string;
  igHashtags: string[];
  tiktokHashtags: string[];
  updatedAt: string;
}

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
  platform: "INSTAGRAM" | "TIKTOK";
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
  platform: "INSTAGRAM" | "TIKTOK";
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
  viralScore: number | null;
  suggestedComment: string | null;
  engagedAt: string | null;
  authorHandle: string | null;
  account: {
    handle: string;
    displayName: string | null;
    followers: number | null;
  } | null;
}

interface TopicSuggestion {
  id: string;
  headline: string;
  angle: string;
  sourceSummary: string | null;
  createdAt: string;
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

const handleOf = (p: NichePost): string =>
  p.account?.handle ?? p.authorHandle ?? "unknown";

/** Viral/ratio badge: ≥3 = breakout (good), ≥1.5 = above avg, else quiet. */
function ViralBadge({ p }: { p: NichePost }) {
  const score = p.viralScore ?? p.engagementRatio;
  if (score === null) return null;
  const style =
    score >= 3
      ? "bg-acuity-good-soft text-acuity-good"
      : score >= 1.5
        ? "bg-acuity-primary-soft text-acuity-primary"
        : "bg-acuity-bg-inset text-acuity-text-quiet";
  return (
    <span className={`rounded-acuity-pill px-2 py-0.5 text-[9px] font-mono font-bold tabular-nums ${style}`}>
      {score.toFixed(1)}×
    </span>
  );
}

function PlatformBadge({ platform }: { platform: "INSTAGRAM" | "TIKTOK" }) {
  return (
    <span className="rounded-acuity-pill bg-acuity-bg-inset px-2 py-0.5 text-[9px] font-mono text-acuity-text-ter">
      {platform === "TIKTOK" ? "TikTok" : "IG"}
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function NicheLabPage() {
  const [profile, setProfile] = useState<NicheProfile | null>(null);
  const [viral, setViral] = useState<NichePost[]>([]);
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([]);
  const [suggestedAccounts, setSuggestedAccounts] = useState<NicheAccount[]>([]);
  const [accounts, setAccounts] = useState<NicheAccount[]>([]);
  const [memo, setMemo] = useState<NicheMemo | null>(null);
  const [memoOpen, setMemoOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<NicheHashtag[]>([]);
  const [tagsCopied, setTagsCopied] = useState(false);
  const [apifyConfigured, setApifyConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [days, setDays] = useState(2);
  const [newHandle, setNewHandle] = useState("");
  const [scrapeMsg, setScrapeMsg] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<{ id: string; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/niche?days=${days}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProfile(data.profile ?? null);
      setViral(data.viralFeed ?? []);
      setSuggestions(data.suggestions ?? []);
      setSuggestedAccounts(data.suggestedAccounts ?? []);
      setAccounts(data.trackedAccounts ?? []);
      setMemo(data.latestMemo ?? null);
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
    setBusy(action + (params.accountId ?? params.suggestionId ?? ""));
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

  const flash = (msg: string) => {
    setScrapeMsg(msg);
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
          onClick={async () => {
            await doAction("scrape-now");
            flash("Research queued — viral posts, comments, and topic ideas land in a few minutes.");
          }}
          disabled={busy === "scrape-now" || !apifyConfigured}
          className="min-h-[40px] shrink-0 rounded-acuity-pill bg-acuity-primary px-4 text-sm font-medium text-white active:opacity-80 disabled:opacity-50"
        >
          {busy === "scrape-now" ? "Queuing…" : "Run research now"}
        </button>
      </div>

      {!apifyConfigured && (
        <div className="mb-4 rounded-acuity-lg bg-acuity-warn-soft p-3 text-xs text-acuity-warn">
          APIFY_TOKEN is not set — nightly research is off. Add it in Vercel env vars to turn the lab on.
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

      {/* ── Auto-detected niche ────────────────────────────────────── */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-mono font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Your niche · auto-detected
          </p>
          <button
            onClick={async () => {
              await doAction("refresh-niche");
              flash("Niche re-detected from your recent posts.");
            }}
            disabled={busy === "refresh-niche"}
            className="min-h-[32px] rounded-acuity-pill border border-acuity-line px-3 text-[11px] text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-50"
          >
            {busy === "refresh-niche" ? "Detecting…" : "Re-detect"}
          </button>
        </div>
        {profile ? (
          <div className="rounded-acuity-lg bg-acuity-card-bg p-4">
            <p className="text-xs leading-relaxed text-acuity-text-sec">
              {profile.description}
            </p>
            <p className="mt-2 text-[10px] font-mono text-acuity-text-quiet">
              Searching {profile.igHashtags.length} IG + {profile.tiktokHashtags.length} TikTok hashtags nightly · refreshed {daysAgo(profile.updatedAt)}
            </p>
          </div>
        ) : (
          <p className="text-xs text-acuity-text-quiet">
            Not detected yet — it's inferred automatically from your own posted carousels on the first nightly run (or press Re-detect).
          </p>
        )}
      </section>

      {/* ── Suggested carousel topics (generated only on demand) ───── */}
      <section className="mb-6">
        <p className="mb-1 text-[10px] font-mono font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          Suggested carousel topics · {suggestions.length}
        </p>
        <p className="mb-2 text-[11px] text-acuity-text-quiet">
          Drafted nightly from what went viral in your niche. Nothing is generated until you press Generate.
        </p>
        {suggestions.length === 0 ? (
          <p className="text-xs text-acuity-text-quiet">
            No suggestions waiting — new ones appear after each night's research finds viral posts.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {suggestions.map((s) => (
              <div key={s.id} className="rounded-acuity-lg bg-acuity-card-bg p-3">
                <p className="text-sm font-semibold text-acuity-text">{s.headline}</p>
                <p className="mt-1 text-xs leading-relaxed text-acuity-text-sec">{s.angle}</p>
                {s.sourceSummary && (
                  <p className="mt-1 text-[10px] font-mono text-acuity-text-quiet">
                    Inspired by: {s.sourceSummary}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await doAction("generate-suggestion", { suggestionId: s.id });
                      flash("Generating — the carousel lands in your email in a few minutes.");
                    }}
                    disabled={busy === `generate-suggestion${s.id}`}
                    className="min-h-[36px] rounded-acuity-pill bg-acuity-primary px-4 text-xs font-medium text-white active:opacity-80 disabled:opacity-50"
                  >
                    {busy === `generate-suggestion${s.id}` ? "Queuing…" : "Generate this carousel"}
                  </button>
                  <button
                    onClick={() => doAction("dismiss-suggestion", { suggestionId: s.id })}
                    disabled={busy === `dismiss-suggestion${s.id}`}
                    className="min-h-[36px] rounded-acuity-pill border border-acuity-line px-4 text-xs text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Viral in your niche ────────────────────────────────────── */}
      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-mono font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Viral in your niche
          </p>
          <div className="flex gap-1">
            {[
              [2, "48h"],
              [7, "7d"],
              [30, "30d"],
            ].map(([d, label]) => (
              <button
                key={d}
                onClick={() => setDays(Number(d))}
                className={`rounded-acuity-pill px-3 py-1 text-[11px] font-mono tabular-nums ${
                  days === Number(d)
                    ? "bg-acuity-primary text-white"
                    : "bg-acuity-bg-sub text-acuity-text-sec"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-2 text-[11px] text-acuity-text-quiet">
          Posts that broke out on Instagram and TikTok, found by searching your niche's hashtags nightly. Copy a drafted comment and engage yourself — nothing is ever posted automatically.
        </p>

        {loading ? (
          <p className="text-xs text-acuity-text-quiet">Loading…</p>
        ) : viral.length === 0 ? (
          <p className="text-xs text-acuity-text-quiet">
            Nothing yet — the feed fills after the first nightly research run.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {viral.map((p) => (
              <div key={p.id} className={`rounded-acuity-lg bg-acuity-card-bg p-3 ${p.engagedAt ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2">
                  <ViralBadge p={p} />
                  <PlatformBadge platform={p.platform} />
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[11px] font-mono text-acuity-secondary"
                  >
                    @{handleOf(p)} · {daysAgo(p.postedAt)} ↗
                  </a>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-acuity-text-sec">
                  {p.caption ?? "(no caption)"}
                </p>
                <p className="mt-1 text-[10px] font-mono tabular-nums text-acuity-text-quiet">
                  {fmtNum(p.likes)} likes · {fmtNum(p.comments)} comments
                  {p.views !== null ? ` · ${fmtNum(p.views)} views` : ""}
                </p>
                {p.suggestedComment && !p.engagedAt && (
                  <>
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
                        disabled={busy === "mark-engaged"}
                        className="min-h-[36px] rounded-acuity-pill border border-acuity-line px-4 text-xs text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-50"
                      >
                        Mark engaged
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Suggested accounts (found automatically) ───────────────── */}
      {suggestedAccounts.length > 0 && (
        <section className="mb-6">
          <p className="mb-1 text-[10px] font-mono font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Suggested accounts · {suggestedAccounts.length}
          </p>
          <p className="mb-2 text-[11px] text-acuity-text-quiet">
            Creators who keep showing up in your niche's viral posts. Approve to start tracking their content nightly.
          </p>
          <div className="flex flex-col gap-2">
            {suggestedAccounts.map((a) => (
              <div key={a.id} className="rounded-acuity-lg bg-acuity-card-bg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <a
                      href={
                        a.platform === "TIKTOK"
                          ? `https://www.tiktok.com/@${a.handle}`
                          : `https://www.instagram.com/${a.handle}/`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm font-semibold text-acuity-text"
                    >
                      @{a.handle}
                    </a>
                    {a.notes && (
                      <p className="text-[11px] text-acuity-text-quiet">{a.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => doAction("approve-account", { accountId: a.id })}
                      disabled={busy === `approve-account${a.id}`}
                      className="min-h-[36px] rounded-acuity-pill bg-acuity-primary px-3 text-xs font-medium text-white active:opacity-80 disabled:opacity-50"
                    >
                      Track
                    </button>
                    <button
                      onClick={() => doAction("ignore-account", { accountId: a.id })}
                      disabled={busy === `ignore-account${a.id}`}
                      className="min-h-[36px] rounded-acuity-pill border border-acuity-line px-3 text-xs text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-50"
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
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
            onClick={async () => {
              await doAction("memo-now");
              flash("Memo queued — it lands here and in your email in ~1 minute.");
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
              onClick={async () => {
                await doAction("discover-now");
                flash("Discovery queued — new hashtag scores and suggested accounts land in a few minutes.");
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
            No hashtag data yet — discovery runs every Sunday (or run it now).
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

      {/* ── Tracked accounts ───────────────────────────────────────── */}
      <section>
        <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          Tracked accounts · {accounts.filter((a) => a.active).length} active
        </p>

        <div className="mb-3 flex items-center gap-2">
          <input
            type="text"
            placeholder="@handle or instagram.com link (optional)"
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
            None yet — accounts appear here when you approve suggestions (or add one manually above). Tracking is optional; the viral feed works without it.
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
                        href={
                          a.platform === "TIKTOK"
                            ? `https://www.tiktok.com/@${a.handle}`
                            : `https://www.instagram.com/${a.handle}/`
                        }
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
    </div>
  );
}
