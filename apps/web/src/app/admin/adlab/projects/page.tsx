import { FolderKanban } from "lucide-react";

export default function ProjectsPage() {
  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Projects</h1>
          <p className="text-sm text-[#A0A0B8]">
            Configure brand, audience, and ad account settings per project.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-white/20 bg-[#13131F] p-12 text-center">
        <FolderKanban className="h-10 w-10 text-[#A0A0B8] mx-auto mb-4" />
        <p className="text-sm text-[#A0A0B8]">
          No projects yet. Project configuration UI coming in Phase 2.
        </p>
      </div>
    </>
  );
}
