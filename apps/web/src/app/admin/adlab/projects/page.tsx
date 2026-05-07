"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  targetCplCents: number;
  dailyBudgetCentsPerVariant: number;
  createdAt: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/adlab/projects")
      .then((r) => r.json())
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/adlab/projects/${id}`, { method: "DELETE" });
    setProjects((p) => p.filter((proj) => proj.id !== id));
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Projects</h1>
          <p className="text-sm text-[#A0A0B8]">
            Configure brand, audience, and ad account settings per project.
          </p>
        </div>
        <Link
          href="/admin/adlab/projects/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFC] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6B4FE0]"
        >
          <Plus className="h-4 w-4" /> New Project
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 text-[#A0A0B8] animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-[#13131F] p-12 text-center">
          <p className="text-sm text-[#A0A0B8]">No projects yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-[#13131F] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-[#A0A0B8]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Target CPL</th>
                <th className="px-4 py-3 font-medium">Daily Budget / Variant</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                  onClick={() => router.push(`/admin/adlab/projects/${p.id}`)}
                >
                  <td className="px-4 py-3 text-white font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-[#A0A0B8] font-mono text-xs">{p.slug}</td>
                  <td className="px-4 py-3 text-[#A0A0B8]">${(p.targetCplCents / 100).toFixed(2)}</td>
                  <td className="px-4 py-3 text-[#A0A0B8]">${(p.dailyBudgetCentsPerVariant / 100).toFixed(2)}</td>
                  <td className="px-4 py-3 text-[#A0A0B8]">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/admin/adlab/projects/${p.id}/edit`}
                        className="rounded-md p-1.5 text-[#A0A0B8] hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        onClick={() => handleDelete(p.id, p.name)}
                        className="rounded-md p-1.5 text-[#A0A0B8] hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
