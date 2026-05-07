import { BarChart3 } from "lucide-react";

export default function PerformancePage() {
  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Performance</h1>
          <p className="text-sm text-[#A0A0B8]">
            Live experiment metrics, spend tracking, and decision history.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-white/20 bg-[#13131F] p-12 text-center">
        <BarChart3 className="h-10 w-10 text-[#A0A0B8] mx-auto mb-4" />
        <p className="text-sm text-[#A0A0B8]">
          No live experiments. Performance monitor coming in Phase 7.
        </p>
      </div>
    </>
  );
}
