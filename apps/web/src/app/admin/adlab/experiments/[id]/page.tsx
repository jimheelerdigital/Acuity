"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, ChevronDown, ChevronUp, Sparkles, RefreshCw, Shield, Copy, Trash2, Rocket, XCircle, Upload, ImageIcon, X as XIcon, Info, Download } from "lucide-react";

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

interface ReferenceImage {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
}

interface Experiment {
  id: string;
  topicBrief: string;
  status: string;
  createdAt: string;
  conclusionSummary: string | null;
  project: { name: string; slug: string };
  referenceImages?: ReferenceImage[];
  angles: Angle[];
}

async function downloadImage(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

function slugify(text: string, maxLen = 40): string {
  return text.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, maxLen).replace(/-$/, "").toLowerCase();
}

function makeFilename(topicBrief: string, surface: string, hypothesis: string, index: number): string {
  return `${slugify(topicBrief, 30)}_${surface}_${slugify(hypothesis, 35)}_${index + 1}.png`;
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
  const [launching, setLaunching] = useState(false);
  const [useRefImages, setUseRefImages] = useState(false);
  const [launchResult, setLaunchResult] = useState<{ campaignId: string; campaignName: string; created: { creativeId: string }[]; errors: { creativeId: string; error: string }[] } | null>(null);
  const [activating, setActivating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [refImagesOpen, setRefImagesOpen] = useState(false);
  const [uploadingRefs, setUploadingRefs] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [generateAllRunning, setGenerateAllRunning] = useState(false);
  const [generateAllProgress, setGenerateAllProgress] = useState<string | null>(null);

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
      body: JSON.stringify({ angleId, useReferenceImages: useRefImages }),
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

  async function launchCampaign() {
    if (!experiment) return;
    setLaunching(true);
    setLaunchError(null);
    setLaunchResult(null);

    try {
      const res = await fetch("/api/admin/adlab/ads/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId: experiment.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLaunchError(data.error || "Launch failed");
      } else {
        setLaunchResult(data);
      }
    } catch {
      setLaunchError("Network error during launch");
    }
    setLaunching(false);
  }

  async function activateCampaign() {
    if (!experiment) return;
    setActivating(true);
    try {
      const res = await fetch("/api/admin/adlab/ads/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId: experiment.id }),
      });
      if (res.ok) {
        setLaunchResult(null);
        await loadExperiment();
      } else {
        const data = await res.json();
        setLaunchError(data.error || "Activation failed");
      }
    } catch {
      setLaunchError("Network error during activation");
    }
    setActivating(false);
  }

  async function cancelCampaign() {
    if (!experiment) return;
    const confirmed = confirm("This will delete the campaign and all ad sets/ads on Meta. Continue?");
    if (!confirmed) return;

    setCancelling(true);
    try {
      await fetch("/api/admin/adlab/ads/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId: experiment.id }),
      });
      setLaunchResult(null);
      setLaunchError(null);
      await loadExperiment();
    } catch {
      setLaunchError("Cancel failed");
    }
    setCancelling(false);
  }

  async function uploadReferenceImages(files: FileList) {
    if (!experiment || files.length === 0) return;
    setUploadingRefs(true);
    const formData = new FormData();
    formData.append("experimentId", experiment.id);
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    await fetch("/api/admin/adlab/reference-images", {
      method: "POST",
      body: formData,
    });
    await loadExperiment();
    setUploadingRefs(false);
  }

  async function updateRefCaption(imageId: string, caption: string) {
    await fetch(`/api/admin/adlab/reference-images/${imageId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption }),
    });
  }

  async function deleteRefImage(imageId: string) {
    await fetch(`/api/admin/adlab/reference-images/${imageId}`, {
      method: "DELETE",
    });
    await loadExperiment();
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

  async function generateAllCreatives() {
    if (!experiment) return;

    const anglesNeedingCreatives = experiment.angles.filter(
      (a) => a.advanced && a.creatives.length === 0
    );

    if (anglesNeedingCreatives.length === 0) {
      alert("All advanced angles already have creatives.");
      return;
    }

    setGenerateAllRunning(true);
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < anglesNeedingCreatives.length; i++) {
      const angle = anglesNeedingCreatives[i];
      setGenerateAllProgress(
        `Generating creatives for angle ${i + 1} of ${anglesNeedingCreatives.length}...`
      );

      try {
        setGeneratingFor((prev) => new Set(prev).add(angle.id));
        const res = await fetch("/api/admin/adlab/creatives/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ angleId: angle.id, useReferenceImages: useRefImages }),
        });
        if (res.ok) {
          succeeded++;
        } else {
          failed++;
          console.error(`[adlab] Generate All: angle ${angle.id} returned ${res.status}`);
        }
      } catch (err) {
        failed++;
        console.error(`[adlab] Generate All: angle ${angle.id} failed:`, err);
      } finally {
        setGeneratingFor((prev) => {
          const next = new Set(prev);
          next.delete(angle.id);
          return next;
        });
      }

      // Refresh to show newly created creatives in real-time
      await loadExperiment();

      // 5-second pause between angles to avoid OpenAI rate limits (skip after last)
      if (i < anglesNeedingCreatives.length - 1) {
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }

    setGenerateAllProgress(
      `Generated creatives for ${succeeded} of ${anglesNeedingCreatives.length} angle${anglesNeedingCreatives.length === 1 ? "" : "s"}.${failed > 0 ? ` ${failed} failed.` : ""}`
    );
    setGenerateAllRunning(false);

    // Clear summary after 10 seconds
    setTimeout(() => setGenerateAllProgress(null), 10_000);
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
  const anglesWithoutCreatives = experiment.angles.filter((a) => a.advanced && a.creatives.length === 0).length;

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

      {/* Reference Images — collapsible */}
      <div className="mb-6 rounded-xl border border-white/10 bg-[#13131F] overflow-hidden">
        <button
          onClick={() => setRefImagesOpen(!refImagesOpen)}
          className="flex items-center justify-between w-full px-5 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-[#A0A0B8]" />
            <span className="text-sm font-medium text-white">
              Reference Images
              {(experiment.referenceImages ?? []).length > 0 && (
                <span className="ml-1.5 text-[#A0A0B8]">({(experiment.referenceImages ?? []).length})</span>
              )}
            </span>
          </div>
          <ChevronDown className={`h-4 w-4 text-[#A0A0B8] transition-transform ${refImagesOpen ? "rotate-180" : ""}`} />
        </button>

        {refImagesOpen && (
          <div className="px-5 pb-5 border-t border-white/5 pt-4">
            {/* Upload area */}
            <label className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-white/10 hover:border-[#7C5CFC]/30 bg-white/[0.02] px-6 py-5 cursor-pointer transition mb-4">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && uploadReferenceImages(e.target.files)}
                disabled={uploadingRefs}
              />
              {uploadingRefs ? (
                <Loader2 className="h-5 w-5 text-[#A0A0B8] animate-spin" />
              ) : (
                <Upload className="h-5 w-5 text-[#A0A0B8]" />
              )}
              <span className="text-xs text-[#A0A0B8]">
                {uploadingRefs ? "Uploading..." : "Click to upload competitor ads, inspiration images"}
              </span>
            </label>

            {/* Gallery */}
            {(experiment.referenceImages ?? []).length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {(experiment.referenceImages ?? []).map((img) => (
                  <div key={img.id} className="shrink-0 w-36">
                    <div
                      className="relative aspect-square rounded-lg overflow-hidden bg-black/20 cursor-pointer group"
                      onClick={() => setLightboxUrl(img.imageUrl)}
                    >
                      <img src={img.imageUrl} alt={img.caption || "Reference"} className="w-full h-full object-cover" />
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteRefImage(img.id); }}
                        className="absolute top-1 right-1 rounded-full bg-black/60 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XIcon className="h-3 w-3 text-white" />
                      </button>
                    </div>
                    <input
                      type="text"
                      defaultValue={img.caption || ""}
                      placeholder="Caption..."
                      onBlur={(e) => updateRefCaption(img.id, e.target.value)}
                      className="mt-1.5 w-full rounded border border-white/10 bg-transparent px-2 py-1 text-[10px] text-[#A0A0B8] outline-none focus:border-[#7C5CFC] placeholder-[#A0A0B8]/40"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Toggle: use reference images as creative direction */}
            <label className="mt-3 flex items-center gap-2 cursor-pointer">
              <div
                className={`relative h-4 w-7 rounded-full transition-colors ${useRefImages ? "bg-[#7C5CFC]" : "bg-white/10"}`}
                onClick={() => setUseRefImages(!useRefImages)}
              >
                <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${useRefImages ? "translate-x-3" : "translate-x-0.5"}`} />
              </div>
              <span className={`text-[10px] ${useRefImages ? "text-[#7C5CFC]" : "text-[#A0A0B8]/60"}`}>Use as creative direction</span>
              <div className="group relative">
                <Info className="h-3 w-3 text-[#A0A0B8]/40" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block rounded bg-[#1E1E2E] border border-white/10 px-2 py-1 text-[9px] text-[#A0A0B8] whitespace-nowrap z-10">
                  When enabled, the first reference image is passed to gpt-image-2 as stylistic direction
                </div>
              </div>
            </label>
          </div>
        )}
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

        {/* Generate All Creatives */}
        {allAnglesAdvanced && anglesWithoutCreatives > 0 && (
          <div className="relative group">
            <button
              onClick={generateAllCreatives}
              disabled={generateAllRunning}
              className="inline-flex items-center gap-2 rounded-lg bg-[#7C5CFC] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] disabled:opacity-50"
            >
              {generateAllRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generateAllRunning
                ? generateAllProgress
                : `Generate All Creatives (${anglesWithoutCreatives})`}
            </button>
            {!generateAllRunning && (
              <div className="absolute top-full left-0 mt-1 hidden group-hover:block rounded bg-[#1E1E2E] border border-white/10 px-3 py-2 text-[10px] text-[#A0A0B8] whitespace-nowrap z-10">
                Sequentially generates 3 image creatives per angle. Takes ~30-60 seconds per angle.
              </div>
            )}
          </div>
        )}

        {/* Generate All progress summary (shown after completion) */}
        {!generateAllRunning && generateAllProgress && anglesWithoutCreatives === 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {generateAllProgress}
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

        {/* Launch Campaign button */}
        {launchReadyCount > 0 && experiment.status === "awaiting_approval" && !launchResult && (
          <button
            onClick={launchCampaign}
            disabled={launching}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Launch Campaign ({launchReadyCount} creative{launchReadyCount === 1 ? "" : "s"})
          </button>
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

      {/* Launch error */}
      {launchError && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {launchError}
        </div>
      )}

      {/* Launch confirmation panel — shown after campaign created in PAUSED state */}
      {launchResult && (
        <div className="mb-6 rounded-xl border border-emerald-500/30 bg-[#13131F] p-6">
          <h3 className="text-base font-semibold text-white mb-1">Campaign Ready (PAUSED)</h3>
          <p className="text-xs text-[#A0A0B8] mb-4">
            Campaign <span className="font-mono text-white">{launchResult.campaignName}</span> created with {launchResult.created.length} ad{launchResult.created.length === 1 ? "" : "s"}.
            {launchResult.errors.length > 0 && (
              <span className="text-amber-400"> {launchResult.errors.length} failed — see below.</span>
            )}
          </p>

          {launchResult.errors.length > 0 && (
            <div className="mb-4 space-y-1">
              {launchResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-400">
                  Creative {e.creativeId.slice(0, 8)}: {e.error}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={activateCampaign}
              disabled={activating || cancelling}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Launch Live
            </button>
            <button
              onClick={cancelCampaign}
              disabled={activating || cancelling}
              className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-5 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Cancel & Delete
            </button>
          </div>
        </div>
      )}

      {/* Live experiment indicator */}
      {experiment.status === "live" && (
        <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-medium text-emerald-400">Campaign is live</span>
          </div>
        </div>
      )}

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
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-medium text-[#A0A0B8] uppercase tracking-wider">Image Creatives</p>
                        <button
                          onClick={async () => {
                            const withImages = imageCreatives.filter((c) => c.imageUrl);
                            for (let idx = 0; idx < withImages.length; idx++) {
                              const c = withImages[idx];
                              await downloadImage(c.imageUrl!, makeFilename(experiment.topicBrief, angle.valueSurface, angle.hypothesis, idx));
                              await new Promise((r) => setTimeout(r, 300));
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-[#A0A0B8] hover:text-white bg-white/5 hover:bg-white/10 transition"
                        >
                          <Download className="h-3 w-3" />
                          Download All ({imageCreatives.filter((c) => c.imageUrl).length})
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {imageCreatives.map((creative, idx) => (
                          <CreativeCard key={creative.id} creative={creative} onToggleApprove={() => toggleApprove(creative.id, creative.approved)} topicBrief={experiment.topicBrief} angleSurface={angle.valueSurface} angleHypothesis={angle.hypothesis} creativeIndex={idx} />
                        ))}
                      </div>
                    </div>
                  )}
                  {videoCreatives.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-[#A0A0B8] uppercase tracking-wider mb-2">Video Creatives</p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {videoCreatives.map((creative, idx) => (
                          <CreativeCard key={creative.id} creative={creative} onToggleApprove={() => toggleApprove(creative.id, creative.approved)} topicBrief={experiment.topicBrief} angleSurface={angle.valueSurface} angleHypothesis={angle.hypothesis} creativeIndex={idx} />
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

      {/* Lightbox modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition"
          >
            <XIcon className="h-5 w-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Reference"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
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
  topicBrief,
  angleSurface,
  angleHypothesis,
  creativeIndex,
}: {
  creative: Creative;
  onToggleApprove: () => void;
  topicBrief: string;
  angleSurface: string;
  angleHypothesis: string;
  creativeIndex: number;
}) {
  return (
    <div
      className={`rounded-lg border bg-[#1E1E2E] overflow-hidden transition ${COMPLIANCE_COLORS[creative.complianceStatus] || "border-white/10"}`}
    >
      {creative.creativeType === "image" && creative.imageUrl && (
        <div className="relative aspect-square bg-black/20 group">
          <img
            src={creative.imageUrl}
            alt={creative.headline}
            className="w-full h-full object-cover"
          />
          <button
            onClick={() => downloadImage(creative.imageUrl!, makeFilename(topicBrief, angleSurface, angleHypothesis, creativeIndex))}
            className="absolute bottom-2 right-2 rounded-lg bg-black/70 p-1.5 text-white/70 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-black/90 transition"
            title="Download image"
          >
            <Download className="h-4 w-4" />
          </button>
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
