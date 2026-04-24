"use client";

import { useCallback, useEffect, useState } from "react";

import MetricCard from "../components/MetricCard";
import { SkeletonMetric } from "../components/SkeletonCard";

interface TrialEmailsData {
  activeByTrack: Record<string, number>;
  last7Days: { date: string; count: number }[];
  perEmailKey: Record<
    string,
    { sent: number; opens: number; clicks: number }
  >;
  computedAt: number;
}

const EMAIL_KEY_ORDER = [
  "welcome_day0",
  "first_debrief_replay",
  "objection_60sec",
  "pattern_tease",
  "user_story",
  "weekly_report_checkin",
  "life_matrix_reveal",
  "value_recap",
  "trial_ending_day13",
  "reactivation_friction",
  "reactivation_social",
  "reactivation_final",
  "power_deepen",
  "power_referral_tease",
];

export default function TrialEmailsTab() {
  const [data, setData] = useState<TrialEmailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resendUserId, setResendUserId] = useState("");
  const [resendKey, setResendKey] = useState("welcome_day0");
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/trial-emails");
      if (res.ok) setData((await res.json()) as TrialEmailsData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/trial-emails");
      if (!cancelled && res.ok) setData((await res.json()) as TrialEmailsData);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleResend = useCallback(async () => {
    if (!resendUserId.trim()) {
      setResendStatus("Enter a userId first.");
      return;
    }
    setResendStatus("Sending…");
    const res = await fetch("/api/admin/trial-emails/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: resendUserId.trim(),
        emailKey: resendKey,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      sent?: boolean;
      reason?: string;
      error?: string;
    };
    if (res.ok && json.sent) {
      setResendStatus(`Sent ${resendKey} → ${resendUserId}`);
      await load();
    } else {
      setResendStatus(
        `Failed: ${json.error ?? json.reason ?? `status ${res.status}`}`
      );
    }
  }, [resendUserId, resendKey, load]);

  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonMetric key={i} />
        ))}
      </div>
    );
  }

  const totalSent7d = data.last7Days.reduce((a, b) => a + b.count, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="STANDARD" value={data.activeByTrack.STANDARD ?? 0} />
        <MetricCard
          label="REACTIVATION"
          value={data.activeByTrack.REACTIVATION ?? 0}
        />
        <MetricCard
          label="POWER_USER"
          value={data.activeByTrack.POWER_USER ?? 0}
        />
        <MetricCard label="Sent (last 7d)" value={totalSent7d} />
      </div>

      <div className="rounded-lg bg-[#13131F] p-5">
        <h3 className="mb-4 text-sm font-semibold text-white/80">
          Last 7 days — emails sent per day
        </h3>
        <div className="flex items-end gap-2 h-40">
          {data.last7Days.map((d) => {
            const max = Math.max(
              1,
              ...data.last7Days.map((x) => x.count)
            );
            const h = Math.round((d.count / max) * 100);
            return (
              <div
                key={d.date}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div className="w-full flex items-end h-32">
                  <div
                    className="w-full rounded-t bg-[#7C5CFC]"
                    style={{ height: `${h}%` }}
                    title={`${d.count}`}
                  />
                </div>
                <div className="text-[10px] text-white/40">
                  {d.date.slice(5)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg bg-[#13131F] p-5">
        <h3 className="mb-4 text-sm font-semibold text-white/80">
          Per-emailKey lifetime stats
        </h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-white/40">
              <th className="py-2">Email key</th>
              <th className="py-2 text-right">Sent</th>
              <th className="py-2 text-right">Opens</th>
              <th className="py-2 text-right">Clicks</th>
              <th className="py-2 text-right">Open rate</th>
              <th className="py-2 text-right">Click rate</th>
            </tr>
          </thead>
          <tbody>
            {EMAIL_KEY_ORDER.map((k) => {
              const row = data.perEmailKey[k] ?? {
                sent: 0,
                opens: 0,
                clicks: 0,
              };
              const openRate = row.sent
                ? Math.round((row.opens / row.sent) * 100)
                : 0;
              const clickRate = row.sent
                ? Math.round((row.clicks / row.sent) * 100)
                : 0;
              return (
                <tr key={k} className="border-t border-white/5">
                  <td className="py-2 font-mono text-xs text-white/90">{k}</td>
                  <td className="py-2 text-right">{row.sent}</td>
                  <td className="py-2 text-right text-white/70">
                    {row.opens}
                  </td>
                  <td className="py-2 text-right text-white/70">
                    {row.clicks}
                  </td>
                  <td className="py-2 text-right text-white/60">
                    {row.sent ? `${openRate}%` : "—"}
                  </td>
                  <td className="py-2 text-right text-white/60">
                    {row.sent ? `${clickRate}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-white/40">
          Open / click counts require the Resend webhook to be configured
          (see manual setup in progress.md).
        </p>
      </div>

      <div className="rounded-lg bg-[#13131F] p-5">
        <h3 className="mb-4 text-sm font-semibold text-white/80">
          Manual resend (debug)
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-md bg-[#0A0A0F] border border-white/10 px-3 py-2 text-sm text-white min-w-[260px] flex-1"
            placeholder="userId (cuid)"
            value={resendUserId}
            onChange={(e) => setResendUserId(e.target.value)}
          />
          <select
            className="rounded-md bg-[#0A0A0F] border border-white/10 px-3 py-2 text-sm text-white"
            value={resendKey}
            onChange={(e) => setResendKey(e.target.value)}
          >
            {EMAIL_KEY_ORDER.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button
            onClick={handleResend}
            className="rounded-md bg-[#7C5CFC] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6E4BF4]"
          >
            Resend
          </button>
        </div>
        {resendStatus && (
          <p className="mt-3 text-xs text-white/60">{resendStatus}</p>
        )}
      </div>
    </div>
  );
}
