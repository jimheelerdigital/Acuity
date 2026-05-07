import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
          <p className="text-sm text-[#A0A0B8]">
            Global AdLab configuration, API keys, and defaults.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-white/20 bg-[#13131F] p-12 text-center">
        <Settings className="h-10 w-10 text-[#A0A0B8] mx-auto mb-4" />
        <p className="text-sm text-[#A0A0B8]">
          Settings coming in Phase 8.
        </p>
      </div>
    </>
  );
}
