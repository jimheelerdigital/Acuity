"use client";

import { useCallback, useEffect, useState } from "react";

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

// ─── Component ──────────────────────────────────────────────────────────────

export default function CarouselReviewPage() {
  const [posts, setPosts] = useState<CarouselPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<CarouselPost | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      const res = await fetch(`/api/admin/carousels?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPosts(data.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const doAction = async (
    action: string,
    params: Record<string, string>
  ) => {
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

      if (action === "regenerate-slide" && data.imageUrl) {
        // Update the slide URL in local state
        setPosts((prev) =>
          prev.map((p) => ({
            ...p,
            slides: p.slides.map((s) =>
              s.id === params.slideId ? { ...s, imageUrl: data.imageUrl } : s
            ),
          }))
        );
        if (selectedPost) {
          setSelectedPost((prev) =>
            prev
              ? {
                  ...prev,
                  slides: prev.slides.map((s) =>
                    s.id === params.slideId ? { ...s, imageUrl: data.imageUrl } : s
                  ),
                }
              : null
          );
        }
      } else {
        await fetchPosts();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const statusStyle = (status: string) => {
    switch (status) {
      case "DRAFT":
        return "bg-acuity-warn-soft text-acuity-warn";
      case "APPROVED":
        return "bg-acuity-good-soft text-acuity-good";
      case "REJECTED":
        return "bg-acuity-bad-soft text-acuity-bad";
      case "POSTED":
        return "bg-acuity-secondary-soft text-acuity-secondary";
      default:
        return "bg-acuity-bg-inset text-acuity-text-quiet";
    }
  };

  return (
    <div className="min-h-screen bg-acuity-bg p-6" data-theme="dark">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-acuity-text">
            Carousel Review Queue
          </h1>
          <p className="mt-1 text-sm text-acuity-text-ter">
            Review, approve, and download daily carousel drafts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-acuity-sm bg-acuity-bg-inset px-3 py-2 text-sm text-acuity-text"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Drafts</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="POSTED">Posted</option>
          </select>
          <button
            onClick={fetchPosts}
            className="rounded-acuity-pill border border-acuity-line px-4 py-2 text-sm text-acuity-text-sec transition hover:border-acuity-line-strong"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error / Loading */}
      {error && (
        <div className="mb-4 rounded-acuity-lg border border-acuity-bad bg-acuity-bad-soft p-4 text-sm text-acuity-bad">
          {error}
        </div>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-acuity-text-ter">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-acuity-line-strong border-t-acuity-primary" />
          Loading carousels…
        </div>
      )}

      {/* Grid */}
      {!loading && posts.length === 0 && (
        <div className="rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg p-12 text-center text-acuity-text-ter">
          No carousels found. The daily cron runs at 11:00 UTC.
        </div>
      )}

      {!loading && posts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="cursor-pointer rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg shadow-acuity-soft transition hover:shadow-acuity-lift hover:border-acuity-line-strong"
              onClick={() => setSelectedPost(post)}
            >
              {/* Cover thumbnail */}
              {post.slides[0] && (
                <div className="relative h-48 overflow-hidden rounded-t-acuity-lg">
                  <img
                    src={post.slides[0].imageUrl}
                    alt={post.headline}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute bottom-2 left-2">
                    <span
                      className={`rounded-acuity-pill px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusStyle(post.status)}`}
                    >
                      {post.status}
                    </span>
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
                  {new Date(post.generatedFor).toLocaleDateString()} &middot;{" "}
                  {post.topicSlug}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Detail Modal ──────────────────────────────────────────── */}
      {selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-12"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="w-full max-w-3xl rounded-acuity-xl border border-acuity-card-border bg-acuity-card-bg p-6 shadow-acuity-lift"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-display text-xl font-bold text-acuity-text">
                  {selectedPost.headline}
                </h2>
                <p className="mt-1 text-xs text-acuity-text-ter">
                  {selectedPost.topicSlug} &middot;{" "}
                  {new Date(selectedPost.generatedFor).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-acuity-pill px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${statusStyle(selectedPost.status)}`}
                >
                  {selectedPost.status}
                </span>
                <button
                  onClick={() => setSelectedPost(null)}
                  className="rounded-acuity-sm p-1 text-acuity-text-ter hover:text-acuity-text"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Slides */}
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              {selectedPost.slides.map((slide) => (
                <div
                  key={slide.id}
                  className="group relative overflow-hidden rounded-acuity-lg border border-acuity-line"
                >
                  <img
                    src={slide.imageUrl}
                    alt={slide.overlayText}
                    className="w-full"
                  />
                  <div className="absolute left-2 top-2 flex gap-1">
                    <span className="rounded-acuity-pill bg-acuity-bg px-2 py-0.5 text-[9px] font-mono font-bold uppercase text-acuity-text-ter">
                      {slide.kind}
                    </span>
                    <span className="rounded-acuity-pill bg-acuity-bg px-2 py-0.5 text-[9px] font-mono text-acuity-text-quiet">
                      #{slide.order}
                    </span>
                  </div>
                  {slide.kind !== "CTA" && (
                    <button
                      onClick={() =>
                        doAction("regenerate-slide", { slideId: slide.id })
                      }
                      disabled={busy === `regenerate-slide-${slide.id}`}
                      className="absolute bottom-2 right-2 rounded-acuity-pill bg-acuity-bg border border-acuity-line px-3 py-1 text-[10px] font-medium text-acuity-text-sec opacity-0 transition group-hover:opacity-100 hover:border-acuity-line-strong disabled:opacity-50"
                    >
                      {busy === `regenerate-slide-${slide.id}`
                        ? "Regenerating…"
                        : "Regenerate"}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Caption */}
            <div className="mb-4 rounded-acuity-lg bg-acuity-bg-inset p-4">
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter font-mono">
                Caption
              </h4>
              <pre className="whitespace-pre-wrap text-sm text-acuity-text-sec font-sans">
                {selectedPost.caption}
              </pre>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {selectedPost.status === "DRAFT" && (
                  <>
                    <button
                      onClick={() =>
                        doAction("approve", { postId: selectedPost.id })
                      }
                      disabled={!!busy}
                      className="rounded-acuity-pill bg-acuity-good px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() =>
                        doAction("reject", { postId: selectedPost.id })
                      }
                      disabled={!!busy}
                      className="rounded-acuity-pill bg-acuity-bad px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
              <a
                href={`/api/admin/carousels/download?postId=${selectedPost.id}`}
                className="rounded-acuity-pill border border-acuity-line px-4 py-2 text-sm text-acuity-text-sec transition hover:border-acuity-line-strong hover:text-acuity-text"
              >
                Download ZIP
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
