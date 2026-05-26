"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, ChevronDown, ChevronUp, Sparkles, RefreshCw, Shield, Copy, Trash2, Rocket, XCircle, Upload, ImageIcon, X as XIcon, Info, Download, ExternalLink, Link as LinkIcon, PlusCircle, TrendingUp, DollarSign, AlertTriangle, ClipboardCheck, Video, Play } from "lucide-react";

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
  videoPresenterTag: string | null;
  generationPrompt: string | null;
  complianceStatus: string;
  complianceNotes: string | null;
  approved: boolean;
  batchNumber: number;
  createdAt: string;
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
  videoScriptText: string | null;
  videoHookLine: string | null;
  videoUrl: string | null;
  videoAvatarId: string | null;
  videoStatus: string | null;
}

interface ReferenceImage {
  id: string;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
}

interface LandingPage {
  id: string;
  slug: string;
  heroHeadline: string;
}

interface Experiment {
  id: string;
  topicBrief: string;
  status: string;
  createdAt: string;
  metaCampaignId: string | null;
  conclusionSummary: string | null;
  campaignType?: string;
  destination?: string;
  project: { name: string; slug: string; landingPageUrl?: string };
  landingPage?: LandingPage | null;
  referenceImages?: ReferenceImage[];
  angles: Angle[];
}

interface ValidationCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn";
  message: string;
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
  pass: "border-emerald-500/30",
  passed: "border-emerald-500/30", // legacy compat
  warning: "border-amber-500/50",
  flagged: "border-amber-500/50", // legacy compat
  fail: "border-red-500/50",
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
  const [launchResult, setLaunchResult] = useState<{ campaignId: string; campaignName: string; adsetId?: string; created: { creativeId: string }[]; errors: { creativeId: string; error: string }[]; status?: string } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [activating, setActivating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [refImagesOpen, setRefImagesOpen] = useState(false);
  const [uploadingRefs, setUploadingRefs] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [generateAllRunning, setGenerateAllRunning] = useState(false);
  const [generateAllProgress, setGenerateAllProgress] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [generatingLandingPage, setGeneratingLandingPage] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [generatingMore, setGeneratingMore] = useState(false);
  const [generateMoreProgress, setGenerateMoreProgress] = useState<string | null>(null);
  const [scalingMode, setScalingMode] = useState<string>("more_of_type");
  const [preferredType, setPreferredType] = useState<string>("mechanism");
  const [addingToCampaign, setAddingToCampaign] = useState(false);
  const [addToCampaignResult, setAddToCampaignResult] = useState<{ added: number; totalAds: number; previousAds: number; errors: { creativeId: string; error: string }[] } | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationChecks, setValidationChecks] = useState<ValidationCheck[] | null>(null);
  const [validationPassed, setValidationPassed] = useState(false);
  const [validationSkipped, setValidationSkipped] = useState(false);
  const [showPostLaunchReminder, setShowPostLaunchReminder] = useState(false);

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

  async function runCompliance(skip = false) {
    if (!experiment) return;
    setComplianceRunning(true);
    setComplianceMessage(null);
    const res = await fetch("/api/admin/adlab/creatives/compliance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentId: experiment.id, skip }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.skipped) {
        setComplianceMessage("Compliance skipped — all creatives marked as pass.");
      } else if (data.failCount > 0) {
        const parts = [];
        parts.push(`${data.failCount} failed (blocked from launch)`);
        if (data.warnCount > 0) parts.push(`${data.warnCount} warnings (will still launch)`);
        setComplianceMessage(parts.join(". ") + ".");
      } else if (data.warnCount > 0) {
        setComplianceMessage(`All creatives can launch. ${data.warnCount} warning${data.warnCount === 1 ? "" : "s"} flagged for review.`);
      } else {
        setComplianceMessage("All creatives passed compliance.");
      }
    }
    await loadExperiment();
    setComplianceRunning(false);
  }

  async function finalizeCreatives() {
    if (!experiment) return;

    const allCreatives = experiment.angles.flatMap((a) => a.creatives);
    const toDeleteCount = allCreatives.filter((c) => !c.approved || c.complianceStatus === "fail").length;

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
        // Even on error response, check if there's partial data
        if (data.errors && data.created) {
          setLaunchResult(data);
        }
        setLaunchError(data.error || "Launch failed");
      } else {
        setLaunchResult(data);
        if (data.status === "partial") {
          setLaunchError(`${data.errors.length} of ${data.created.length + data.errors.length} ads failed — see details below`);
        }
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
        setValidationChecks(null);
        setShowPostLaunchReminder(true);
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

  async function uploadReferenceImages(files: FileList | File[]) {
    if (!experiment || files.length === 0) return;
    setUploadingRefs(true);
    setUploadProgress(files.length > 1 ? `Uploading 0 of ${files.length} images...` : "Uploading...");

    let succeeded = 0;
    let failed = 0;
    const fileArray = Array.from(files);

    // Upload in parallel batches of 3 to balance speed vs. server load
    const batchSize = 3;
    for (let i = 0; i < fileArray.length; i += batchSize) {
      const batch = fileArray.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const formData = new FormData();
          formData.append("experimentId", experiment!.id);
          formData.append("files", file);
          const res = await fetch("/api/admin/adlab/reference-images", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) throw new Error(`Upload failed: ${file.name}`);
          return res.json();
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") succeeded++;
        else failed++;
      }
      setUploadProgress(`Uploading ${succeeded + failed} of ${fileArray.length} images...`);
    }

    if (failed > 0) {
      setUploadProgress(`Done: ${succeeded} uploaded, ${failed} failed`);
      setTimeout(() => setUploadProgress(null), 4000);
    } else {
      setUploadProgress(null);
    }

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

  async function deleteExperiment() {
    if (!experiment) return;
    const msg = experiment.angles.some((a) => a.creatives.some((c) => c.ads.length > 0))
      ? "Delete this experiment? This will remove all angles, creatives, and ads from the database. If a Meta campaign exists, it will be deleted from Meta first."
      : "Delete this experiment? This will remove all angles, creatives, and reference images from the database.";
    if (!confirm(msg)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/adlab/experiments/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/adlab/experiments");
      } else {
        const data = await res.json();
        alert(data.error || "Delete failed");
        setDeleting(false);
      }
    } catch {
      alert("Network error during delete");
      setDeleting(false);
    }
  }

  async function resetToDraft() {
    if (!experiment) return;
    const msg = experiment.metaCampaignId
      ? "Reset to draft? This will delete the Meta campaign and all ad records, but keep angles and creatives. You can re-launch afterwards."
      : "Reset to draft? This will clear ad records and reset the experiment status. Angles and creatives are preserved.";
    if (!confirm(msg)) return;

    setResetting(true);
    try {
      const res = await fetch(`/api/admin/adlab/experiments/${id}/reset`, {
        method: "POST",
      });
      if (res.ok) {
        setLaunchResult(null);
        setLaunchError(null);
        await loadExperiment();
      } else {
        const data = await res.json();
        alert(data.error || "Reset failed");
      }
    } catch {
      alert("Network error during reset");
    }
    setResetting(false);
  }

  async function generateLandingPageFn() {
    if (!experiment) return;
    setGeneratingLandingPage(true);
    try {
      const res = await fetch("/api/admin/adlab/landing-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId: experiment.id }),
      });
      if (res.ok) {
        await loadExperiment();
      } else {
        const data = await res.json();
        alert(data.error || "Landing page generation failed");
      }
    } catch {
      alert("Network error during landing page generation");
    }
    setGeneratingLandingPage(false);
  }

  async function runPreLaunchValidation() {
    if (!experiment) return;
    setValidating(true);
    setValidationChecks(null);
    setValidationPassed(false);
    setValidationSkipped(false);

    try {
      const res = await fetch("/api/admin/adlab/ads/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId: experiment.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setValidationChecks(data.checks);
        setValidationPassed(data.allPassed);
      } else {
        setLaunchError(data.error || "Validation failed");
      }
    } catch {
      setLaunchError("Network error during validation");
    }
    setValidating(false);
  }

  function skipValidation() {
    setValidationSkipped(true);
    setValidationPassed(true);
    console.warn("[adlab] Pre-launch validation SKIPPED by user");
  }

  function dismissValidation() {
    setValidationChecks(null);
    setValidationPassed(false);
    setValidationSkipped(false);
  }

  async function generateMoreCreatives() {
    if (!experiment) return;
    setGeneratingMore(true);
    setGenerateMoreProgress("Generating new creatives...");
    setAddToCampaignResult(null);

    try {
      const res = await fetch("/api/admin/adlab/creatives/generate-more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentId: experiment.id,
          scalingMode,
          preferredType: scalingMode === "more_of_type" ? preferredType : undefined,
          useReferenceImages: useRefImages,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setGenerateMoreProgress(
          `Generated ${data.created} new creatives (batch ${data.batchNumber}).${data.errors?.length > 0 ? ` ${data.errors.length} angle(s) failed.` : ""} Review and approve them below, then click "Add to Campaign".`
        );
      } else {
        setGenerateMoreProgress(`Error: ${data.error}`);
      }
    } catch {
      setGenerateMoreProgress("Network error during generation");
    }

    await loadExperiment();
    setGeneratingMore(false);
    setTimeout(() => setGenerateMoreProgress(null), 15_000);
  }

  async function addToCampaign() {
    if (!experiment) return;

    // Find new creatives that are approved but don't have ads yet
    const newApproved = experiment.angles.flatMap((a) =>
      a.creatives.filter((c) => c.approved && c.ads.length === 0)
    );

    if (newApproved.length === 0) {
      alert("No new approved creatives to add. Approve the new creatives first.");
      return;
    }

    setAddingToCampaign(true);
    setAddToCampaignResult(null);

    try {
      const res = await fetch("/api/admin/adlab/ads/add-to-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentId: experiment.id,
          creativeIds: newApproved.map((c) => c.id),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setAddToCampaignResult(data);
      } else {
        alert(data.error || "Failed to add to campaign");
      }
    } catch {
      alert("Network error");
    }

    await loadExperiment();
    setAddingToCampaign(false);
  }

  function copyLandingPageUrl(url: string) {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
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
  const hasUnapprovedCreatives = allCreatives.some((c) => !c.approved || c.complianceStatus === "fail");
  const approvedCount = allCreatives.filter((c) => c.approved).length;
  const launchReadyCount = allCreatives.filter((c) => c.approved && c.complianceStatus !== "fail").length;
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
          <div className="flex items-center gap-3 mb-2">
            <div>
              <p className="text-xs text-[#A0A0B8] mb-1">Topic Brief</p>
              <p className="text-sm text-white">{experiment.topicBrief}</p>
            </div>
          </div>
          {(experiment as Record<string, unknown>).campaignType === "app_install" && (
            <span className="inline-block mt-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              App Install Campaign
            </span>
          )}
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
            {/* Upload area with drag-and-drop */}
            <label
              className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed ${dragOver ? "border-[#7C5CFC] bg-[#7C5CFC]/5" : "border-white/10 hover:border-[#7C5CFC]/30 bg-white/[0.02]"} px-6 py-5 cursor-pointer transition mb-4`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length > 0) uploadReferenceImages(e.dataTransfer.files);
              }}
            >
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
                {uploadProgress || (uploadingRefs ? "Uploading..." : "Click or drag to upload competitor ads, inspiration images")}
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => runCompliance(false)}
              disabled={complianceRunning}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-[#A0A0B8] hover:text-white hover:border-white/20 transition disabled:opacity-50"
            >
              {complianceRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              Run Compliance Check
            </button>
            <button
              onClick={() => runCompliance(true)}
              disabled={complianceRunning}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-[#A0A0B8] hover:text-white hover:border-white/20 transition disabled:opacity-50"
              title="Skip compliance and mark all creatives as pass"
            >
              Skip Compliance
            </button>
          </div>
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

        {/* Launch Campaign button — now triggers validation first */}
        {launchReadyCount > 0 && experiment.status === "awaiting_approval" && !launchResult && (
          <button
            onClick={runPreLaunchValidation}
            disabled={validating || launching}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            {validating ? "Running checks..." : `Launch Campaign (${launchReadyCount} creative${launchReadyCount === 1 ? "" : "s"})`}
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

      {/* Pre-flight validation panel */}
      {validationChecks && !launchResult && (
        <div className="mb-6 rounded-xl border border-white/10 bg-[#13131F] p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-[#7C5CFC]" />
              <h3 className="text-base font-semibold text-white">Pre-Launch Checklist</h3>
              {validationSkipped && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                  validation skipped
                </span>
              )}
            </div>
            <button
              onClick={dismissValidation}
              className="text-xs text-[#A0A0B8] hover:text-white transition"
            >
              Dismiss
            </button>
          </div>

          <div className="space-y-2 mb-4">
            {/* Show fails first, then warns, then passes */}
            {[...validationChecks]
              .sort((a, b) => {
                const order = { fail: 0, warn: 1, pass: 2 };
                return order[a.status] - order[b.status];
              })
              .map((check) => (
                <div
                  key={check.id}
                  className={`flex items-start gap-3 rounded-lg px-4 py-2.5 ${
                    check.status === "fail"
                      ? "bg-red-500/5 border border-red-500/20"
                      : check.status === "warn"
                        ? "bg-amber-500/5 border border-amber-500/20"
                        : "bg-emerald-500/5 border border-emerald-500/10"
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {check.status === "fail" && <XCircle className="h-4 w-4 text-red-400" />}
                    {check.status === "warn" && <AlertTriangle className="h-4 w-4 text-amber-400" />}
                    {check.status === "pass" && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-xs font-medium ${
                      check.status === "fail" ? "text-red-400" : check.status === "warn" ? "text-amber-400" : "text-emerald-400"
                    }`}>
                      {check.label}
                    </p>
                    <p className="text-[11px] text-[#A0A0B8] mt-0.5">{check.message}</p>
                  </div>
                </div>
              ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            {(validationPassed || validationSkipped) ? (
              <button
                onClick={launchCampaign}
                disabled={launching}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {validationSkipped ? "Launch Anyway" : "Confirm Launch"}
              </button>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600/30 px-5 py-2.5 text-sm font-semibold text-white/40 cursor-not-allowed"
              >
                <Rocket className="h-4 w-4" />
                Confirm Launch
              </button>
            )}

            {!validationPassed && !validationSkipped && (
              <span className="text-xs text-red-400">
                Fix the issues above before launching
              </span>
            )}
          </div>

          {/* Skip validation link */}
          {!validationPassed && !validationSkipped && (
            <button
              onClick={skipValidation}
              className="mt-3 text-[10px] text-[#A0A0B8]/60 hover:text-[#A0A0B8] transition underline"
            >
              Skip validation (emergency only)
            </button>
          )}

          {/* Summary bar */}
          {!validationSkipped && (() => {
            const fails = validationChecks.filter((c) => c.status === "fail").length;
            const warns = validationChecks.filter((c) => c.status === "warn").length;
            const passes = validationChecks.filter((c) => c.status === "pass").length;
            if (fails === 0 && warns === 0) {
              return (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <p className="text-xs text-emerald-400 font-medium">All {passes} checks passed — ready to launch</p>
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}

      {/* Post-launch reminder */}
      {showPostLaunchReminder && experiment.status === "live" && (
        <div className="mb-6 rounded-xl border border-[#7C5CFC]/30 bg-[#7C5CFC]/5 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-[#7C5CFC] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-white mb-2">Campaign launched in PAUSED state. After activating:</p>
                <ul className="space-y-1.5 text-xs text-[#A0A0B8]">
                  <li className="flex items-start gap-2">
                    <span className="text-[#7C5CFC] mt-0.5">&#8226;</span>
                    <span>Don&#39;t edit the ad set for 7 days (resets learning phase)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#7C5CFC] mt-0.5">&#8226;</span>
                    <span>First performance check at 48 hours</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#7C5CFC] mt-0.5">&#8226;</span>
                    <span>Kill criteria: $15/creative with zero clicks, $30/creative with zero signups</span>
                  </li>
                </ul>
              </div>
            </div>
            <button
              onClick={() => setShowPostLaunchReminder(false)}
              className="shrink-0 rounded-full p-1 text-[#A0A0B8] hover:text-white hover:bg-white/10 transition"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Launch error */}
      {launchError && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {launchError}
        </div>
      )}

      {/* Launch confirmation panel — shown after campaign created */}
      {launchResult && (
        <div className={`mb-6 rounded-xl border ${launchResult.status === "partial" ? "border-amber-500/30" : "border-emerald-500/30"} bg-[#13131F] p-6`}>
          <h3 className="text-base font-semibold text-white mb-1">
            {launchResult.status === "partial"
              ? "Campaign Partially Launched (PAUSED)"
              : "Campaign Ready (PAUSED)"}
          </h3>

          {/* Success summary */}
          {launchResult.created.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <p className="text-xs text-emerald-400">
                {launchResult.created.length} of {launchResult.created.length + launchResult.errors.length} ads launched successfully
              </p>
            </div>
          )}

          {/* Failure summary */}
          {launchResult.errors.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-red-400" />
              <p className="text-xs text-red-400">
                {launchResult.errors.length} ad{launchResult.errors.length === 1 ? "" : "s"} failed to launch
              </p>
            </div>
          )}

          <p className="text-xs text-[#A0A0B8] mb-4">
            Campaign <span className="font-mono text-white">{launchResult.campaignName}</span>
            {launchResult.created.length > 0 && <> — 1 ad set, {launchResult.created.length} ad{launchResult.created.length === 1 ? "" : "s"}</>}
          </p>

          {launchResult.errors.length > 0 && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-1">
              <p className="text-xs font-medium text-red-400 mb-1">Failed creatives:</p>
              {launchResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-400/80">
                  {e.creativeId.slice(0, 8)}: {e.error}
                </p>
              ))}
            </div>
          )}

          {/* Landing page info */}
          <LandingPageSection
            experiment={experiment}
            generatingLandingPage={generatingLandingPage}
            onGenerate={generateLandingPageFn}
            onCopy={copyLandingPageUrl}
            copiedUrl={copiedUrl}
          />

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={activateCampaign}
              disabled={activating || cancelling || retrying}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Launch Live{launchResult.created.length > 0 ? ` (${launchResult.created.length} ads)` : ""}
            </button>
            {launchResult.errors.length > 0 && (
              <button
                onClick={async () => {
                  setRetrying(true);
                  try {
                    const res = await fetch("/api/admin/adlab/ads/launch", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ experimentId: experiment.id }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setLaunchResult(data);
                      if (data.errors?.length === 0) setLaunchError(null);
                    }
                  } catch {}
                  setRetrying(false);
                }}
                disabled={retrying || activating || cancelling}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-5 py-2.5 text-sm text-amber-400 hover:bg-amber-500/10 transition disabled:opacity-50"
              >
                {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Retry Failed ({launchResult.errors.length})
              </button>
            )}
            <button
              onClick={cancelCampaign}
              disabled={activating || cancelling || retrying}
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

      {/* Creative Count Tracking + Generate More + Add to Campaign — shown after campaign exists */}
      {experiment.metaCampaignId && (experiment.status === "live" || experiment.status === "awaiting_approval") && (() => {
        const allAds = experiment.angles.flatMap((a) => a.creatives.flatMap((c) => c.ads));
        const originalCreatives = experiment.angles.flatMap((a) => a.creatives.filter((c) => c.batchNumber === 0));
        const addedCreatives = experiment.angles.flatMap((a) => a.creatives.filter((c) => c.batchNumber > 0));
        const newUnapproved = experiment.angles.flatMap((a) => a.creatives.filter((c) => c.ads.length === 0));
        const newApproved = newUnapproved.filter((c) => c.approved);
        const totalLiveAds = allAds.length;
        const suggestedBudget = Math.round((totalLiveAds + newApproved.length) * 1.5 / 5) * 5;

        // Group added creatives by batch for timestamps
        const batches: Record<number, { count: number; earliest: string }> = {};
        for (const c of addedCreatives) {
          const bn = c.batchNumber;
          if (!batches[bn]) batches[bn] = { count: 0, earliest: c.createdAt };
          batches[bn].count++;
          if (c.createdAt < batches[bn].earliest) batches[bn].earliest = c.createdAt;
        }

        return (
          <div className="mb-6 space-y-4">
            {/* Creative count tracking */}
            <div className="rounded-xl border border-white/10 bg-[#13131F] p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-[#7C5CFC]" />
                <p className="text-xs font-medium text-[#A0A0B8] uppercase tracking-wider">Creative Tracking</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-2xl font-bold text-white">{originalCreatives.length}</p>
                  <p className="text-[10px] text-[#A0A0B8]">Original creatives</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{addedCreatives.length}</p>
                  <p className="text-[10px] text-[#A0A0B8]">Added creatives</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{totalLiveAds}</p>
                  <p className="text-[10px] text-[#A0A0B8]">Total live ads</p>
                </div>
              </div>
              {Object.keys(batches).length > 0 && (
                <div className="mt-3 border-t border-white/5 pt-3 space-y-1">
                  {Object.entries(batches)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([bn, info]) => (
                      <p key={bn} className="text-[10px] text-[#A0A0B8]">
                        Batch {bn}: {info.count} creative{info.count === 1 ? "" : "s"} added {new Date(info.earliest).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    ))}
                </div>
              )}
            </div>

            {/* Generate More Creatives */}
            <div className="rounded-xl border border-[#7C5CFC]/20 bg-[#13131F] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-[#7C5CFC]" />
                <p className="text-sm font-medium text-white">Generate More Creatives</p>
              </div>

              {/* Scaling mode dropdown */}
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <select
                  value={scalingMode}
                  onChange={(e) => setScalingMode(e.target.value)}
                  className="rounded-lg border border-white/10 bg-[#1E1E2E] px-3 py-2 text-sm text-white outline-none focus:border-[#7C5CFC]"
                >
                  <option value="more_of_type">More of what&apos;s working</option>
                  <option value="new_angles">Test new angles</option>
                  <option value="new_copy_lengths">New copy lengths</option>
                </select>

                {scalingMode === "more_of_type" && (
                  <select
                    value={preferredType}
                    onChange={(e) => setPreferredType(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[#1E1E2E] px-3 py-2 text-sm text-white outline-none focus:border-[#7C5CFC]"
                  >
                    <option value="mechanism">Mechanism</option>
                    <option value="pain_point">Pain-Point</option>
                    <option value="screenshot">Screenshot</option>
                  </select>
                )}

                <button
                  onClick={generateMoreCreatives}
                  disabled={generatingMore}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#7C5CFC] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] disabled:opacity-50"
                >
                  {generatingMore ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                  ) : (
                    <><PlusCircle className="h-4 w-4" /> Generate More Creatives</>
                  )}
                </button>
              </div>

              {/* Scaling mode descriptions */}
              <p className="text-[10px] text-[#A0A0B8]">
                {scalingMode === "more_of_type" && "Generates creatives similar in style/format to the selected type. Pick the creative type that's performing best."}
                {scalingMode === "new_angles" && "Generates creatives using different angles from the same topic brief that weren't used in the original batch."}
                {scalingMode === "new_copy_lengths" && "Generates the same visual formats but with different copy lengths (short, long, one-liner)."}
              </p>

              {generateMoreProgress && (
                <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${generateMoreProgress.startsWith("Error") ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                  {generateMoreProgress}
                </div>
              )}
            </div>

            {/* Add to Campaign + Budget Suggestion — show when there are new approved creatives without ads */}
            {newApproved.length > 0 && (
              <div className="rounded-xl border border-emerald-500/20 bg-[#13131F] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Rocket className="h-4 w-4 text-emerald-400" />
                  <p className="text-sm font-medium text-white">
                    {newApproved.length} new creative{newApproved.length === 1 ? "" : "s"} ready to add
                  </p>
                </div>

                <button
                  onClick={addToCampaign}
                  disabled={addingToCampaign}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {addingToCampaign ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Adding to campaign...</>
                  ) : (
                    <><PlusCircle className="h-4 w-4" /> Add to Campaign ({newApproved.length})</>
                  )}
                </button>

                {/* Budget suggestion */}
                {totalLiveAds > 0 && suggestedBudget > 10 && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                    <DollarSign className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-400">
                      You{"\u2019"}ll have {totalLiveAds + newApproved.length} ads in this ad set. Consider increasing budget from $10/day to ${suggestedBudget}/day so Meta has enough budget to test new creatives.
                    </p>
                  </div>
                )}

                {addToCampaignResult && (
                  <div className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                    <p className="text-xs text-emerald-400">
                      Added {addToCampaignResult.added} new ad{addToCampaignResult.added === 1 ? "" : "s"} to existing campaign. Total ads: {addToCampaignResult.totalAds}
                    </p>
                    {addToCampaignResult.errors.length > 0 && (
                      <p className="text-xs text-red-400 mt-1">
                        {addToCampaignResult.errors.length} failed: {addToCampaignResult.errors.map((e) => e.error).join("; ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Show count of unapproved new creatives if there are some */}
            {newUnapproved.length > 0 && newApproved.length < newUnapproved.length && (
              <p className="text-xs text-[#A0A0B8]">
                {newUnapproved.length - newApproved.length} new creative{newUnapproved.length - newApproved.length === 1 ? "" : "s"} still need approval before they can be added to the campaign.
              </p>
            )}
          </div>
        );
      })()}

      {/* Landing page section — shown for live/concluded experiments outside the launch panel */}
      {!launchResult && (experiment.status === "live" || experiment.status === "concluded" || experiment.status === "awaiting_approval") && (
        <div className="mb-6 rounded-xl border border-white/10 bg-[#13131F] p-5">
          <LandingPageSection
            experiment={experiment}
            generatingLandingPage={generatingLandingPage}
            onGenerate={generateLandingPageFn}
            onCopy={copyLandingPageUrl}
            copiedUrl={copiedUrl}
          />
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
              onReload={loadExperiment}
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

      {/* Danger zone — delete & reset */}
      <div className="mt-12 border-t border-white/5 pt-8">
        <p className="text-xs font-medium text-[#A0A0B8] uppercase tracking-wider mb-4">Danger Zone</p>
        <div className="flex items-center gap-3 flex-wrap">
          {experiment.status !== "draft" && (
            <button
              onClick={resetToDraft}
              disabled={resetting || deleting}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/10 transition disabled:opacity-50"
            >
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Reset to Draft
            </button>
          )}
          <button
            onClick={deleteExperiment}
            disabled={deleting || resetting}
            className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete Experiment
          </button>
        </div>
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
  onReload,
}: {
  angle: Angle;
  isSelected: boolean;
  onToggle: () => void;
  selectable: boolean;
  onGenerate: () => void;
  generating: boolean;
  onReload: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoProgress, setVideoProgress] = useState<string | null>(null);
  const [scriptDraft, setScriptDraft] = useState<{
    scriptText: string;
    hookLine: string;
    primaryAvatar: { id: string; voiceId: string; name: string; gender: string };
    secondaryAvatar?: { id: string; voiceId: string; name: string; gender: string } | null;
  } | null>(null);
  const [editedScript, setEditedScript] = useState("");
  const [editedHook, setEditedHook] = useState("");
  const [videoConfirming, setVideoConfirming] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  async function generateVideoScript() {
    setVideoGenerating(true);
    setVideoError(null);
    setVideoProgress("Generating script...");
    setScriptDraft(null);

    try {
      const res = await fetch("/api/admin/adlab/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angleId: angle.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setScriptDraft(data);
        setEditedScript(data.scriptText);
        setEditedHook(data.hookLine);
        setVideoProgress(null);
      } else {
        setVideoError(data.error || "Script generation failed");
        setVideoProgress(null);
      }
    } catch {
      setVideoError("Network error");
      setVideoProgress(null);
    }
    setVideoGenerating(false);
  }

  async function confirmAndGenerate() {
    if (!scriptDraft) return;
    setVideoConfirming(true);
    setVideoError(null);
    const avatarCount = scriptDraft.secondaryAvatar?.id ? 2 : 1;
    setVideoProgress(`Sending to HeyGen (${avatarCount} avatar${avatarCount > 1 ? "s" : ""})...`);

    try {
      const res = await fetch("/api/admin/adlab/video/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          angleId: angle.id,
          scriptText: editedScript,
          hookLine: editedHook,
          primaryAvatar: scriptDraft.primaryAvatar,
          secondaryAvatar: scriptDraft.secondaryAvatar || null,
        }),
      });

      setVideoProgress(`Processing ${avatarCount} video${avatarCount > 1 ? "s" : ""} (1-3 min each)...`);
      const data = await res.json();

      if (res.ok) {
        const msg = data.totalGenerated > 1
          ? `${data.totalGenerated} videos complete!`
          : "Video complete!";
        setVideoProgress(data.totalFailed > 0 ? `${msg} (${data.totalFailed} failed)` : msg);
        setScriptDraft(null);
        onReload();
        setTimeout(() => setVideoProgress(null), 3000);
      } else {
        setVideoError(data.error || "Video generation failed");
        setVideoProgress(null);
      }
    } catch {
      setVideoError("Network error");
      setVideoProgress(null);
    }
    setVideoConfirming(false);
  }

  const [refetching, setRefetching] = useState<string | null>(null);

  async function refetchVideo(creativeId: string) {
    setRefetching(creativeId);
    setVideoError(null);
    try {
      const res = await fetch("/api/admin/adlab/video/refetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creativeId }),
      });
      const data = await res.json();
      if (res.ok) {
        onReload();
      } else {
        setVideoError(`Re-fetch failed: ${data.error}`);
      }
    } catch {
      setVideoError("Re-fetch failed: network error");
    }
    setRefetching(null);
  }

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
            {angle.videoStatus === "complete" && (
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-400">
                video ready
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

          {/* ─── Video Section ─── */}
          {angle.advanced && angle.creatives.length > 0 && (
            <div className="mt-4 border-t border-white/5 pt-4">
              {/* Completed video preview — show all video creatives side by side */}
              {angle.videoStatus === "complete" && (() => {
                const videoCreatives = angle.creatives.filter((c) => c.creativeType === "video" && c.videoUrl);
                // Fall back to angle-level video if no video creatives exist (backward compat)
                const hasVideoCreatives = videoCreatives.length > 0;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Video className="h-3.5 w-3.5 text-sky-400" />
                      <span className="text-[10px] font-medium text-sky-400 uppercase tracking-wider">
                        AI Video{hasVideoCreatives && videoCreatives.length > 1 ? `s (${videoCreatives.length})` : ""}
                      </span>
                    </div>
                    <div className="flex gap-4 flex-wrap">
                      {hasVideoCreatives ? videoCreatives.map((vc) => (
                        <div key={vc.id} className="space-y-1.5" style={{ maxWidth: "180px" }}>
                          <div className="relative rounded-lg overflow-hidden bg-black/30">
                            <video src={vc.videoUrl!} controls className="w-full rounded-lg" style={{ aspectRatio: "9/16", maxHeight: "320px" }} />
                          </div>
                          {vc.videoPresenterTag && (
                            <p className="text-[10px] font-medium text-white text-center">{vc.videoPresenterTag}</p>
                          )}
                          {vc.ads?.[0]?.metrics?.length > 0 && (() => {
                            const m = vc.ads[0].metrics;
                            const totalSpend = m.reduce((s: number, x: { spendCents: number }) => s + x.spendCents, 0);
                            const totalClicks = m.reduce((s: number, x: { clicks: number }) => s + x.clicks, 0);
                            const totalConv = m.reduce((s: number, x: { conversions: number }) => s + x.conversions, 0);
                            return (
                              <div className="text-[9px] text-[#A0A0B8] text-center space-x-2">
                                <span>${(totalSpend / 100).toFixed(0)} spent</span>
                                <span>{totalClicks} clicks</span>
                                <span>{totalConv} conv</span>
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-1">
                            <a href={vc.videoUrl!} download={`${vc.videoPresenterTag || "video"}.mp4`}
                              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-[#A0A0B8] hover:text-white bg-white/5 hover:bg-white/10 transition flex-1 justify-center">
                              <Download className="h-3 w-3" /> Download
                            </a>
                            <button onClick={() => refetchVideo(vc.id)} disabled={refetching === vc.id}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-[#A0A0B8] hover:text-white bg-white/5 hover:bg-white/10 transition"
                              title="Re-download from HeyGen">
                              {refetching === vc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            </button>
                          </div>
                        </div>
                      )) : angle.videoUrl && (
                        <div className="space-y-1.5" style={{ maxWidth: "200px" }}>
                          <div className="relative rounded-lg overflow-hidden bg-black/30">
                            <video src={angle.videoUrl} controls className="w-full rounded-lg" style={{ aspectRatio: "9/16", maxHeight: "360px" }} />
                          </div>
                          <a href={angle.videoUrl} download={`${angle.valueSurface}_video.mp4`}
                            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-[#A0A0B8] hover:text-white bg-white/5 hover:bg-white/10 transition">
                            <Download className="h-3 w-3" /> Download
                          </a>
                        </div>
                      )}
                    </div>
                    {angle.videoScriptText && (
                      <p className="text-[10px] text-[#A0A0B8] italic leading-relaxed">
                        &ldquo;{angle.videoScriptText}&rdquo;
                      </p>
                    )}
                    <button
                      onClick={generateVideoScript}
                      disabled={videoGenerating || videoConfirming}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-[#A0A0B8] hover:text-white bg-white/5 hover:bg-white/10 transition"
                    >
                      <RefreshCw className="h-3 w-3" /> Regenerate
                    </button>
                  </div>
                );
              })()}

              {/* Script review/edit (draft stage) */}
              {scriptDraft && !videoConfirming && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Video className="h-3.5 w-3.5 text-[#7C5CFC]" />
                    <span className="text-[10px] font-medium text-[#7C5CFC] uppercase tracking-wider">Video Script — Review & Edit</span>
                    <span className="text-[10px] text-[#A0A0B8]">
                      Avatars: {scriptDraft.primaryAvatar.name}
                      {scriptDraft.secondaryAvatar?.id ? ` + ${scriptDraft.secondaryAvatar.name}` : ""}
                    </span>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#A0A0B8] mb-1 block">Hook line (becomes Meta ad headline)</label>
                    <input
                      type="text"
                      value={editedHook}
                      onChange={(e) => setEditedHook(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#1E1E2E] px-3 py-2 text-xs text-white outline-none focus:border-[#7C5CFC]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#A0A0B8] mb-1 block">Full script ({editedScript.split(/\s+/).length} words)</label>
                    <textarea
                      value={editedScript}
                      onChange={(e) => setEditedScript(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-white/10 bg-[#1E1E2E] px-3 py-2 text-xs text-white outline-none focus:border-[#7C5CFC] resize-y"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={confirmAndGenerate}
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-500"
                    >
                      <Play className="h-3.5 w-3.5" /> Confirm & Generate Video
                    </button>
                    <button
                      onClick={() => setScriptDraft(null)}
                      className="text-xs text-[#A0A0B8] hover:text-white transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Progress / confirming state */}
              {(videoProgress || videoConfirming) && (
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 className="h-3.5 w-3.5 text-sky-400 animate-spin" />
                  <span className="text-xs text-sky-400">{videoProgress || "Processing..."}</span>
                </div>
              )}

              {/* Error */}
              {videoError && (
                <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                  {videoError}
                </div>
              )}

              {/* Generate Video button — show when no video and no draft */}
              {angle.videoStatus !== "complete" && !scriptDraft && !videoGenerating && !videoConfirming && (
                <button
                  onClick={generateVideoScript}
                  disabled={videoGenerating}
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-400 hover:bg-sky-500/10 transition disabled:opacity-50"
                >
                  <Video className="h-3.5 w-3.5" />
                  {angle.videoStatus === "failed" ? "Retry Video" : "Generate Video"}
                </button>
              )}
            </div>
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
          <div className="flex items-center gap-1.5 flex-wrap">
            {creative.batchNumber > 0 && (
              <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-[#7C5CFC]/10 text-[#7C5CFC] border border-[#7C5CFC]/20">
                batch {creative.batchNumber}
              </span>
            )}
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
              creative.complianceStatus === "pass" || creative.complianceStatus === "passed"
                ? "bg-emerald-500/15 text-emerald-400"
                : creative.complianceStatus === "warning" || creative.complianceStatus === "flagged"
                  ? "bg-amber-500/15 text-amber-400"
                  : creative.complianceStatus === "fail"
                    ? "bg-red-500/15 text-red-400"
                    : "bg-zinc-500/15 text-zinc-400"
            }`}>
              {creative.complianceStatus === "passed" ? "pass" : creative.complianceStatus === "flagged" ? "warning" : creative.complianceStatus}
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

        {creative.complianceStatus === "warning" && creative.complianceNotes && (
          <p className="text-[10px] text-amber-400 leading-relaxed mt-1">
            {creative.complianceNotes}
          </p>
        )}
        {creative.complianceStatus === "flagged" && creative.complianceNotes && (
          <p className="text-[10px] text-amber-400 leading-relaxed mt-1">
            {creative.complianceNotes}
          </p>
        )}
        {creative.complianceStatus === "fail" && creative.complianceNotes && (
          <p className="text-[10px] text-red-400 leading-relaxed mt-1">
            Blocked: {creative.complianceNotes}
          </p>
        )}
      </div>
    </div>
  );
}

function LandingPageSection({
  experiment,
  generatingLandingPage,
  onGenerate,
  onCopy,
  copiedUrl,
}: {
  experiment: Experiment;
  generatingLandingPage: boolean;
  onGenerate: () => void;
  onCopy: (url: string) => void;
  copiedUrl: boolean;
}) {
  const isAppInstall = experiment.campaignType === "app_install";
  if (isAppInstall) return null;

  const isDirectFunnel = experiment.destination !== "landing_page";

  // Direct to Funnel — show confirmation card with full UTM URL
  if (isDirectFunnel) {
    const funnelUrl = `https://getacuity.io/start?utm_source=meta&utm_medium=paid&utm_campaign=${encodeURIComponent(experiment.topicBrief || experiment.id)}&utm_content=${experiment.id}`;

    return (
      <div className="mb-4">
        <p className="text-xs font-medium text-[#A0A0B8] uppercase tracking-wider mb-2">Destination</p>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
          <p className="text-sm text-emerald-400 font-medium">Destination: getacuity.io/start</p>
          <p className="text-xs text-[#A0A0B8]">
            Ad clicks go directly to the onboarding funnel with UTM tracking.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <LinkIcon className="h-3.5 w-3.5 text-[#7C5CFC] shrink-0" />
            <span className="text-xs text-[#A0A0B8] font-mono break-all">{funnelUrl}</span>
            <button
              onClick={() => onCopy(funnelUrl)}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-[#A0A0B8] hover:text-white bg-white/5 hover:bg-white/10 transition shrink-0"
            >
              <Copy className="h-3 w-3" />
              {copiedUrl ? "Copied!" : "Copy URL"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Landing Page destination — show generate button or existing page
  const landingPage = experiment.landingPage;
  const projectUrl = experiment.project.landingPageUrl;
  const landingPageUrl = landingPage
    ? `https://getacuity.io/for/${landingPage.slug}`
    : null;

  const destinationUrl = landingPageUrl
    ? `${landingPageUrl}?utm_source=meta&utm_medium=paid&utm_campaign=${experiment.id}`
    : projectUrl
      ? `${projectUrl}?utm_source=meta&utm_medium=paid&utm_campaign=${experiment.id}`
      : null;

  return (
    <div className="mb-4">
      <p className="text-xs font-medium text-[#A0A0B8] uppercase tracking-wider mb-2">Landing Page</p>

      {landingPage ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <LinkIcon className="h-3.5 w-3.5 text-[#7C5CFC] shrink-0" />
            <a
              href={landingPageUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#7C5CFC] hover:text-[#9B7FFF] font-mono transition truncate"
            >
              {landingPageUrl}
            </a>
            <button
              onClick={() => onCopy(landingPageUrl!)}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-[#A0A0B8] hover:text-white bg-white/5 hover:bg-white/10 transition"
            >
              <Copy className="h-3 w-3" />
              {copiedUrl ? "Copied!" : "Copy URL"}
            </button>
            <a
              href={landingPageUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-[#A0A0B8] hover:text-white bg-white/5 hover:bg-white/10 transition"
            >
              <ExternalLink className="h-3 w-3" />
              Open Preview
            </a>
          </div>

          {destinationUrl && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#A0A0B8]">Ad destination:</span>
              <span className="text-[10px] text-[#A0A0B8] font-mono truncate max-w-md" title={destinationUrl}>
                {destinationUrl}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={onGenerate}
            disabled={generatingLandingPage}
            className="inline-flex items-center gap-2 rounded-lg border border-[#7C5CFC]/30 bg-[#7C5CFC]/10 px-4 py-2 text-sm text-[#7C5CFC] hover:bg-[#7C5CFC]/20 transition disabled:opacity-50"
          >
            {generatingLandingPage ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Generate Landing Page</>
            )}
          </button>
          {projectUrl && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#A0A0B8]">Fallback destination:</span>
              <span className="text-[10px] text-[#A0A0B8] font-mono truncate max-w-md">{projectUrl}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
