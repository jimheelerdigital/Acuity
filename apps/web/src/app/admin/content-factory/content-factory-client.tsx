"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContentPiece {
  id: string;
  type: string;
  title: string;
  body: string;
  hook: string;
  cta: string;
  predictedScore: number;
  status: string;
  heroImageUrl: string | null;
  createdAt: string;
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
  pieces: ContentPiece[];
  activeJobId?: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CONTENT_TABS = [
  { key: "TWITTER", label: "X Posts" },
  { key: "INSTAGRAM", label: "Instagram" },
  { key: "TIKTOK", label: "TikTok Scripts" },
] as const;

const TYPE_COLORS: Record<string, string> = {
  TWITTER: "bg-sky-500/20 text-sky-400",
  TIKTOK: "bg-pink-500/20 text-pink-400",
  INSTAGRAM: "bg-purple-500/20 text-purple-400",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING_REVIEW: "bg-amber-500/20 text-amber-400",
  APPROVED: "bg-green-500/20 text-green-400",
  EDITED: "bg-blue-500/20 text-blue-400",
  DISTRIBUTED: "bg-emerald-500/20 text-emerald-400",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: "Draft",
  APPROVED: "Approved",
  EDITED: "Edited",
  DISTRIBUTED: "Posted",
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ContentFactoryClient({
  pieces: initialPieces,
  activeJobId: initialJobId,
}: Props) {
  const [pieces, setPieces] = useState(initialPieces);
  const [contentTab, setContentTab] = useState(0);
  const [jobId, setJobId] = useState<string | null>(initialJobId ?? null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [stale, setStale] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
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
          if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
          doneTimerRef.current = setTimeout(() => {
            setJobId(null);
            setJobStatus(null);
            setGenerating(null);
            window.location.reload();
          }, 2000);
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.status === "FAILED") {
          setGenerating(null);
          if (pollRef.current) clearInterval(pollRef.current);
        } else {
          if (Date.now() - lastUpdateRef.current > 90000) {
            setStale(true);
          }
        }
      } catch {
        // Network error — keep polling
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, [jobId]);

  const handleGenerate = async (types: string[], label: string) => {
    setGenerating(label);
    try {
      const res = await fetch("/api/admin/content-factory/generate-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ types }),
      });
      const data = await res.json();
      if (data.jobId) {
        setJobId(data.jobId);
        setJobStatus({
          status: "QUEUED",
          currentStep: 0,
          totalSteps: types.length + 1,
          stepLabel: "Queued…",
          errorMessage: null,
          piecesCreated: 0,
        });
        setStale(false);
        lastUpdateRef.current = Date.now();
      } else {
        setGenerating(null);
      }
    } catch {
      setGenerating(null);
    }
  };

  const handleDelete = async (pieceId: string) => {
    if (!window.confirm("Delete this content piece?")) return;
    const res = await fetch("/api/admin/content-factory/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceId }),
    });
    if (res.ok) {
      setPieces((prev) => prev.filter((p) => p.id !== pieceId));
    }
  };

  const handleMarkPosted = async (pieceId: string) => {
    const res = await fetch("/api/admin/content-factory/mark-distributed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceId, distributedUrl: "manual" }),
    });
    if (res.ok) {
      setPieces((prev) =>
        prev.map((p) =>
          p.id === pieceId ? { ...p, status: "DISTRIBUTED" } : p
        )
      );
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const isGenerating = generating !== null;
  const currentTabType = CONTENT_TABS[contentTab].key;
  const filteredPieces = pieces.filter((p) => p.type === currentTabType);

  return (
    <div className="min-h-screen bg-[#0A0A0F] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Content Factory</h1>
          <p className="mt-1 text-sm text-white/50">
            On-demand content generation for X, Instagram, and TikTok
          </p>
        </div>

        {/* ─── Generation Progress Bar ─────────────────────────────────── */}
        {jobId && jobStatus && (
          <div className="mb-6">
            <GenerationProgress
              status={jobStatus}
              stale={stale}
              label={generating ?? "Generating"}
              onRetry={() => {
                setJobId(null);
                setJobStatus(null);
                setGenerating(null);
                setStale(false);
              }}
            />
          </div>
        )}

        {/* ─── Generate Buttons ────────────────────────────────────────── */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            onClick={() => handleGenerate(["X_POST"], "X Post")}
            disabled={isGenerating}
            className="rounded-xl bg-[#13131F] px-4 py-4 text-left transition hover:bg-[#1a1a2e] disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">𝕏</span>
              <span className="text-sm font-medium">Generate X Post</span>
            </div>
            <p className="mt-1 text-xs text-white/40">1 tweet, max 280 chars</p>
          </button>

          <button
            onClick={() => handleGenerate(["INSTAGRAM"], "Instagram Post")}
            disabled={isGenerating}
            className="rounded-xl bg-[#13131F] px-4 py-4 text-left transition hover:bg-[#1a1a2e] disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">📷</span>
              <span className="text-sm font-medium">Generate Instagram</span>
            </div>
            <p className="mt-1 text-xs text-white/40">
              Caption + AI image
            </p>
          </button>

          <button
            onClick={() => handleGenerate(["TIKTOK_SCRIPT"], "TikTok Script")}
            disabled={isGenerating}
            className="rounded-xl bg-[#13131F] px-4 py-4 text-left transition hover:bg-[#1a1a2e] disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🎬</span>
              <span className="text-sm font-medium">Generate TikTok</span>
            </div>
            <p className="mt-1 text-xs text-white/40">15-30s video script</p>
          </button>

          <button
            onClick={() =>
              handleGenerate(
                ["X_POST", "INSTAGRAM", "TIKTOK_SCRIPT"],
                "All Content"
              )
            }
            disabled={isGenerating}
            className="rounded-xl bg-gradient-to-br from-[#7C5CFC]/20 to-[#7C5CFC]/5 border border-[#7C5CFC]/20 px-4 py-4 text-left transition hover:from-[#7C5CFC]/30 hover:to-[#7C5CFC]/10 disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <span className="text-sm font-medium text-[#9B7DFF]">
                Generate All
              </span>
            </div>
            <p className="mt-1 text-xs text-white/40">1 of each type</p>
          </button>
        </div>

        {/* ─── Content Library ─────────────────────────────────────────── */}
        <div>
          <h2 className="mb-4 text-lg font-semibold">Content Library</h2>

          {/* Tab bar */}
          <div className="mb-4 flex gap-1 rounded-lg bg-[#13131F] p-1">
            {CONTENT_TABS.map((tab, i) => {
              const count = pieces.filter((p) => p.type === tab.key).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setContentTab(i)}
                  className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                    contentTab === i
                      ? "bg-[#7C5CFC] text-white"
                      : "text-white/60 hover:text-white/90"
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content list */}
          {filteredPieces.length === 0 ? (
            <div className="rounded-xl bg-[#13131F] p-12 text-center text-white/50">
              No {CONTENT_TABS[contentTab].label.toLowerCase()} yet. Hit a
              generate button above to create some.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPieces.map((piece) => (
                <ContentCard
                  key={piece.id}
                  piece={piece}
                  onCopy={copyToClipboard}
                  onDelete={handleDelete}
                  onMarkPosted={handleMarkPosted}
                  onRegenerate={() => {
                    const typeMap: Record<string, string> = {
                      TWITTER: "X_POST",
                      INSTAGRAM: "INSTAGRAM",
                      TIKTOK: "TIKTOK_SCRIPT",
                    };
                    handleGenerate(
                      [typeMap[piece.type] ?? piece.type],
                      `${piece.type} regeneration`
                    );
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Generation Progress ────────────────────────────────────────────────────

function GenerationProgress({
  status,
  stale,
  label,
  onRetry,
}: {
  status: JobStatus;
  stale: boolean;
  label: string;
  onRetry: () => void;
}) {
  const pct = Math.round((status.currentStep / status.totalSteps) * 100);

  if (status.status === "FAILED") {
    return (
      <div className="flex items-center justify-between rounded-xl bg-red-500/10 border border-red-500/20 px-5 py-4">
        <div>
          <p className="text-sm font-medium text-red-400">
            Generation failed
          </p>
          <p className="text-xs text-red-400/70">
            {status.errorMessage ?? "Unknown error"}
          </p>
        </div>
        <button
          onClick={onRetry}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (status.status === "SUCCESS") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-green-500/10 border border-green-500/20 px-5 py-4">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-full rounded-full bg-green-500" />
        </div>
        <span className="text-sm font-medium text-green-400">
          {status.stepLabel}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#13131F] border border-[#7C5CFC]/20 px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white/80">
          Generating {label}…
        </span>
        <span className="text-xs text-white/40">
          Step {status.currentStep}/{status.totalSteps}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#7C5CFC] to-[#9B7DFF] transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-white/50">
        {stale ? (
          <span className="text-amber-400">
            Taking longer than expected…
          </span>
        ) : (
          status.stepLabel
        )}
      </p>
    </div>
  );
}

// ─── Content Card ───────────────────────────────────────────────────────────

function ContentCard({
  piece,
  onCopy,
  onDelete,
  onMarkPosted,
  onRegenerate,
}: {
  piece: ContentPiece;
  onCopy: (text: string) => void;
  onDelete: (id: string) => void;
  onMarkPosted: (id: string) => void;
  onRegenerate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    onCopy(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const isInstagram = piece.type === "INSTAGRAM";
  const isTikTok = piece.type === "TIKTOK";

  return (
    <div className="rounded-xl bg-[#13131F] p-5">
      {/* Header row */}
      <div
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[piece.status] ?? "bg-white/10 text-white/60"}`}
          >
            {STATUS_LABELS[piece.status] ?? piece.status}
          </span>
          <span className="text-xs text-white/40">
            {formatDate(piece.createdAt)}
          </span>
        </div>

        {/* Instagram with thumbnail */}
        {isInstagram && piece.heroImageUrl ? (
          <div className="flex gap-4">
            <img
              src={piece.heroImageUrl}
              alt=""
              className="h-20 w-20 rounded-lg object-cover shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm text-white/80 line-clamp-3">
                {piece.body}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-white/80 line-clamp-3">{piece.body}</p>
        )}
      </div>

      {/* Expanded view */}
      {expanded && (
        <div className="mt-4 border-t border-white/10 pt-4">
          {/* Full content */}
          {isInstagram && piece.heroImageUrl && (
            <div className="mb-4">
              <img
                src={piece.heroImageUrl}
                alt=""
                className="w-full max-w-sm rounded-lg"
              />
            </div>
          )}

          <div className="mb-4">
            {isTikTok ? (
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">
                    Hook
                  </p>
                  <p className="text-sm font-medium text-white/90">
                    {piece.hook}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">
                    Body
                  </p>
                  <pre className="whitespace-pre-wrap text-sm text-white/80">
                    {piece.body}
                  </pre>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">
                    CTA
                  </p>
                  <p className="text-sm text-white/80">{piece.cta}</p>
                </div>
              </div>
            ) : (
              <>
                <pre className="whitespace-pre-wrap text-sm text-white/80">
                  {piece.body}
                </pre>
                {isInstagram && piece.cta && (
                  <p className="mt-3 text-sm text-blue-400/80">
                    {piece.cta}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {isInstagram ? (
              <>
                {piece.heroImageUrl && (
                  <a
                    href={piece.heroImageUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-[#7C5CFC] px-3 py-1.5 text-sm font-medium transition hover:bg-[#6B4DE6]"
                  >
                    Download Image
                  </a>
                )}
                <button
                  onClick={() =>
                    handleCopy(
                      `${piece.body}\n\n${piece.cta}`,
                      "caption"
                    )
                  }
                  className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/20"
                >
                  {copied === "caption" ? "Copied!" : "Copy Caption"}
                </button>
                <button
                  onClick={onRegenerate}
                  className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/20"
                >
                  Regenerate
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    const text = isTikTok
                      ? `[HOOK]\n${piece.hook}\n\n[BODY]\n${piece.body}\n\n[CTA]\n${piece.cta}`
                      : piece.body;
                    handleCopy(text, "text");
                  }}
                  className="rounded-md bg-[#7C5CFC] px-3 py-1.5 text-sm font-medium transition hover:bg-[#6B4DE6]"
                >
                  {copied === "text" ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={onRegenerate}
                  className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/20"
                >
                  Regenerate
                </button>
              </>
            )}

            {piece.status !== "DISTRIBUTED" && (
              <button
                onClick={() => onMarkPosted(piece.id)}
                className="rounded-md bg-green-600/20 px-3 py-1.5 text-sm text-green-400 hover:bg-green-600/30"
              >
                Mark as Posted
              </button>
            )}

            <button
              onClick={() => onDelete(piece.id)}
              className="rounded-md bg-red-600/20 px-3 py-1.5 text-sm text-red-400 hover:bg-red-600/30"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
