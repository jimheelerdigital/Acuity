"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, ChevronDown, ChevronUp, Sparkles, RefreshCw, Shield, Copy, Trash2 } from "lucide-react";

interface DailyMetric {
  spendCents: number;
  conversions: number;
}

interface Ad {
  id: string;
  status: string;
  dailyBudgetCents: number | null;
  metrics: DailyMetric[];
}

interface Creative {
  id: string;
  creativeType: string;
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
  imageUrl: string | null;
  videoUrl: string | null;
  generationPrompt: string | null;
  complianceStatus: string;
  complianceNotes: string | null;
  approved: boolean;
  ads: Ad[];
}

interface Angle {
  id: string;
  hypothesis: string;
  targetPersona: string;
  valueSurface: string;
  researchNotes: string;
  score: number;
  advanced: boolean;
  creatives: Creative[];
}

interface Experiment {
  id: string;
  topicBrief: string;
  status: string;
  createdAt: string;
  conclusionSummary: string | null;
  project: { name: string; slug: string };
  angles: Angle[];
}

const SURFACE_COLORS: Record<string, string> = {
  problem: "bg-red-500/15 text-red-400",
  outcome: "bg-emerald-500/15 text-emerald-400",
  social_proof: "bg-sky-500/15 text-sky-400",
  mechanism: "bg-amber-500/15 text-amber-400",
  story: "bg-purple-500/15 text-purple-400",
  comparison: "bg-orange-500/15 text-orange-400",
  identity: "bg-pink-500/15 text-pink-400",
  urgency: "bg-rose-500/15 text-rose-400",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-500/20 text-zinc-400",
  awaiting_approval: "bg-amber-500/20 text-amber-400",
  live: "bg-emerald-500/20 text-emerald-400",
  concluded: "bg-[#7C5CFC]/20 text-[#7C5CFC]",
};

const COMPLIANCE_COLORS: Record<string, string> = {
  pending: "border-zinc-500/30",
  passed: "border-emerald-500/30",
  flagged: "border-amber-500/50",
};

export default function ExperimentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [advancing, setAdvancing] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<Set<string>>(new Set());
  const [complianceRunning, setComplianceRunning] = useState(false);
  const [complianceMessage, setComplianceMessage] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const loadExperiment = useCallback(async () => {
    const res = await fetch(`/api/admin/adlab/experiments/${id}`);
    if (res.ok) {
      const data = await res.json();
      setExperiment(data);
      setSelected(new Set(data.angles.filter((a: Angle) => a.advanced).map((a: Angle) => a.id)));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { loadExperiment(); }, [loadExperiment]);

  function toggleAngle(angleId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(angleId)) next.delete(angleId);
      else next.add(angleId);
      return next;
    });
  }

  async function advanceSelected() {
    if (selected.size === 0 || !experiment) return;

    const unapprovedCount = experiment.angles.filter((a) => !selected.has(a.id)).length;
    if (unapprovedCount > 0) {
      const confirmed = confirm(
        `This will permanently delete ${unapprovedCount} unapproved angle${unapprovedCount === 1 ? "" : "s"}. Continue?`
      );
      if (!confirmed) return;
    }

    setAdvancing(true);
    await fetch("/api/admin/adlab/angles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ angleIds: [...selected], experimentId: experiment.id }),
    });
    await loadExperiment();
    setAdvancing(false);
  }

  async function generateCreatives(angleId: string) {
    setGeneratingFor((prev) => new Set(prev).add(angleId));
    await fetch("/api/admin/adlab/creatives/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ angleId }),
    });
    await loadExperiment();
    setGeneratingFor((prev) => {
      const next = new Set(prev);
      next.delete(angleId);
      return next;
    });
  }

  async function toggleApprove(creativeId: string, currentApproved: boolean) {
    await fetch(`/api/admin/adlab/creatives/${creativeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved: !currentApproved }),
    });
    await loadExperiment();
  }

  async function runCompliance() {
    if (!experiment) return;
    setComplianceRunning(true);
    setComplianceMessage(null);
    const res = await fetch("/api/admin/adlab/creatives/compliance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId: experiment.id }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.flaggedCount > 0) {
        setComplianceMessage(
          `${data.flaggedCount} creative${data.flaggedCount === 1 ? " was" : "s were"} flagged and auto-unapproved. Edit the copy and re-check, or generate new variants.`
        );
      } else {
        setComplianceMessage(null);
      }
    }
    await loadExperiment();
    setComplianceRunning(false);
  }

  async function finalizeCreatives() {
    if (!experiment) return;

    const allCreatives = experiment.angles.flatMap((a) => a.creatives);
    const toDeleteCount = allCreatives.filter((c) => !c.approved || c.complianceStatus === "flagged").length;

    if (toDeleteCount === 0) {
      alert("Nothing to clean up — all creatives are approved and compliant.");
      return;
    }

    const confirmed = confirm(
      `This will permanently delete ${toDeleteCount} unapproved/flagged creative${toDeleteCount === 1 ? "" : "s"} and their storage files. Continue?`
    );
    if (!confirmed) return;

    setFinalizing(true);
    await fetch("/api/admin/adlab/creatives/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId: experiment.id }),
    });
    await loadExperiment();
    setFinalizing(false);
  }

  function cloneWinningAds() {
    if (!experiment) return;

    const adsWithCpl = experiment.angles.flatMap((angle) =>
      angle.creatives.flatMap((creative) =>
        creative.ads
          .filter((ad) => ad.status === "scaled" || ad.status === "live")
          .map((ad) => {
            const totalSpend = ad.metrics.reduce((s, m) => s + m.spendCents, 0);
            const totalConversions = ad.metrics.reduce((s, m) => s + m.conversions, 0);
            return {
              cpl: totalConversions > 0 ? totalSpend / totalConversions : Infinity,
              hypothesis: angle.hypothesis,
              headline: creative.headline,
              valueSurface: angle.valueSurface,
              targetPersona: angle.targetPersona,
            };
          })
      )
    );

    adsWithCpl.sort((a, b) => a.cpl - b.cpl);
    const winners = adsWithCpl.slice(0, 2);

    if (winners.length === 0) {
      alert("No scaled or live ads with metrics to clone from.");
      return;
    }

    const brief = [
      `Follow-up experiment based on winners from experiment ${experiment.id.slice(0, 8)}.`,
      "",
      "Winning patterns to build on:",
      ...winners.map((w, i) =>
        `${i + 1}. [${w.valueSurface}] ${w.hypothesis} — headline: "${w.headline}" (CPL: $${w.cpl === Infinity ? "N/A" : (w.cpl / 100).toFixed(2)})`
      ),
      "",
      "Generate new angle variations that extend these winning directions.",
    ].join("\n");

    router.push(`/admin/adlab/experiments/new?${new URLSearchParams({ brief })}`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-[#A0A0B8] animate-spin" />
      </div>
    );
  }

  if (!experiment) {
    return <p className="text-sm text-red-400">Experiment not found.</p>;
  }

  const sortedAngles = [...experiment.angles].sort((a, b) => b.score - a.score);
  const allCreatives = experiment.angles.flatMap((a) => a.creatives);
  const hasCreatives = allCreatives.length > 0;
  const allAnglesAdvanced = experiment.angles.length > 0 && experiment.angles.every((a) => a.advanced);
  const hasUnapprovedCreatives = allCreatives.some((c) => !c.approved || c.complianceStatus === "flagged");
  const approvedCount = allCreatives.filter((c) => c.approved).length;
  const launchReadyCount = allCreatives.filter((c) => c.approved && c.complianceStatus === "passed").length;

  return (
    <>
      {/* Compliance flagged message */}
      {complianceMessage && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          {complianceMessage}
        </div>
      )}

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs text-[#A0A0B8]">{experiment.project.name}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[experiment.status] || ""}`}>
            {experiment.status.replace("_", " ")}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Experiment</h1>
        <div className="rounded-lg border border-white/10 bg-[#1E1E2E] p-4">
          <p className="text-xs text-[#A0A0B8] mb-1">Topic Brief</p>
          <p className="text-sm text-white">{experiment.topicBrief}</p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Advance angles — show button if not all advanced yet, otherwise show count */}
        {experiment.status === "awaiting_approval" && !allAnglesAdvanced && (
          <button
            onClick={advanceSelected}
            disabled={selected.size === 0 || advancing}
            className="inline-flex items-center gap-2 rounded-lg bg-[#7C5CFC] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] disabled:opacity-50"
          >
            {advancing && <Loader2 className="h-4 w-4 animate-spin" />}
            Advance Selected ({selected.size})
          </button>
        )}
        {allAnglesAdvanced && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {experiment.angles.length} angle{experiment.angles.length === 1 ? "" : "s"} advanced
          </span>
        )}

        {/* Compliance check */}
        {hasCreatives && (
          <button
            onClick={runCompliance}
            disabled={complianceRunning}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-[#A0A0B8] hover:text-white hover:border-white/20 transition disabled:opacity-50"
          >
            {complianceRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            Run Compliance Check
          </button>
        )}

        {/* Finalize creatives — only show if there are unapproved ones to clean */}
        {hasCreatives && hasUnapprovedCreatives && (
          <button
            onClick={finalizeCreatives}
            disabled={finalizing}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
          >
            {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Finalize Creatives
          </button>
        )}

        {/* Show approved count when all are finalized */}
        {hasCreatives && !hasUnapprovedCreatives && approvedCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {approvedCount} creative{approvedCount === 1 ? "" : "s"} approved
          </span>
        )}

        {/* Launch ready indicator */}
        {launchReadyCount > 0 && experiment.status === "awaiting_approval" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFC]/10 border border-[#7C5CFC]/20 px-3 py-2 text-xs text-[#7C5CFC]">
            <Sparkles className="h-3.5 w-3.5" />
            {launchReadyCount} ready to launch
          </span>
        )}

        {/* Clone for concluded experiments */}
        {experiment.status === "concluded" && (
          <button
            onClick={cloneWinningAds}
            className="inline-flex items-center gap-2 rounded-lg border border-[#7C5CFC]/30 bg-[#7C5CFC]/10 px-4 py-2 text-sm text-[#7C5CFC] hover:bg-[#7C5CFC]/20 transition"
          >
            <Copy className="h-4 w-4" />
            Clone winning ads with new variants
          </button>
        )}
      </div>

      {/* Angles + Creatives */}
      <div className="space-y-6">
        {sortedAngles.map((angle) => (
          <div key={angle.id}>
            <AngleCard
              angle={angle}
              isSelected={selected.has(angle.id)}
              onToggle={() => toggleAngle(angle.id)}
              selectable={experiment.status === "awaiting_approval" && !allAnglesAdvanced}
              onGenerate={() => generateCreatives(angle.id)}
              generating={generatingFor.has(angle.id)}
            />

            {/* Creatives under this angle — grouped by type */}
            {angle.creatives.length > 0 && (() => {
              const imageCreatives = angle.creatives.filter((c) => c.creativeType === "image");
              const videoCreatives = angle.creatives.filter((c) => c.creativeType === "video");
              return (
                <div className="ml-8 mt-3 space-y-4">
                  {imageCreatives.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-[#A0A0B8] uppercase tracking-wider mb-2">Image Creatives</p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {imageCreatives.map((creative) => (
                          <CreativeCard key={creative.id} creative={creative} onToggleApprove={() => toggleApprove(creative.id, creative.approved)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {videoCreatives.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-[#A0A0B8] uppercase tracking-wider mb-2">Video Creatives</p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {videoCreatives.map((creative) => (
                          <CreativeCard key={creative.id} creative={creative} onToggleApprove={() => toggleApprove(creative.id, creative.approved)} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </>
  );
}

function AngleCard({
  angle,
  isSelected,
  onToggle,
  selectable,
  onGenerate,
  generating,
}: {
  angle: Angle;
  isSelected: boolean;
  onToggle: () => void;
  selectable: boolean;
  onGenerate: () => void;
  generating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-xl border bg-[#13131F] p-5 transition ${
        angle.advanced
          ? "border-emerald-500/30"
          : isSelected
            ? "border-[#7C5CFC]/50"
            : "border-white/10"
      }`}
    >
      <div className="flex items-start gap-3">
        {selectable && (
          <button
            onClick={onToggle}
            className={`mt-0.5 shrink-0 h-5 w-5 rounded border transition ${
              isSelected
                ? "bg-[#7C5CFC] border-[#7C5CFC]"
                : "border-white/20 hover:border-white/40"
            } flex items-center justify-center`}
          >
            {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SURFACE_COLORS[angle.valueSurface] || ""}`}>
              {angle.valueSurface.replace("_", " ")}
            </span>
            <span className="text-[10px] text-[#A0A0B8]">{angle.targetPersona}</span>
            {angle.advanced && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                advanced
              </span>
            )}
          </div>

          <p className="text-sm text-white leading-relaxed">{angle.hypothesis}</p>

          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-[#A0A0B8] hover:text-white transition-colors"
            >
              Notes {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {angle.advanced && angle.creatives.length === 0 && (
              <button
                onClick={onGenerate}
                disabled={generating}
                className="flex items-center gap-1 text-xs text-[#7C5CFC] hover:text-[#9B7FFF] transition-colors"
              >
                {generating ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="h-3 w-3" /> Generate Creatives</>
                )}
              </button>
            )}
            {angle.advanced && angle.creatives.length > 0 && (
              <button
                onClick={onGenerate}
                disabled={generating}
                className="flex items-center gap-1 text-xs text-[#A0A0B8] hover:text-white transition-colors"
              >
                {generating ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Regenerating...</>
                ) : (
                  <><RefreshCw className="h-3 w-3" /> Regenerate</>
                )}
              </button>
            )}
          </div>

          {expanded && (
            <p className="mt-2 text-xs text-[#A0A0B8] whitespace-pre-line leading-relaxed">
              {angle.researchNotes}
            </p>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-white/5 text-sm font-bold text-white">
          {angle.score}
        </div>
      </div>
    </div>
  );
}

function CreativeCard({
  creative,
  onToggleApprove,
}: {
  creative: Creative;
  onToggleApprove: () => void;
}) {
  return (
    <div
      className={`rounded-lg border bg-[#1E1E2E] overflow-hidden transition ${COMPLIANCE_COLORS[creative.complianceStatus] || "border-white/10"}`}
    >
      {creative.creativeType === "image" && creative.imageUrl && (
        <div className="aspect-square bg-black/20">
          <img
            src={creative.imageUrl}
            alt={creative.headline}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      {creative.creativeType === "video" && creative.videoUrl && (
        <div className="aspect-square bg-black/20">
          <video
            src={creative.videoUrl}
            controls
            className="w-full h-full object-cover"
          />
        </div>
      )}
      {creative.creativeType === "video" && !creative.videoUrl && (
        <div className="aspect-square bg-black/20 flex items-center justify-center">
          <span className="text-xs text-[#A0A0B8]">Video pending</span>
        </div>
      )}

      <div className="p-3 space-y-2">
        <p className="text-xs font-semibold text-white leading-snug">{creative.headline}</p>
        <p className="text-[11px] text-[#A0A0B8] leading-relaxed">{creative.primaryText}</p>
        <p className="text-[10px] text-[#A0A0B8]">{creative.description}</p>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
              creative.creativeType === "video"
                ? "bg-sky-500/15 text-sky-400"
                : "bg-[#7C5CFC]/15 text-[#7C5CFC]"
            }`}>
              {creative.creativeType}
            </span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-[#A0A0B8] font-mono">
              {creative.cta}
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
              creative.complianceStatus === "passed"
                ? "bg-emerald-500/15 text-emerald-400"
                : creative.complianceStatus === "flagged"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-zinc-500/15 text-zinc-400"
            }`}>
              {creative.complianceStatus}
            </span>
          </div>

          <button
            onClick={onToggleApprove}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
              creative.approved
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-white/5 text-[#A0A0B8] hover:text-white"
            }`}
          >
            {creative.approved ? "Approved" : "Approve"}
          </button>
        </div>

        {creative.complianceStatus === "flagged" && creative.complianceNotes && (
          <p className="text-[10px] text-amber-400 leading-relaxed mt-1">
            {creative.complianceNotes}
          </p>
        )}
      </div>
    </div>
  );
}
