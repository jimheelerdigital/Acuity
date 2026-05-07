import { LayoutDashboard, FlaskConical, BarChart3, Zap } from "lucide-react";

export default function AdLabDashboard() {
  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">AdLab Dashboard</h1>
      <p className="text-sm text-[#A0A0B8] mb-8">
        Automated ad research, creative generation, launch & optimization.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Zap className="h-5 w-5 text-[#7C5CFC]" />}
          label="Total Spend (Month)"
          value="--"
        />
        <StatCard
          icon={<BarChart3 className="h-5 w-5 text-emerald-400" />}
          label="Conversions (Month)"
          value="--"
        />
        <StatCard
          icon={<FlaskConical className="h-5 w-5 text-amber-400" />}
          label="Live Experiments"
          value="0"
        />
        <StatCard
          icon={<LayoutDashboard className="h-5 w-5 text-sky-400" />}
          label="Live Ads"
          value="0"
        />
      </div>

      <div className="mt-8 rounded-xl border border-white/10 bg-[#13131F] p-6">
        <h2 className="text-lg font-semibold text-white mb-2">
          Getting Started
        </h2>
        <p className="text-sm text-[#A0A0B8] leading-relaxed">
          Configure a project in <strong className="text-white">Projects</strong>,
          then create an experiment in <strong className="text-white">Experiments</strong>.
          The system will generate angle hypotheses, create ad variants, check
          compliance, and launch to Meta — all from this dashboard.
        </p>
      </div>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#13131F] p-5">
      <div className="flex items-center gap-3 mb-3">
        {icon}
        <span className="text-xs text-[#A0A0B8]">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
