"use client";

/**
 * "All Meta spend" — every campaign in the ad account (UGC, app installs,
 * retargeting, AdLab), priced by paid trial and charged payer
 * (lib/adlab/account-spend.ts). Added 2026-10-27: the cards below only see
 * AdLab-managed ads.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import type { AccountSpend, Verdict } from "@/lib/adlab/account-spend";

const usd = (c: number | null) => (c === null ? "—" : `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const VERDICT_STYLE: Record<Verdict, string> = {
  keep: "text-emerald-400",
  cut: "text-red-400",
  "too early": "text-acuity-text-ter",
  "no spend": "text-acuity-text-quiet",
};

export function AllMetaSpend({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<AccountSpend | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Meta insights over very long ranges are slow; cap at 90 days.
    const minFrom = new Date(new Date(`${to}T00:00:00Z`).getTime() - 89 * 86400000).toISOString().slice(0, 10);
    const since = from < minFrom ? minFrom : from;
    setData(null);
    setError(null);
    fetch(`/api/admin/adlab/account-spend?since=${since}&until=${to}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setData(j as AccountSpend);
      })
      .catch((e: Error) => setError(e.message));
  }, [from, to]);

  return (
    <div className="rounded-acuity-lg border border-acuity-line bg-acuity-card-bg p-5 mb-8">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-sm font-semibold text-white">All Meta spend, every campaign</h2>
        {data && (
          <span className="text-xs text-acuity-text-ter">
            {data.since} → {data.until} · <span className="text-white font-semibold">{usd(data.totalSpendCents)}</span>
          </span>
        )}
      </div>
      <p className="text-xs text-acuity-text-ter mb-4">
        Payer = trial ended and still paying. Keep a campaign if a payer costs $60 or less; under 5 ended trials it&rsquo;s too early to call. App-install
        campaigns are blended: App Store trials are split by spend, since Apple doesn&rsquo;t say which ad each one came from.
      </p>
      {error && <p className="text-xs text-red-400">Couldn&rsquo;t load: {error}</p>}
      {!data && !error && <Loader2 className="h-5 w-5 text-acuity-text-ter animate-spin" />}
      {data && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-acuity-text-ter border-b border-acuity-line">
                  <th className="py-2 pr-3 font-medium">Campaign</th>
                  <th className="py-2 px-2 font-medium text-right">Spend</th>
                  <th className="py-2 px-2 font-medium text-right">Signups</th>
                  <th className="py-2 px-2 font-medium text-right">Paid trials</th>
                  <th className="py-2 px-2 font-medium text-right">Ended</th>
                  <th className="py-2 px-2 font-medium text-right">Payers</th>
                  <th className="py-2 px-2 font-medium text-right">$/trial</th>
                  <th className="py-2 px-2 font-medium text-right">$/payer</th>
                  <th className="py-2 pl-2 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns
                  .filter((c) => c.spendCents > 0)
                  .map((c) => (
                    <tr key={c.campaignId} className="border-b border-acuity-line/50 text-white">
                      <td className="py-2 pr-3">
                        {c.name}
                        <span className="ml-2 text-acuity-text-quiet">{c.kind === "app" ? "app · blended" : "web"}</span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{usd(c.spendCents)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{c.kind === "app" ? "—" : c.signups}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{num(c.paidTrials)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{num(c.ended)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{num(c.payers)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{usd(c.costPerTrialCents)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{usd(c.costPerPayerCents)}</td>
                      <td className={`py-2 pl-2 font-semibold ${VERDICT_STYLE[c.verdict]}`}>{c.verdict}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-acuity-text-ter">
            App Store trials started: {data.appStore.trials} (ended {data.appStore.ended}, paid {data.appStore.payers}). Web paid trials not from a Meta ad:{" "}
            {data.webNotFromMeta.paidTrials}.
          </p>
        </>
      )}
    </div>
  );
}
