"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ContentPreview from "@/components/content-factory/previews/ContentPreview";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContentPiece {
  id: string;
  type: string;
  title: string;
  body: string;
  hook: string;
  cta: string;
  targetKeyword: string | null;
  predictedScore: number;
  status: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  editNotes: string | null;
  finalBody: string | null;
  distributedAt: string | null;
  distributedUrl: string | null;
  metrics: Record<string, number> | null;
  createdAt: string;
}

interface ContentBriefing {
  id: string;
  date: string;
  redditTop: RedditPost[];
  twitterTop: unknown[];
  trendsData: Record<string, unknown>;
  ga4Winners: GA4Winner[];
  generatedAt: string;
}

interface RedditPost {
  title: string;
  subreddit: string;
  upvotes: number;
  url: string;
  permalink: string;
}

interface GA4Winner {
  pagePath: string;
  sessions: number;
}

interface JobStatus {
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED";
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
  errorMessage: string | null;
  piecesCreated: number;
}

interface Props {
  pendingPieces: ContentPiece[];
  readyPieces: ContentPiece[];
  distributedPieces: ContentPiece[];
  latestBriefing: ContentBriefing | null;
  activeJobId?: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = [
  "Review Queue",
  "Ready to Post",
  "Live Performance",
  "Today's Briefing",
] as const;

const TYPE_ORDER = ["BLOG", "TWITTER", "TIKTOK", "AD_COPY", "EMAIL"];

const TYPE_COLORS: Record<string, string> = {
  BLOG: "bg-blue-500/20 text-blue-400",
  TWITTER: "bg-sky-500/20 text-sky-400",
  TIKTOK: "bg-pink-500/20 text-pink-400",
  AD_COPY: "bg-amber-500/20 text-amber-400",
  EMAIL: "bg-green-500/20 text-green-400",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function scoreColor(score: number): string {
  if (score >= 0.7) return "bg-green-500";
  if (score >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

function groupByType(pieces: ContentPiece[]): ContentPiece[] {
  return [...pieces].sort(
    (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ContentFactoryClient({
  pendingPieces: initialPending,
  readyPieces: initialReady,
  distributedPieces,
  latestBriefing,
  activeJobId: initialJobId,
}: Props) {
  const [tab, setTab] = useState(0);
  const [pending, setPending] = useState(initialPending);
  const [ready, setReady] = useState(initialReady);
  const [jobId, setJobId] = useState<string | null>(initialJobId ?? null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [stale, setStale] = useState(false);
  const lastUpdateRef = useRef<number>(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/admin/content-factory/generate-status/${jobId}`
        );
        if (!res.ok) return;
        const data: JobStatus = await res.json();
        setJobStatus((prev) => {
          if (
            !prev ||
            prev.currentStep !== data.currentStep ||
            prev.status !== data.status
          ) {
            lastUpdateRef.current = Date.now();
            setStale(false);
          }
          return data;
        });

        if (data.status === "SUCCESS") {
          // Auto-hide after 3 seconds, then refresh
          if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
          doneTimerRef.current = setTimeout(() => {
            setJobId(null);
            setJobStatus(null);
            window.location.reload();
          }, 3000);
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.status === "FAILED") {
          if (pollRef.current) clearInterval(pollRef.current);
        } else {
          // Check staleness
          if (Date.now() - lastUpdateRef.current > 60000) {
            setStale(true);
          }
        }
      } catch {
        // Network error — keep polling
      }
    };

    // Initial fetch immediately
    poll();
    pollRef.current = setInterval(poll, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, [jobId]);

  const handleGenerateNow = async () => {
    try {
      const res = await fetch("/api/admin/content-factory/generate-now", {
        method: "POST",
      });
      const data = await res.json();
      if (data.jobId) {
        setJobId(data.jobId);
        setJobStatus({
          status: "QUEUED",
          currentStep: 0,
          totalSteps: 11,
          stepLabel: "Queued…",
          errorMessage: null,
          piecesCreated: 0,
        });
        setStale(false);
        lastUpdateRef.current = Date.now();
      }
    } catch {
      // Network error
    }
  };

  const handleRetry = () => {
    setJobId(null);
    setJobStatus(null);
    setStale(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Content Factory</h1>
            <p className="mt-1 text-sm text-white/50">
              AI-generated content for review and distribution
            </p>
          </div>
          {jobId && jobStatus ? (
            <GenerationProgress
              jobId={jobId}
              status={jobStatus}
              stale={stale}
              onRetry={handleRetry}
            />
          ) : (
            <button
              onClick={handleGenerateNow}
              className="rounded-lg bg-[#7C5CFC] px-4 py-2 text-sm font-medium transition hover:bg-[#6B4DE6]"
            >
              Generate Now
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div className="mb-6 flex gap-1 rounded-lg bg-[#13131F] p-1">
          {TABS.map((label, i) => (
            <button
              key={label}
              onClick={() => setTab(i)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === i
                  ? "bg-[#7C5CFC] text-white"
                  : "text-white/60 hover:text-white/90"
              }`}
            >
              {label}
              {i === 0 && pending.length > 0 && (
                <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs">
                  {pending.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 0 && (
          <ReviewQueue
            pieces={pending}
            onUpdate={(updated) => {
              setPending((p) => p.filter((x) => x.id !== updated.id));
              if (
                updated.status === "APPROVED" ||
                updated.status === "EDITED"
              ) {
                setReady((r) => [updated, ...r]);
              }
            }}
            onBulkApprove={(ids) => {
              setPending((p) => p.filter((x) => !ids.includes(x.id)));
              const approved = pending
                .filter((x) => ids.includes(x.id))
                .map((x) => ({ ...x, status: "APPROVED" }));
              setReady((r) => [...approved, ...r]);
            }}
          />
        )}
        {tab === 1 && <ReadyToPost pieces={ready} />}
        {tab === 2 && <LivePerformance pieces={distributedPieces} />}
        {tab === 3 && <TodaysBriefing briefing={latestBriefing} />}
      </div>
    </div>
  );
}

// ─── Generation Progress ────────────────────────────────────────────────────

function GenerationProgress({
  jobId,
  status,
  stale,
  onRetry,
}: {
  jobId: string;
  status: JobStatus;
  stale: boolean;
  onRetry: () => void;
}) {
  const pct = Math.round((status.currentStep / status.totalSteps) * 100);

  if (status.status === "FAILED") {
    return (
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-red-400">Generation failed</p>
          <p className="text-xs text-red-400/70">
            {status.errorMessage ?? "Unknown error"}
          </p>
        </div>
        <button
          onClick={onRetry}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
        >
          Try again
        </button>
      </div>
    );
  }

  if (status.status === "SUCCESS") {
    return (
      <div className="flex items-center gap-3">
        <div className="h-3 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-full rounded-full bg-green-500 transition-all duration-300 ease-out" />
        </div>
        <span className="text-sm font-medium text-green-400">
          {status.stepLabel}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-[200px]">
        <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#7C5CFC] to-[#9B7DFF] transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs text-white/50">
            {stale ? (
              <span className="text-amber-400">
                Taking longer than expected…
              </span>
            ) : (
              status.stepLabel
            )}
          </p>
          <p className="text-[10px] text-white/25">{jobId.slice(0, 8)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 1: Review Queue ─────────────────────────────────────────────────────

function ReviewQueue({
  pieces,
  onUpdate,
  onBulkApprove,
}: {
  pieces: ContentPiece[];
  onUpdate: (piece: ContentPiece) => void;
  onBulkApprove: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [viewMode, setViewMode] = useState<"preview" | "raw">("preview");
  const sorted = groupByType(pieces);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === sorted.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map((p) => p.id)));
    }
  };

  const handleApprove = async (pieceId: string) => {
    const res = await fetch("/api/admin/content-factory/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceId }),
    });
    if (res.ok) {
      const piece = sorted.find((p) => p.id === pieceId);
      if (piece) onUpdate({ ...piece, status: "APPROVED" });
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    const res = await fetch("/api/admin/content-factory/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceId: rejectId, reason: rejectReason }),
    });
    if (res.ok) {
      const piece = sorted.find((p) => p.id === rejectId);
      if (piece) onUpdate({ ...piece, status: "REJECTED" });
    }
    setRejectId(null);
    setRejectReason("");
  };

  const handleEdit = async (pieceId: string) => {
    const res = await fetch("/api/admin/content-factory/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceId, finalBody: editText }),
    });
    if (res.ok) {
      const piece = sorted.find((p) => p.id === pieceId);
      if (piece) onUpdate({ ...piece, status: "EDITED", finalBody: editText });
    }
    setEditingId(null);
    setEditText("");
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selected);
    const res = await fetch("/api/admin/content-factory/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceIds: ids }),
    });
    if (res.ok) {
      onBulkApprove(ids);
      setSelected(new Set());
    }
  };

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl bg-[#13131F] p-12 text-center text-white/50">
        No content pending review. Hit &ldquo;Generate Now&rdquo; to create
        today&apos;s batch.
      </div>
    );
  }

  return (
    <div>
      {/* Bulk toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={selectAll}
          className="rounded-md bg-[#13131F] px-3 py-1.5 text-sm text-white/70 hover:text-white"
        >
          {selected.size === sorted.length ? "Deselect all" : "Select all visible"}
        </button>
        {selected.size > 0 && (
          <button
            onClick={handleBulkApprove}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500"
          >
            Approve selected ({selected.size})
          </button>
        )}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {sorted.map((piece) => (
          <div key={piece.id} className="rounded-xl bg-[#13131F] p-5">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(piece.id)}
                onChange={() => toggleSelect(piece.id)}
                className="mt-1 h-4 w-4 rounded accent-[#7C5CFC]"
              />
              <div
                className="flex-1 cursor-pointer"
                onClick={() =>
                  setExpandedId(expandedId === piece.id ? null : piece.id)
                }
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[piece.type] ?? "bg-white/10 text-white/60"}`}
                  >
                    {piece.type}
                  </span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${scoreColor(piece.predictedScore)}`}
                    title={`Score: ${piece.predictedScore.toFixed(2)}`}
                  />
                  <span className="text-xs text-white/40">
                    {relativeTime(piece.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold">{piece.hook}</p>
                <p className="mt-1 text-sm text-white/60 line-clamp-3">
                  {piece.body}
                </p>
              </div>
            </div>

            {/* Expanded view */}
            {expandedId === piece.id && (
              <div className="mt-4 border-t border-white/10 pt-4">
                {/* View toggle */}
                {editingId !== piece.id && (
                  <div className="mb-4 flex items-center gap-1 rounded-lg bg-[#0A0A0F] p-1 w-fit">
                    {(["preview", "raw"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                          viewMode === mode
                            ? "bg-[#7C5CFC] text-white"
                            : "text-white/40 hover:text-white/70"
                        }`}
                      >
                        {mode === "preview" ? "Preview" : "Raw"}
                      </button>
                    ))}
                  </div>
                )}

                {editingId === piece.id ? (
                  /* Split edit: preview left, editor right */
                  <div>
                    <div className="flex gap-4">
                      <div className="flex-1 min-w-0 overflow-auto max-h-[600px] rounded-lg border border-white/10 bg-white/[0.02] p-4">
                        <p className="text-[10px] uppercase tracking-widest text-white/25 mb-3">Live Preview</p>
                        <ContentPreview
                          piece={{ ...piece, body: editText }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-widest text-white/25 mb-3">Edit Content</p>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full rounded-lg bg-[#0A0A0F] p-3 font-mono text-sm text-white/90 border border-white/10"
                          rows={20}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleEdit(piece.id)}
                        className="rounded-md bg-[#7C5CFC] px-3 py-1.5 text-sm font-medium"
                      >
                        Save Edit
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white/70"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : viewMode === "preview" ? (
                  <ContentPreview piece={piece} />
                ) : (
                  <>
                    <pre className="whitespace-pre-wrap font-mono text-sm text-white/80">
                      {piece.body}
                    </pre>
                    {piece.cta && (
                      <p className="mt-3 text-sm text-white/50">
                        <span className="font-medium text-white/70">CTA:</span>{" "}
                        {piece.cta}
                      </p>
                    )}
                    {piece.targetKeyword && (
                      <p className="mt-1 text-sm text-white/50">
                        <span className="font-medium text-white/70">Keyword:</span>{" "}
                        {piece.targetKeyword}
                      </p>
                    )}
                  </>
                )}

                {/* Action buttons — always visible */}
                {editingId !== piece.id && (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleApprove(piece.id)}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(piece.id);
                        setEditText(piece.body);
                      }}
                      className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/20"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setRejectId(piece.id)}
                      className="rounded-md bg-red-600/20 px-3 py-1.5 text-sm text-red-400 hover:bg-red-600/30"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl bg-[#13131F] p-6">
            <h3 className="text-lg font-semibold">Reject Content</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why? (optional)"
              className="mt-3 w-full rounded-lg bg-[#0A0A0F] p-3 text-sm text-white/90"
              rows={3}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectId(null);
                  setRejectReason("");
                }}
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white/70"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Ready to Post ────────────────────────────────────────────────────

function ReadyToPost({ pieces }: { pieces: ContentPiece[] }) {
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState("");
  const sorted = groupByType(pieces);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const copyAllByType = (type: string) => {
    const items = sorted
      .filter((p) => p.type === type)
      .map((p) => p.finalBody || p.body);
    navigator.clipboard.writeText(items.join("\n---\n"));
  };

  const handleMarkDistributed = async () => {
    if (!markingId || !liveUrl) return;
    await fetch("/api/admin/content-factory/mark-distributed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceId: markingId, distributedUrl: liveUrl }),
    });
    setMarkingId(null);
    setLiveUrl("");
    window.location.reload();
  };

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl bg-[#13131F] p-12 text-center text-white/50">
        No approved content ready to post.
      </div>
    );
  }

  // Group headers with copy-all buttons
  const types = [...new Set(sorted.map((p) => p.type))];

  return (
    <div className="space-y-6">
      {types.map((type) => {
        const items = sorted.filter((p) => p.type === type);
        return (
          <div key={type}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white/70">
                {type} ({items.length})
              </h3>
              {items.length > 1 && (
                <button
                  onClick={() => copyAllByType(type)}
                  className="rounded-md bg-white/10 px-3 py-1 text-xs text-white/60 hover:text-white"
                >
                  Copy all {items.length} {type.toLowerCase()}s
                </button>
              )}
            </div>
            <div className="space-y-3">
              {items.map((piece) => (
                <div key={piece.id} className="rounded-xl bg-[#13131F] p-5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[piece.type] ?? "bg-white/10 text-white/60"}`}
                    >
                      {piece.type}
                    </span>
                    <span className="text-xs text-white/40">
                      {piece.status === "EDITED" ? "Edited" : "Approved"}
                    </span>
                  </div>
                  <p className="mt-2 font-semibold">{piece.hook}</p>
                  <pre className="mt-2 whitespace-pre-wrap text-sm text-white/70">
                    {piece.finalBody || piece.body}
                  </pre>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() =>
                        copyToClipboard(piece.finalBody || piece.body)
                      }
                      className="rounded-md bg-[#7C5CFC] px-4 py-2 text-sm font-medium transition hover:bg-[#6B4DE6]"
                    >
                      Copy to clipboard
                    </button>
                    <button
                      onClick={() => setMarkingId(piece.id)}
                      className="rounded-md bg-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/20"
                    >
                      Mark as posted
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Mark distributed modal */}
      {markingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl bg-[#13131F] p-6">
            <h3 className="text-lg font-semibold">Mark as Posted</h3>
            <input
              value={liveUrl}
              onChange={(e) => setLiveUrl(e.target.value)}
              placeholder="Live URL (e.g. https://twitter.com/...)"
              className="mt-3 w-full rounded-lg bg-[#0A0A0F] p-3 text-sm text-white/90"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setMarkingId(null);
                  setLiveUrl("");
                }}
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white/70"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkDistributed}
                disabled={!liveUrl}
                className="rounded-md bg-[#7C5CFC] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Live Performance ─────────────────────────────────────────────────

function LivePerformance({ pieces }: { pieces: ContentPiece[] }) {
  const [sortBy, setSortBy] = useState<"signups" | "date">("signups");

  const sorted = [...pieces].sort((a, b) => {
    if (sortBy === "signups") {
      const aS = (a.metrics as Record<string, number>)?.signups ?? 0;
      const bS = (b.metrics as Record<string, number>)?.signups ?? 0;
      return bS - aS;
    }
    return (
      new Date(b.distributedAt!).getTime() -
      new Date(a.distributedAt!).getTime()
    );
  });

  if (pieces.length === 0) {
    return (
      <div className="rounded-xl bg-[#13131F] p-12 text-center text-white/50">
        No distributed content yet. Approve and post content to track
        performance.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#13131F] overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-white/50">
            <th className="px-5 py-3 font-medium">Type</th>
            <th className="px-5 py-3 font-medium">Title</th>
            <th className="px-5 py-3 font-medium">
              <button
                onClick={() => setSortBy("date")}
                className="hover:text-white"
              >
                Posted
              </button>
            </th>
            <th className="px-5 py-3 font-medium">URL</th>
            <th className="px-5 py-3 font-medium text-right">Views</th>
            <th className="px-5 py-3 font-medium text-right">Clicks</th>
            <th className="px-5 py-3 font-medium text-right">
              <button
                onClick={() => setSortBy("signups")}
                className="hover:text-white"
              >
                Signups
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((piece) => {
            const m = (piece.metrics as Record<string, number>) ?? {};
            return (
              <tr
                key={piece.id}
                className="border-b border-white/5 text-white/80"
              >
                <td className="px-5 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[piece.type] ?? "bg-white/10 text-white/60"}`}
                  >
                    {piece.type}
                  </span>
                </td>
                <td className="px-5 py-3 max-w-[200px] truncate">
                  {piece.title}
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-white/50">
                  {piece.distributedAt
                    ? new Date(piece.distributedAt).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-5 py-3">
                  {piece.distributedUrl ? (
                    <a
                      href={piece.distributedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#7C5CFC] hover:underline"
                    >
                      View
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-5 py-3 text-right">{m.views ?? "—"}</td>
                <td className="px-5 py-3 text-right">{m.clicks ?? "—"}</td>
                <td className="px-5 py-3 text-right font-medium">
                  {m.signups ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tab 4: Today's Briefing ─────────────────────────────────────────────────

function TodaysBriefing({
  briefing,
}: {
  briefing: ContentBriefing | null;
}) {
  if (!briefing) {
    return (
      <div className="rounded-xl bg-[#13131F] p-12 text-center text-white/50">
        No briefing generated yet. The daily research runs at 6 AM UTC, or hit
        &ldquo;Generate Now&rdquo; to trigger it manually.
      </div>
    );
  }

  const refreshedAt = new Date(briefing.generatedAt);
  const reddit = (briefing.redditTop ?? []) as RedditPost[];
  const ga4 = (briefing.ga4Winners ?? []) as GA4Winner[];

  return (
    <div>
      <p className="mb-6 text-sm text-white/50">
        Last refreshed:{" "}
        {refreshedAt.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "UTC",
        })}{" "}
        UTC today
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Reddit Top */}
        <div className="rounded-xl bg-[#13131F] p-5">
          <h3 className="text-sm font-medium text-white/60">
            Reddit Top Posts
          </h3>
          {reddit.length === 0 ? (
            <p className="mt-3 text-sm text-white/40">No data</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {reddit.map((post, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/50">
                    {post.upvotes}
                  </span>
                  <div>
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/80 hover:text-[#7C5CFC]"
                    >
                      {post.title}
                    </a>
                    <span className="ml-2 text-xs text-white/40">
                      r/{post.subreddit}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Twitter Top */}
        <div className="rounded-xl bg-[#13131F] p-5">
          <h3 className="text-sm font-medium text-white/60">Twitter Top</h3>
          <p className="mt-3 text-sm text-white/40">
            Coming in v2 — Twitter/X API integration
          </p>
        </div>

        {/* GA4 Winners */}
        <div className="rounded-xl bg-[#13131F] p-5">
          <h3 className="text-sm font-medium text-white/60">
            GA4 Top Blog Pages (Last 7 Days)
          </h3>
          {ga4.length === 0 ? (
            <p className="mt-3 text-sm text-white/40">
              No data — GA4 credentials may not be configured
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {ga4.map((page, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-white/80">{page.pagePath}</span>
                  <span className="text-white/50">
                    {page.sessions} sessions
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Trends */}
        <div className="rounded-xl bg-[#13131F] p-5">
          <h3 className="text-sm font-medium text-white/60">Google Trends</h3>
          <p className="mt-3 text-sm text-white/40">
            Coming in v2 — Google Trends integration
          </p>
        </div>
      </div>
    </div>
  );
}
