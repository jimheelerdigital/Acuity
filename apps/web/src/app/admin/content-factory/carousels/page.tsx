"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Slide {
  id: string;
  order: number;
  kind: "COVER" | "REASON" | "CTA";
  overlayText: string;
  imagePrompt: string;
  imageUrl: string;
  videoUrl: string | null;
}

interface CarouselPost {
  id: string;
  topicSlug: string;
  headline: string;
  status: "DRAFT" | "APPROVED" | "REJECTED" | "POSTED";
  caption: string;
  hashtags: string[];
  musicNote: string | null;
  generatedFor: string;
  emailedAt: string | null;
  emailId: string | null;
  slides: Slide[];
  createdAt: string;
}

interface Totals {
  all: number;
  draft: number;
  approved: number;
  rejected: number;
  posted: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-acuity-warn-soft text-acuity-warn",
  APPROVED: "bg-acuity-good-soft text-acuity-good",
  REJECTED: "bg-acuity-bad-soft text-acuity-bad",
  POSTED: "bg-acuity-secondary-soft text-acuity-secondary",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-acuity-pill px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[status] ?? "bg-acuity-bg-inset text-acuity-text-quiet"}`}>
      {status}
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function CarouselReviewPage() {
  const [allPosts, setAllPosts] = useState<CarouselPost[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editSlide, setEditSlide] = useState<{ id: string; text: string } | null>(null);
  const [allFilter, setAllFilter] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);

  const fetchPosts = useCallback(async (cursor?: string) => {
    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams();
      if (allFilter) params.set("status", allFilter);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "30");
      const res = await fetch(`/api/admin/carousels?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (cursor) {
        setAllPosts((prev) => [...prev, ...(data.posts ?? [])]);
      } else {
        setAllPosts(data.posts ?? []);
      }
      if (data.totals) setTotals(data.totals);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [allFilter]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // ── Actions ───────────────────────────────────────────────────────
  const doAction = async (action: string, params: Record<string, string>) => {
    const key = `${action}-${params.postId || params.slideId}`;
    setBusy(key);
    try {
      const res = await fetch("/api/admin/carousels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...params }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if ((action === "regenerate-slide" || action === "edit-text") && data.imageUrl) {
        setAllPosts((prev) =>
          prev.map((p) => ({
            ...p,
            slides: p.slides.map((s) =>
              s.id === params.slideId
                ? { ...s, imageUrl: data.imageUrl, overlayText: data.overlayText ?? s.overlayText }
                : s
            ),
          }))
        );
      } else {
        await fetchPosts();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
      setEditSlide(null);
    }
  };

  const generateOneOff = async () => {
    setGenerating(true);
    setGenerateMsg(null);
    try {
      const res = await fetch("/api/admin/carousels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-one-off" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGenerateMsg("Queued — check email in ~3 min");
      setTimeout(() => setGenerateMsg(null), 10000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to queue generation");
    } finally {
      setGenerating(false);
    }
  };

  const copyCaption = (caption: string) => {
    navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Post detail view ──────────────────────────────────────────────
  const selectedPost = selectedPostId
    ? allPosts.find((p) => p.id === selectedPostId) ?? null
    : null;

  if (selectedPost) {
    return (
      <div
        className="flex min-h-[100dvh] flex-col bg-acuity-bg"
        data-theme="dark"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* ── Top bar ──────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ paddingTop: "max(12px, env(safe-area-inset-top, 12px))" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => { setSelectedPostId(null); setEditSlide(null); }}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-acuity-pill border border-acuity-line text-sm text-acuity-text-sec active:bg-acuity-bg-sub"
            >
              ✕
            </button>
            <h1 className="font-display text-base font-bold text-acuity-text truncate">
              {selectedPost.headline}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {selectedPost.emailedAt ? (
              <span className="rounded-acuity-pill bg-acuity-good-soft px-2 py-0.5 text-[9px] font-mono text-acuity-good">
                Emailed
              </span>
            ) : (
              <span className="rounded-acuity-pill bg-acuity-bg-inset px-2 py-0.5 text-[9px] font-mono text-acuity-text-quiet">
                Not emailed
              </span>
            )}
            <StatusBadge status={selectedPost.status} />
          </div>
        </div>

        {/* ── Horizontal scroll-snap slide strip ────────────────────── */}
        <SlideStrip
          slides={selectedPost.slides}
          busy={busy}
          editSlide={editSlide}
          onRegenerate={(slideId) => doAction("regenerate-slide", { slideId })}
          onStartEdit={(slide) => setEditSlide({ id: slide.id, text: slide.overlayText })}
          onCancelEdit={() => setEditSlide(null)}
          onSaveEdit={(slideId, newText) => doAction("edit-text", { slideId, newText })}
          onEditChange={(text) => setEditSlide((prev) => prev ? { ...prev, text } : null)}
          onAnimate={() => doAction("animate-cover", { postId: selectedPost.id })}
        />

        {/* ── Caption preview ────────────────────────────────────────── */}
        <div className="mx-4 mt-2 max-h-28 overflow-y-auto rounded-acuity-lg bg-acuity-bg-inset p-3">
          <pre className="whitespace-pre-wrap text-xs text-acuity-text-sec font-sans leading-relaxed">
            {selectedPost.caption}
          </pre>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* ── Fixed bottom action bar ─────────────────────────────────── */}
        <div
          className="sticky bottom-0 border-t border-acuity-line bg-acuity-bg px-4 py-3"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
        >
          <div className="flex items-center justify-between gap-2">
            {/* Left: status actions */}
            {selectedPost.status === "DRAFT" && (
              <div className="flex gap-2">
                <button
                  onClick={() => doAction("reject", { postId: selectedPost.id })}
                  disabled={!!busy}
                  className="min-h-[44px] rounded-acuity-pill bg-acuity-bad px-4 text-sm font-medium text-white active:opacity-80 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => doAction("approve", { postId: selectedPost.id })}
                  disabled={!!busy}
                  className="min-h-[44px] rounded-acuity-pill bg-acuity-good px-4 text-sm font-medium text-white active:opacity-80 disabled:opacity-50"
                >
                  Approve
                </button>
              </div>
            )}
            {selectedPost.status === "APPROVED" && (
              <button
                onClick={() => doAction("mark-posted", { postId: selectedPost.id })}
                disabled={busy === `mark-posted-${selectedPost.id}`}
                className="min-h-[44px] rounded-acuity-pill bg-acuity-secondary-soft px-4 text-sm font-bold text-acuity-secondary active:opacity-70 disabled:opacity-50"
              >
                {busy === `mark-posted-${selectedPost.id}` ? "…" : "Mark posted"}
              </button>
            )}
            {(selectedPost.status === "REJECTED" || selectedPost.status === "POSTED") && (
              <div />
            )}

            {/* Right: utilities */}
            <div className="flex gap-2">
              <button
                onClick={() => doAction("generate-story", { postId: selectedPost.id })}
                disabled={busy === `generate-story-${selectedPost.id}`}
                title="Generate 30s story video (arrives by email in ~10 min)"
                className="flex min-h-[44px] items-center rounded-acuity-pill border border-acuity-line px-3 text-sm text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-50"
              >
                {busy === `generate-story-${selectedPost.id}` ? "…" : "🎥 Story"}
              </button>
              <button
                onClick={() => doAction("resend-email", { postId: selectedPost.id })}
                disabled={busy === `resend-email-${selectedPost.id}`}
                className="flex min-h-[44px] items-center rounded-acuity-pill border border-acuity-line px-3 text-sm text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-50"
              >
                {busy === `resend-email-${selectedPost.id}` ? "…" : "✉"}
              </button>
              <a
                href={`/api/admin/carousels/download?postId=${selectedPost.id}`}
                className="flex min-h-[44px] items-center rounded-acuity-pill border border-acuity-line px-3 text-sm text-acuity-text-sec active:bg-acuity-bg-sub"
              >
                ZIP
              </a>
              <button
                onClick={() => copyCaption(selectedPost.caption)}
                className="flex min-h-[44px] items-center rounded-acuity-pill border border-acuity-line px-3 text-sm text-acuity-text-sec active:bg-acuity-bg-sub"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Library view (default) ────────────────────────────────────────

  // Group posts by generatedFor date
  const grouped = allPosts.reduce<Record<string, CarouselPost[]>>((acc, post) => {
    const dateKey = new Date(post.generatedFor).toISOString().slice(0, 10);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(post);
    return acc;
  }, {});
  const dateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const filterCounts = totals
    ? [
        { key: "", label: "All", count: totals.all },
        { key: "DRAFT", label: "Drafts", count: totals.draft },
        { key: "APPROVED", label: "Approved", count: totals.approved },
        { key: "REJECTED", label: "Rejected", count: totals.rejected },
        { key: "POSTED", label: "Posted", count: totals.posted },
      ]
    : null;

  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-acuity-bg"
      data-theme="dark"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top, 12px))" }}
      >
        <div className="flex items-center gap-2">
          <a
            href="/admin"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-acuity-pill border border-acuity-line text-sm text-acuity-text-sec active:bg-acuity-bg-sub"
          >
            ←
          </a>
          <h1 className="font-display text-lg font-bold text-acuity-text">
            Carousels
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generateOneOff}
            disabled={generating}
            className="min-h-[44px] rounded-acuity-pill bg-acuity-primary px-4 text-sm font-medium text-white active:opacity-80 disabled:opacity-50"
          >
            {generating ? "Queuing…" : "Generate"}
          </button>
          <button
            onClick={() => fetchPosts()}
            disabled={loading}
            className="min-h-[44px] min-w-[44px] rounded-acuity-pill border border-acuity-line px-3 text-sm text-acuity-text-sec active:bg-acuity-bg-sub"
          >
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      {/* ── Generate feedback ───────────────────────────────────── */}
      {generateMsg && (
        <div className="mx-4 mb-3 rounded-acuity-lg bg-acuity-good-soft border border-acuity-good px-4 py-2.5 text-sm text-acuity-good">
          {generateMsg}
        </div>
      )}

      {/* ── Aggregate stats ──────────────────────────────────────── */}
      {totals && (
        <div className="mx-4 mb-3 rounded-acuity-lg bg-acuity-card-bg border border-acuity-card-border px-4 py-3">
          <div className="flex items-center gap-4 text-xs tabular-nums">
            <span className="font-display font-bold text-acuity-text">{totals.all} total</span>
            <span className="text-acuity-warn">{totals.draft} drafts</span>
            <span className="text-acuity-good">{totals.approved} approved</span>
            <span className="text-acuity-bad">{totals.rejected} rejected</span>
            <span className="text-acuity-secondary">{totals.posted} posted</span>
          </div>
        </div>
      )}

      {/* ── Filter pills ─────────────────────────────────────────── */}
      <div className="mx-4 mb-3 flex gap-2 overflow-x-auto pb-1">
        {(filterCounts ?? [
          { key: "", label: "All", count: null },
          { key: "DRAFT", label: "Drafts", count: null },
          { key: "APPROVED", label: "Approved", count: null },
          { key: "REJECTED", label: "Rejected", count: null },
          { key: "POSTED", label: "Posted", count: null },
        ]).map((f) => (
          <button
            key={f.key}
            onClick={() => setAllFilter(f.key)}
            className={`min-h-[36px] shrink-0 rounded-acuity-pill px-3 text-xs font-medium transition-colors ${
              allFilter === f.key
                ? "bg-acuity-primary text-white"
                : "border border-acuity-line text-acuity-text-sec active:bg-acuity-bg-sub"
            }`}
          >
            {f.label}{f.count != null ? ` (${f.count})` : ""}
          </button>
        ))}
      </div>

      {/* ── Error ────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-4 mb-3 rounded-acuity-lg border border-acuity-bad bg-acuity-bad-soft p-4 text-sm text-acuity-bad">
          {error}
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-acuity-text-ter">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-acuity-line-strong border-t-acuity-primary" />
            Loading…
          </div>
        </div>
      )}

      {/* ── Empty ────────────────────────────────────────────────── */}
      {!loading && allPosts.length === 0 && (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="text-center text-acuity-text-ter">
            <p className="text-lg font-display font-bold text-acuity-text-sec">No carousels found</p>
            <p className="mt-1 text-sm">
              {allFilter ? `No ${allFilter.toLowerCase()} carousels.` : "Nothing generated yet."}
            </p>
            {!allFilter && (
              <button
                onClick={generateOneOff}
                disabled={generating}
                className="mt-3 min-h-[44px] rounded-acuity-pill bg-acuity-primary px-6 text-sm font-medium text-white active:opacity-80 disabled:opacity-50"
              >
                {generating ? "Queuing…" : "Generate one now"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Date-grouped post list ───────────────────────────────── */}
      {!loading && dateKeys.length > 0 && (
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {dateKeys.map((dateKey) => {
            const dayPosts = grouped[dateKey];
            const dateLabel = new Date(dateKey + "T00:00:00Z").toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            });
            const isToday = dateKey === new Date().toISOString().slice(0, 10);

            return (
              <div key={dateKey} className="mb-5">
                {/* Date header */}
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-[10px] font-bold uppercase tracking-[1.4px] font-mono text-acuity-text-ter">
                    {dateLabel}
                  </h2>
                  {isToday && (
                    <span className="rounded-acuity-pill bg-acuity-primary-soft px-2 py-0.5 text-[9px] font-bold uppercase text-acuity-primary">
                      Today
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-acuity-text-quiet">
                    {dayPosts.length} post{dayPosts.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[10px] font-mono text-acuity-text-quiet">
                    ~${(dayPosts.reduce((a, p) => a + Math.max(0, p.slides.length - 1) * 8, 0) / 100).toFixed(2)}
                  </span>
                </div>

                {/* Posts for this date */}
                <div className="space-y-2">
                  {dayPosts.map((post) => (
                    <button
                      key={post.id}
                      onClick={() => setSelectedPostId(post.id)}
                      className="flex w-full items-center gap-3 rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg shadow-acuity-soft p-3 text-left active:bg-acuity-bg-sub"
                    >
                      {/* Cover thumbnail */}
                      {post.slides[0] && (
                        <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-acuity-sm">
                          <img
                            src={post.slides[0].imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                          {post.slides[0].videoUrl && (
                            <span className="absolute right-0.5 top-0.5 rounded-acuity-pill bg-acuity-primary/80 px-1 text-[8px] font-mono font-bold text-white">
                              ▶
                            </span>
                          )}
                        </div>
                      )}

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-acuity-text truncate">
                          {post.headline}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-[11px] text-acuity-text-quiet truncate">
                            {post.topicSlug}
                          </span>
                          <span className="text-[10px] font-mono text-acuity-text-quiet">
                            {post.slides.length} slides
                          </span>
                          <span className="text-[10px] font-mono text-acuity-text-quiet">
                            ~${((Math.max(0, post.slides.length - 1) * 8) / 100).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        {post.emailedAt && (
                          <span className="rounded-acuity-pill bg-acuity-good-soft px-2 py-0.5 text-[9px] font-mono text-acuity-good">
                            Emailed
                          </span>
                        )}
                        <StatusBadge status={post.status} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Load more button */}
          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => fetchPosts(nextCursor)}
                disabled={loadingMore}
                className="min-h-[44px] rounded-acuity-pill border border-acuity-line px-6 text-sm text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-acuity-line-strong border-t-acuity-primary" />
                    Loading…
                  </span>
                ) : (
                  "Load more"
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Slide strip (horizontal scroll-snap) ──────────────────────────────────

function SlideStrip({
  slides,
  busy,
  editSlide,
  onRegenerate,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditChange,
  onAnimate,
}: {
  slides: Slide[];
  busy: string | null;
  editSlide: { id: string; text: string } | null;
  onRegenerate: (slideId: string) => void;
  onStartEdit: (slide: Slide) => void;
  onCancelEdit: () => void;
  onSaveEdit: (slideId: string, newText: string) => void;
  onEditChange: (text: string) => void;
  onAnimate: () => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setActiveSlide(idx);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div>
      {/* Scroll-snap strip */}
      <div
        ref={stripRef}
        className="flex snap-x snap-mandatory overflow-x-auto"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {slides.map((slide) => (
          <div
            key={slide.id}
            className="w-full shrink-0 snap-center px-4 flex justify-center"
          >
            <div className="relative overflow-hidden rounded-acuity-lg max-w-[400px] w-full">
              {slide.videoUrl ? (
                <video
                  src={slide.videoUrl}
                  poster={slide.imageUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                  preload="metadata"
                  className="w-full h-auto"
                />
              ) : (
                <img
                  src={slide.imageUrl}
                  alt={slide.overlayText}
                  className="w-full h-auto"
                  draggable={false}
                />
              )}
              {/* Slide label */}
              <div className="absolute left-2 top-2 flex gap-1">
                <span className="rounded-acuity-pill bg-black/50 px-2 py-0.5 text-[9px] font-mono font-bold uppercase text-white/90">
                  {slide.kind}
                </span>
                <span className="rounded-acuity-pill bg-black/50 px-2 py-0.5 text-[9px] font-mono text-white/70">
                  {slide.order + 1}/{slides.length}
                </span>
                {slide.videoUrl && (
                  <span className="rounded-acuity-pill bg-acuity-primary/80 px-2 py-0.5 text-[9px] font-mono font-bold uppercase text-white">
                    ▶ Animated
                  </span>
                )}
              </div>

              {/* Per-slide actions */}
              {slide.kind !== "CTA" && (
                <div className="absolute bottom-2 right-2 flex gap-1">
                  {slide.kind === "COVER" && (
                    <button
                      onClick={onAnimate}
                      disabled={busy?.startsWith("animate-cover") ?? false}
                      className="min-h-[36px] rounded-acuity-pill bg-black/50 px-3 text-[10px] font-medium text-white/90 active:bg-black/70 disabled:opacity-50"
                    >
                      {busy?.startsWith("animate-cover")
                        ? "Queued…"
                        : slide.videoUrl
                          ? "Re-animate"
                          : "Animate"}
                    </button>
                  )}
                  <button
                    onClick={() => onStartEdit(slide)}
                    className="min-h-[36px] rounded-acuity-pill bg-black/50 px-3 text-[10px] font-medium text-white/90 active:bg-black/70"
                  >
                    Edit text
                  </button>
                  <button
                    onClick={() => onRegenerate(slide.id)}
                    disabled={busy === `regenerate-slide-${slide.id}`}
                    className="min-h-[36px] rounded-acuity-pill bg-black/50 px-3 text-[10px] font-medium text-white/90 active:bg-black/70 disabled:opacity-50"
                  >
                    {busy === `regenerate-slide-${slide.id}` ? "…" : "Regen"}
                  </button>
                </div>
              )}
            </div>

            {/* Edit text inline form */}
            {editSlide?.id === slide.id && (
              <div className="mt-2 rounded-acuity-lg bg-acuity-card-bg border border-acuity-card-border p-3">
                <textarea
                  value={editSlide.text}
                  onChange={(e) => onEditChange(e.target.value)}
                  rows={2}
                  className="w-full rounded-acuity-sm bg-acuity-bg-inset px-3 py-2 text-sm text-acuity-text placeholder:text-acuity-text-quiet focus:outline-none focus:ring-1 focus:ring-acuity-primary"
                />
                <div className="mt-2 flex gap-2 justify-end">
                  <button
                    onClick={onCancelEdit}
                    className="min-h-[36px] rounded-acuity-pill border border-acuity-line px-3 text-xs text-acuity-text-sec active:bg-acuity-bg-sub"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onSaveEdit(slide.id, editSlide.text)}
                    disabled={busy === `edit-text-${slide.id}` || editSlide.text === slide.overlayText}
                    className="min-h-[36px] rounded-acuity-pill bg-acuity-primary px-4 text-xs font-medium text-white active:opacity-80 disabled:opacity-50"
                  >
                    {busy === `edit-text-${slide.id}` ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      <div className="mt-2 flex justify-center gap-1.5">
        {slides.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === activeSlide
                ? "w-4 bg-acuity-primary"
                : "w-1.5 bg-acuity-line-strong"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
