"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface Project {
  id: string;
  name: string;
  slug: string;
}

export default function NewExperimentPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [topicBrief, setTopicBrief] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/adlab/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects(data);
        if (data.length > 0) setProjectId(data[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !topicBrief.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      // Create experiment
      const createRes = await fetch("/api/admin/adlab/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, topicBrief }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || "Failed to create experiment");
      }

      const experiment = await createRes.json();

      // Run research
      setResearching(true);
      const researchRes = await fetch("/api/admin/adlab/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId: experiment.id }),
      });

      if (!researchRes.ok) {
        const err = await researchRes.json();
        throw new Error(err.error || "Research failed");
      }

      router.push(`/admin/adlab/experiments/${experiment.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
      setResearching(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-[#A0A0B8] animate-spin" />
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">New Experiment</h1>
      <p className="text-sm text-[#A0A0B8] mb-8">
        Write a topic brief and the research agent will generate angle hypotheses.
      </p>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-[#13131F] p-8 text-center">
          <p className="text-sm text-[#A0A0B8]">
            Create a project first before running experiments.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-[#13131F] p-6 space-y-4">
            <div>
              <label className="block text-xs text-[#A0A0B8] mb-1.5">Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#1E1E2E] px-3 py-2 text-sm text-white outline-none focus:border-[#7C5CFC]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.slug})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[#A0A0B8] mb-1.5">Topic Brief</label>
              <textarea
                value={topicBrief}
                onChange={(e) => setTopicBrief(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#1E1E2E] px-3 py-2 text-sm text-white placeholder-[#A0A0B8]/50 outline-none focus:border-[#7C5CFC] min-h-[120px]"
                placeholder="e.g. Test pain-point hooks against outcome hooks for Founder/Executive persona, focused on Weekly Report value surface"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !topicBrief.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#7C5CFC] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {researching
              ? "Generating angles..."
              : submitting
                ? "Creating..."
                : "Create & Research"}
          </button>
        </form>
      )}
    </>
  );
}
