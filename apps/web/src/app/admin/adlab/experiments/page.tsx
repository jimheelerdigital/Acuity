"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, Trash2 } from "lucide-react";

interface Experiment {
  id: string;
  topicBrief: string;
  status: string;
  createdAt: string;
  metaCampaignId: string | null;
  project: { name: string; slug: string };
  _count: { angles: number };
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-500/20 text-zinc-400",
  awaiting_approval: "bg-acuity-warn-soft text-acuity-warn",
  live: "bg-acuity-good-soft text-acuity-good",
  concluded: "bg-acuity-primary-soft text-acuity-primary",
};

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadExperiments() {
    fetch("/api/admin/adlab/experiments")
      .then((r) => r.json())
      .then(setExperiments)
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadExperiments(); }, []);

  async function deleteExperiment(exp: Experiment) {
    const msg = exp.metaCampaignId
      ? "Delete this experiment? This will remove all angles, creatives, and ads from the database. The Meta campaign will be deleted from Meta first."
      : "Delete this experiment? This will remove all angles, creatives, and ads from the database.";
    if (!confirm(msg)) return;

    setDeletingId(exp.id);
    try {
      const res = await fetch(`/api/admin/adlab/experiments/${exp.id}`, { method: "DELETE" });
      if (res.ok) {
        setExperiments((prev) => prev.filter((e) => e.id !== exp.id));
      } else {
        const data = await res.json();
        alert(data.error || "Delete failed");
      }
    } catch {
      alert("Network error during delete");
    }
    setDeletingId(null);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Experiments</h1>
          <p className="text-sm text-acuity-text-ter">
            Create topic briefs, review angle hypotheses, and manage ad experiments.
          </p>
        </div>
        <Link
          href="/admin/adlab/experiments/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-acuity-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Experiment
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 text-acuity-text-ter animate-spin" />
        </div>
      ) : experiments.length === 0 ? (
        <div className="rounded-acuity-lg border border-dashed border-acuity-line-strong bg-acuity-card-bg p-12 text-center">
          <p className="text-sm text-acuity-text-ter">No experiments yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <div key={exp.id} className="relative group">
              <Link
                href={`/admin/adlab/experiments/${exp.id}`}
                className="block rounded-acuity-lg border border-acuity-line bg-acuity-card-bg p-5 transition hover:border-acuity-primary"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-acuity-text-ter">{exp.project.name}</span>
                      <span className={`rounded-acuity-pill px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[exp.status] || ""}`}>
                        {exp.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-sm text-white line-clamp-2">{exp.topicBrief}</p>
                  </div>
                  <div className="text-right shrink-0 pr-8">
                    <p className="text-xs text-acuity-text-ter">{exp._count.angles} angles</p>
                    <p className="text-xs text-acuity-text-ter mt-0.5">
                      {new Date(exp.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </Link>
              <button
                onClick={() => deleteExperiment(exp)}
                disabled={deletingId === exp.id}
                className="absolute top-5 right-5 rounded-lg p-1.5 text-acuity-text-ter opacity-0 group-hover:opacity-100 hover:text-acuity-bad hover:bg-acuity-bad-soft transition disabled:opacity-50"
                title="Delete experiment"
              >
                {deletingId === exp.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
