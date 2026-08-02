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
  slides: Slide[];
  createdAt: string;
}

interface DaySummary {
  date: string;
  drafts: number;
  approved: number;
  rejected: number;
  posted: number;
  total: number;
  estimatedCostCents: number;
}

type ViewMode = "review" | "all";

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
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("review");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [editSlide, setEditSlide] = useState<{ id: string; text: string } | null>(null);
  const [allFilter, setAllFilter] = useState("");

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (viewMode === "all" && allFilter) params.set("status", allFilter);
      const res = await fetch(`/api/admin/carousels?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllPosts(data.posts ?? []);
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [viewMode, allFilter]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // ── Review queue: DRAFT + APPROVED (not rejected, not posted) ─────
  const reviewPosts = allPosts.filter(
    (p) => p.status === "DRAFT" || p.status === "APPROVED"
  );
  const readyToPost = allPosts.filter((p) => p.status === "APPROVED");
  const current = reviewPosts[currentIdx] ?? null;

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
        // If we just rejected/approved, keep index clamped
        if (action === "reject" || action === "approve") {
          setCurrentIdx((prev) => Math.min(prev, Math.max(0, reviewPosts.length - 2)));
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
      setEditSlide(null);
    }
  };

  const copyCaption = (caption: string) => {
    // iOS Safari requires clipboard write inside the click handler synchronously.
    // navigator.clipboard.writeText returns a promise but must be called in the
    // same event tick as the user gesture.
    navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Review mode ───────────────────────────────────────────────────
  if (viewMode === "review") {
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
          <h1 className="font-display text-lg font-bold text-acuity-text">
            Carousels
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchPosts}
              disabled={loading}
              className="min-h-[44px] min-w-[44px] rounded-acuity-pill border border-acuity-line px-3 text-sm text-acuity-text-sec active:bg-acuity-bg-sub"
            >
              {loading ? "…" : "↻"}
            </button>
            <button
              onClick={() => setViewMode("all")}
              className="min-h-[44px] rounded-acuity-pill border border-acuity-line px-3 text-sm text-acuity-text-sec active:bg-acuity-bg-sub"
            >
              All
            </button>
          </div>
        </div>

        {/* ── Daily summary ────────────────────────────────────────── */}
        {summary && summary.total > 0 && (
          <div className="mx-4 mb-3 flex items-center gap-3 rounded-acuity-lg bg-acuity-card-bg border border-acuity-card-border px-4 py-3">
            <div className="text-xs text-acuity-text-ter">
              <span className="font-display font-bold text-acuity-text">{summary.date}</span>
            </div>
            <div className="flex gap-3 text-xs tabular-nums">
              <span className="text-acuity-warn">{summary.drafts} drafts</span>
              <span className="text-acuity-good">{summary.approved} approved</span>
              {summary.posted > 0 && <span className="text-acuity-secondary">{summary.posted} posted</span>}
            </div>
            <div className="ml-auto text-[10px] font-mono text-acuity-text-quiet">
              ~${(summary.estimatedCostCents / 100).toFixed(2)}
            </div>
          </div>
        )}

        {/* ── Ready to post section ────────────────────────────────── */}
        {readyToPost.length > 0 && (
          <div className="mx-4 mb-3">
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[1.4px] font-mono text-acuity-text-ter">
              Ready to post
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {readyToPost.map((p) => (
                <div
                  key={p.id}
                  className="flex shrink-0 items-center gap-2 rounded-acuity-lg border border-acuity-good-soft bg-acuity-card-bg px-3 py-2"
                >
                  <span className="max-w-[140px] truncate text-xs text-acuity-text-sec">{p.headline}</span>
                  <button
                    onClick={() => doAction("mark-posted", { postId: p.id })}
                    disabled={busy === `mark-posted-${p.id}`}
                    className="min-h-[36px] rounded-acuity-pill bg-acuity-secondary-soft px-3 text-[10px] font-bold uppercase text-acuity-secondary active:opacity-70 disabled:opacity-50"
                  >
                    {busy === `mark-posted-${p.id}` ? "…" : "Posted ✓"}
                  </button>
                  <a
                    href={`/api/admin/carousels/download?postId=${p.id}`}
                    className="min-h-[36px] flex items-center rounded-acuity-pill border border-acuity-line px-3 text-[10px] text-acuity-text-ter active:bg-acuity-bg-sub"
                  >
                    ZIP
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Error / empty ────────────────────────────────────────── */}
        {error && (
          <div className="mx-4 mb-3 rounded-acuity-lg border border-acuity-bad bg-acuity-bad-soft p-4 text-sm text-acuity-bad">
            {error}
          </div>
        )}
        {!loading && reviewPosts.length === 0 && (
          <div className="flex flex-1 items-center justify-center px-4">
            <div className="text-center text-acuity-text-ter">
              <p className="text-lg font-display font-bold text-acuity-text-sec">All clear</p>
              <p className="mt-1 text-sm">No carousels to review. Cron runs at 11:00 UTC.</p>
            </div>
          </div>
        )}

        {/* ── Carousel viewer ──────────────────────────────────────── */}
        {current && (
          <div className="flex flex-1 flex-col">
            {/* Carousel counter */}
            <div className="flex items-center justify-between px-4 pb-2">
              <p className="text-xs text-acuity-text-ter">
                {currentIdx + 1} of {reviewPosts.length}
              </p>
              <StatusBadge status={current.status} />
            </div>

            {/* Headline */}
            <h2 className="px-4 pb-2 font-display text-base font-bold text-acuity-text leading-tight">
              {current.headline}
            </h2>

            {/* ── Horizontal scroll-snap slide strip ────────────────── */}
            <SlideStrip
              slides={current.slides}
              busy={busy}
              editSlide={editSlide}
              onRegenerate={(slideId) => doAction("regenerate-slide", { slideId })}
              onStartEdit={(slide) => setEditSlide({ id: slide.id, text: slide.overlayText })}
              onCancelEdit={() => setEditSlide(null)}
              onSaveEdit={(slideId, newText) => doAction("edit-text", { slideId, newText })}
              onEditChange={(text) => setEditSlide((prev) => prev ? { ...prev, text } : null)}
            />

            {/* ── Caption preview ────────────────────────────────────── */}
            <div className="mx-4 mt-2 max-h-28 overflow-y-auto rounded-acuity-lg bg-acuity-bg-inset p-3">
              <pre className="whitespace-pre-wrap text-xs text-acuity-text-sec font-sans leading-relaxed">
                {current.caption}
              </pre>
            </div>

            {/* Spacer to push action bar to bottom */}
            <div className="flex-1" />

            {/* ── Fixed bottom action bar ─────────────────────────────── */}
            <div
              className="sticky bottom-0 border-t border-acuity-line bg-acuity-bg px-4 py-3"
              style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
            >
              <div className="flex items-center justify-between gap-2">
                {/* Left: navigation */}
                <div className="flex gap-1">
                  <button
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    disabled={currentIdx === 0}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-acuity-pill border border-acuity-line text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => setCurrentIdx((i) => Math.min(reviewPosts.length - 1, i + 1))}
                    disabled={currentIdx >= reviewPosts.length - 1}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-acuity-pill border border-acuity-line text-acuity-text-sec active:bg-acuity-bg-sub disabled:opacity-30"
                  >
                    →
                  </button>
                </div>

                {/* Right: actions */}
                {current.status === "DRAFT" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => doAction("reject", { postId: current.id })}
                      disabled={!!busy}
                      className="min-h-[44px] rounded-acuity-pill bg-acuity-bad px-4 text-sm font-medium text-white active:opacity-80 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => doAction("approve", { postId: current.id })}
                      disabled={!!busy}
                      className="min-h-[44px] rounded-acuity-pill bg-acuity-good px-4 text-sm font-medium text-white active:opacity-80 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <a
                    href={`/api/admin/carousels/download?postId=${current.id}`}
                    className="flex min-h-[44px] items-center rounded-acuity-pill border border-acuity-line px-3 text-sm text-acuity-text-sec active:bg-acuity-bg-sub"
                  >
                    ZIP
                  </a>
                  <button
                    onClick={() => copyCaption(current.caption)}
                    className="flex min-h-[44px] items-center rounded-acuity-pill border border-acuity-line px-3 text-sm text-acuity-text-sec active:bg-acuity-bg-sub"
                  >
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── All carousels grid (desktop secondary view) ────────────────────
  return (
    <div className="min-h-screen bg-acuity-bg p-4 lg:p-6" data-theme="dark">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode("review")}
            className="min-h-[44px] rounded-acuity-pill border border-acuity-line px-4 text-sm text-acuity-text-sec active:bg-acuity-bg-sub"
          >
            ← Review
          </button>
          <h1 className="font-display text-xl font-bold text-acuity-text">
            All Carousels
          </h1>
        </div>
        <select
          value={allFilter}
          onChange={(e) => setAllFilter(e.target.value)}
          className="min-h-[44px] rounded-acuity-sm bg-acuity-bg-inset px-3 text-sm text-acuity-text"
        >
          <option value="">All</option>
          <option value="DRAFT">Drafts</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="POSTED">Posted</option>
        </select>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-acuity-text-ter">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-acuity-line-strong border-t-acuity-primary" />
          Loading…
        </div>
      )}

      {!loading && allPosts.length === 0 && (
        <div className="rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg p-12 text-center text-acuity-text-ter">
          No carousels found.
        </div>
      )}

      {!loading && allPosts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allPosts.map((post) => (
            <div
              key={post.id}
              className="rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg shadow-acuity-soft"
            >
              {post.slides[0] && (
                <div className="relative h-48 overflow-hidden rounded-t-acuity-lg">
                  <img
                    src={post.slides[0].imageUrl}
                    alt={post.headline}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2">
                    <StatusBadge status={post.status} />
                  </div>
                  <div className="absolute bottom-2 right-2 rounded-acuity-pill bg-acuity-bg px-2 py-0.5 text-[10px] font-mono text-acuity-text-ter">
                    {post.slides.length} slides
                  </div>
                </div>
              )}
              <div className="p-4">
                <h3 className="text-sm font-semibold text-acuity-text line-clamp-2">
                  {post.headline}
                </h3>
                <p className="mt-1 text-xs text-acuity-text-quiet">
                  {new Date(post.generatedFor).toLocaleDateString()} · {post.topicSlug}
                </p>
                <div className="mt-3 flex gap-2">
                  <a
                    href={`/api/admin/carousels/download?postId=${post.id}`}
                    className="min-h-[36px] flex items-center rounded-acuity-pill border border-acuity-line px-3 text-[11px] text-acuity-text-sec active:bg-acuity-bg-sub"
                  >
                    Download ZIP
                  </a>
                  <button
                    onClick={() => copyCaption(post.caption)}
                    className="min-h-[36px] rounded-acuity-pill border border-acuity-line px-3 text-[11px] text-acuity-text-sec active:bg-acuity-bg-sub"
                  >
                    {copied ? "Copied ✓" : "Copy caption"}
                  </button>
                  {post.status === "APPROVED" && (
                    <button
                      onClick={() => doAction("mark-posted", { postId: post.id })}
                      disabled={busy === `mark-posted-${post.id}`}
                      className="min-h-[36px] rounded-acuity-pill bg-acuity-secondary-soft px-3 text-[11px] font-bold text-acuity-secondary active:opacity-70 disabled:opacity-50"
                    >
                      Mark posted
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
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
}: {
  slides: Slide[];
  busy: string | null;
  editSlide: { id: string; text: string } | null;
  onRegenerate: (slideId: string) => void;
  onStartEdit: (slide: Slide) => void;
  onCancelEdit: () => void;
  onSaveEdit: (slideId: string, newText: string) => void;
  onEditChange: (text: string) => void;
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
            className="w-full shrink-0 snap-center px-4"
          >
            <div className="relative overflow-hidden rounded-acuity-lg">
              <img
                src={slide.imageUrl}
                alt={slide.overlayText}
                className="w-full"
                draggable={false}
              />
              {/* Slide label */}
              <div className="absolute left-2 top-2 flex gap-1">
                <span className="rounded-acuity-pill bg-black/50 px-2 py-0.5 text-[9px] font-mono font-bold uppercase text-white/90">
                  {slide.kind}
                </span>
                <span className="rounded-acuity-pill bg-black/50 px-2 py-0.5 text-[9px] font-mono text-white/70">
                  {slide.order + 1}/{slides.length}
                </span>
              </div>

              {/* Per-slide actions */}
              {slide.kind !== "CTA" && (
                <div className="absolute bottom-2 right-2 flex gap-1">
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
