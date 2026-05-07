import { FlaskConical } from "lucide-react";

export default function ExperimentsPage() {
  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Experiments</h1>
          <p className="text-sm text-[#A0A0B8]">
            Create topic briefs, review angle hypotheses, and manage ad experiments.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-white/20 bg-[#13131F] p-12 text-center">
        <FlaskConical className="h-10 w-10 text-[#A0A0B8] mx-auto mb-4" />
        <p className="text-sm text-[#A0A0B8]">
          No experiments yet. Research agent coming in Phase 3.
        </p>
      </div>
    </>
  );
}
