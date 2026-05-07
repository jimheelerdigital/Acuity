"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

interface Angle {
  id: string;
  hypothesis: string;
  targetPersona: string;
  valueSurface: string;
  researchNotes: string;
  score: number;
  advanced: boolean;
}

interface Experiment {
  id: string;
  topicBrief: string;
  status: string;
  createdAt: string;
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

export default function ExperimentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    loadExperiment();
  }, [id]);

  async function loadExperiment() {
    const res = await fetch(`/api/admin/adlab/experiments/${id}`);
    if (res.ok) {
      const data = await res.json();
      setExperiment(data);
      // Pre-select already advanced angles
      setSelected(new Set(data.angles.filter((a: Angle) => a.advanced).map((a: Angle) => a.id)));
    }
    setLoading(false);
  }

  function toggleAngle(angleId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(angleId)) next.delete(angleId);
      else next.add(angleId);
      return next;
    });
  }

  async function advanceSelected() {
    if (selected.size === 0) return;
    setAdvancing(true);

    await fetch("/api/admin/adlab/angles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ angleIds: [...selected], advanced: true }),
    });

    await loadExperiment();
    setAdvancing(false);
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
  const hasAdvanced = experiment.angles.some((a) => a.advanced);

  return (
    <>
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

      {/* Angles */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">
          Angle Hypotheses ({experiment.angles.length})
        </h2>
        {experiment.status === "awaiting_approval" && (
          <button
            onClick={advanceSelected}
            disabled={selected.size === 0 || advancing}
            className="inline-flex items-center gap-2 rounded-lg bg-[#7C5CFC] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] disabled:opacity-50"
          >
            {advancing && <Loader2 className="h-4 w-4 animate-spin" />}
            Advance Selected ({selected.size})
          </button>
        )}
      </div>

      <div className="space-y-3">
        {sortedAngles.map((angle) => (
          <AngleCard
            key={angle.id}
            angle={angle}
            isSelected={selected.has(angle.id)}
            onToggle={() => toggleAngle(angle.id)}
            selectable={experiment.status === "awaiting_approval"}
          />
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
}: {
  angle: Angle;
  isSelected: boolean;
  onToggle: () => void;
  selectable: boolean;
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
          <div className="flex items-center gap-2 mb-2">
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

          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-2 text-xs text-[#A0A0B8] hover:text-white transition-colors"
          >
            Research notes
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

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
