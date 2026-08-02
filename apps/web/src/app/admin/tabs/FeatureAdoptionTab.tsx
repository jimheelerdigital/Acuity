"use client";

import ChartCard from "../components/ChartCard";
import MetricCard from "../components/MetricCard";
import { useTabData } from "./useTabData";

interface Feature {
  key: string;
  label: string;
  users: number;
  pct: number;
  type: "user-driven" | "auto-seeded";
}
interface FeatureData {
  totalActivated: number;
  features: Feature[];
  _error?: string;
}

function Row({ f, muted }: { f: Feature; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className={`w-56 shrink-0 text-sm ${muted ? "text-acuity-text-quiet" : "text-acuity-text-sec"}`}
      >
        {f.label}
        {muted && (
          <span
            className="ml-1 cursor-help text-acuity-text-quiet"
            title="Auto-seeded during onboarding — existence does not mean engagement"
          >
            ⓘ
          </span>
        )}
      </div>
      <div className="h-2 flex-1 rounded bg-acuity-bg-inset">
        <div
          className="h-2 rounded"
          style={{
            width: `${Math.min(100, f.pct)}%`,
            background: muted ? "var(--acuity-line-strong)" : "var(--acuity-primary)",
          }}
        />
      </div>
      <div
        className={`w-24 shrink-0 text-right text-sm tabular-nums ${muted ? "text-acuity-text-quiet" : "text-acuity-text-sec"}`}
      >
        {f.users} · {f.pct}%
      </div>
    </div>
  );
}

export default function FeatureAdoptionTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading, error } = useTabData<FeatureData>(
    "feature-adoption",
    start,
    end,
  );

  if (loading) return <div className="text-acuity-text-ter">Loading…</div>;
  if (error || !data)
    return <div className="text-acuity-bad">{error ?? "No data"}</div>;
  if (data._error) return <div className="text-acuity-bad">{data._error}</div>;

  const userDriven = data.features.filter((f) => f.type === "user-driven");
  const autoSeeded = data.features.filter((f) => f.type === "auto-seeded");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Activated users (1+ entry, in range)"
          value={data.totalActivated}
        />
      </div>

      <ChartCard title="Feature adoption — user-driven (% of activated)">
        <div className="flex flex-col">
          {userDriven.map((f) => (
            <Row key={f.key} f={f} />
          ))}
        </div>
      </ChartCard>

      <ChartCard title="Auto-seeded — existence ≠ engagement (shown for context)">
        <div className="flex flex-col">
          {autoSeeded.map((f) => (
            <Row key={f.key} f={f} muted />
          ))}
        </div>
        <p className="mt-3 text-xs text-acuity-text-quiet">
          These rows are auto-created during onboarding, so the % reflects
          seeding, not real engagement. The real Life Map signal is &ldquo;Life
          Map engagement (score moved)&rdquo; in the user-driven list above.
        </p>
      </ChartCard>
    </div>
  );
}
