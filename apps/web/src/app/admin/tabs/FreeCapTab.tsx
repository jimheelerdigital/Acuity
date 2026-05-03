"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * v1.1 free-tier slice 7 — admin tab for the soft cap mechanism.
 *
 * Surfaces:
 *   - Current `free_recording_cap` flag state + manual toggle
 *   - Last 12 weekly evaluations (3 metrics + condition met flag)
 *   - Last 30 audit-log rows (auto-flip + manual flips)
 *   - The thresholds the auto-evaluator is checking against
 *
 * The flag is sticky-on automatically (free-cap-evaluator cron).
 * Manual disable here is the only off-path once auto-flipped.
 */

type Flag = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  updatedAt: string;
};

type Cycle = {
  id: string;
  evaluatedAt: string;
  freeUserCount: number;
  medianCadence: number;
  conversionRate: number;
  allConditionsMet: boolean;
};

type AuditRow = {
  id: string;
  timestamp: string;
  action: string;
  triggeringEvaluationIds: string[];
  notes: string | null;
};

type Thresholds = {
  freeUserCount: number;
  medianCadence: number;
  conversionRate: number;
  requiredCycles: number;
};

type Payload = {
  flag: Flag | null;
  cycles: Cycle[];
  audit: AuditRow[];
  thresholds: Thresholds;
};

export default function FreeCapTab() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/free-cap", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load");
      setData(body);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(nextEnabled: boolean) {
    if (!data?.flag) return;
    const verb = nextEnabled ? "ENABLE" : "DISABLE";
    const ok = window.confirm(
      `Manually ${verb} the free recording cap? This affects all FREE post-trial users worldwide.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/free-cap/toggle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: nextEnabled,
          notes: notes.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Toggle failed");
      setNotes("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {error && (
          <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        <p className="text-sm text-white/40">Loading…</p>
      </div>
    );
  }

  const { flag, cycles, audit, thresholds } = data;
  const consecutiveMet = countTrailingMet(cycles);

  return (
    <div className="space-y-10">
      {error && (
        <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Current state */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Current state</h2>
        <div className="rounded-lg bg-[#13131F] p-5">
          {flag === null ? (
            <p className="text-sm text-amber-300">
              free_recording_cap flag not seeded. Run{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">
                scripts/seed-feature-flags.ts
              </code>{" "}
              from a network that can reach Supabase.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    flag.enabled
                      ? "bg-green-500/20 text-green-300"
                      : "bg-white/5 text-white/40"
                  }`}
                >
                  {flag.enabled ? "ON" : "OFF"}
                </span>
                <span className="text-sm text-white/60">
                  Last updated {new Date(flag.updatedAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-white/70">
                {flag.enabled
                  ? "Cap is enforced. FREE post-trial users get 30 recordings per UTC month; the 30th is grace, the 31st blocks."
                  : "Cap is dormant. The /api/record path skips the counter entirely. PRO/TRIAL/PAST_DUE users are never affected regardless of state."}
              </p>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-white/40">
                  Notes (optional, persisted to FreeCapAuditLog)
                </label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why are you flipping the cap?"
                  maxLength={500}
                  className="w-full rounded-md bg-[#0A0A0F] px-3 py-2 text-sm text-white placeholder-white/30"
                />
              </div>
              <div className="flex gap-2">
                {flag.enabled ? (
                  <button
                    onClick={() => toggle(false)}
                    disabled={busy}
                    className="rounded-md bg-red-500/20 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/30 disabled:opacity-50"
                  >
                    Manually disable
                  </button>
                ) : (
                  <button
                    onClick={() => toggle(true)}
                    disabled={busy}
                    className="rounded-md bg-[#7C5CFC] px-4 py-2 text-sm font-medium text-white hover:bg-[#6A4FE0] disabled:opacity-50"
                  >
                    Manually enable
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Thresholds */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Auto-evaluator thresholds</h2>
        <div className="rounded-lg bg-[#13131F] p-5 text-sm">
          <p className="mb-3 text-white/60">
            Cron flips the flag ON automatically when ALL three conditions
            hold for {thresholds.requiredCycles} consecutive Sundays.
            Sticky once flipped — only manual disable turns it back off.
          </p>
          <ul className="space-y-2 text-white/80">
            <li>
              <span className="font-mono text-xs text-white/40">A.</span>{" "}
              FREE user count &gt;{" "}
              <span className="font-mono">
                {thresholds.freeUserCount.toLocaleString()}
              </span>
            </li>
            <li>
              <span className="font-mono text-xs text-white/40">B.</span>{" "}
              Median recordings/user/day over trailing 14d ≥{" "}
              <span className="font-mono">{thresholds.medianCadence}</span>
            </li>
            <li>
              <span className="font-mono text-xs text-white/40">C.</span>{" "}
              FREE→PRO conversion rate over trailing 30d &lt;{" "}
              <span className="font-mono">
                {(thresholds.conversionRate * 100).toFixed(2)}%
              </span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-white/40">
            Trailing met-count from the latest evaluations:{" "}
            <span className="font-mono text-white/60">
              {consecutiveMet} / {thresholds.requiredCycles}
            </span>
          </p>
        </div>
      </section>

      {/* Cycles */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Recent evaluations</h2>
        {cycles.length === 0 ? (
          <p className="text-sm text-white/40">
            No evaluations yet. The cron runs Sundays at 06:00 UTC.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg bg-[#13131F]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-white/40">
                  <th className="px-4 py-3">Evaluated</th>
                  <th className="px-4 py-3">FREE users</th>
                  <th className="px-4 py-3">Median cadence</th>
                  <th className="px-4 py-3">Conversion</th>
                  <th className="px-4 py-3">All conditions met</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((c) => (
                  <tr key={c.id} className="border-t border-white/5">
                    <td className="px-4 py-3 text-white/80">
                      {new Date(c.evaluatedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-white/80">
                      {c.freeUserCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-white/80">
                      {c.medianCadence.toFixed(3)}/day
                    </td>
                    <td className="px-4 py-3 font-mono text-white/80">
                      {(c.conversionRate * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          c.allConditionsMet
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-green-500/20 text-green-300"
                        }`}
                      >
                        {c.allConditionsMet ? "MET" : "ok"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Audit log */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Audit log</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-white/40">
            No flag-state changes recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg bg-[#13131F]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-white/40">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Triggers</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((row) => (
                  <tr key={row.id} className="border-t border-white/5">
                    <td className="px-4 py-3 text-white/80">
                      {new Date(row.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.action === "AUTO_ENABLED"
                            ? "bg-amber-500/20 text-amber-300"
                            : row.action === "MANUAL_ENABLED"
                              ? "bg-[#7C5CFC]/20 text-[#A78BFA]"
                              : "bg-white/5 text-white/60"
                        }`}
                      >
                        {row.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/40">
                      {row.triggeringEvaluationIds.length === 0
                        ? "—"
                        : `${row.triggeringEvaluationIds.length} eval(s)`}
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {row.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Count how many of the leading (newest-first) cycles all met the
 * gate, stopping at the first miss. Mirrors `shouldFlipCapOn` but
 * surfaces the partial count for the admin UI so an operator can
 * see "6/7" without staring at the Met column manually.
 */
function countTrailingMet(cycles: Cycle[]): number {
  let n = 0;
  for (const c of cycles) {
    if (!c.allConditionsMet) break;
    n += 1;
  }
  return n;
}
