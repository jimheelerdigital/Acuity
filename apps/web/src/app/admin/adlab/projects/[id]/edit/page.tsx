"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { ProjectForm } from "../../project-form";

export default function EditProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/adlab/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        // Convert cents back to dollars for the form
        setProject({
          ...data,
          targetCplCents: data.targetCplCents / 100,
          dailyBudgetCentsPerVariant: data.dailyBudgetCentsPerVariant / 100,
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-[#A0A0B8] animate-spin" />
      </div>
    );
  }

  if (!project) {
    return <p className="text-sm text-red-400">Project not found.</p>;
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">Edit Project</h1>
      <p className="text-sm text-[#A0A0B8] mb-8">{project.name as string}</p>
      <ProjectForm
        mode="edit"
        projectId={id}
        initialData={project as Record<string, unknown> & { usps: string[] }}
      />
    </>
  );
}
