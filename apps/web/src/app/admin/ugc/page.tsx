/**
 * UGC creator outreach dashboard (2026-10-06, per Keenan). Stats by persona
 * and creator type, the KILL / REHIRE / RIGHTS lists, the low-deal warning,
 * manual add, run buttons, and the creators table (filter by status,
 * persona, type). Server-rendered; the admin layout gates access.
 */
import Link from "next/link";

import {
  CREATOR_TYPES,
  KILL_SPEND,
  OUTREACH_FROM_EMAIL,
  OUTREACH_SEND_ENABLED,
  PERSONAS,
  RIGHTS_WARNING_DAYS,
  trackingUrl,
} from "@/lib/ugc/config";
import { mailboxStatus } from "@/lib/ugc/gmail";
import { costPerTrial, trackingCampaign, type GroupStats, loadDashboard } from "@/lib/ugc/metrics";
import { ALL_STATUSES } from "@/lib/ugc/status";

import { ActionButton, ManualAddForm } from "./ugc-client";

export const dynamic = "force-dynamic";

const usd = (cents: number | null | undefined) => (cents == null ? "—" : `$${(cents / 100).toFixed(2)}`);
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

function StatsRow({ label, s }: { label: string; s: GroupStats }) {
  return (
    <tr className="border-t border-acuity-line">
      <td className="py-1.5 pr-4">{label}</td>
      <td className="pr-4">{s.offersSent}</td>
      <td className="pr-4">{pct(s.replyRate)}</td>
      <td className="pr-4">{s.deals}</td>
      <td className="pr-4">{usd(s.paidCents)}</td>
      <td>{s.avgCostPerTrial == null ? "—" : `$${s.avgCostPerTrial.toFixed(2)}`}</td>
    </tr>
  );
}

export default async function UgcDashboard({
  searchParams,
}: {
  searchParams: { status?: string; persona?: string; type?: string; gmail?: string };
}) {
  const d = await loadDashboard({ status: searchParams.status, persona: searchParams.persona, creatorType: searchParams.type });
  const mailbox = await mailboxStatus();
  const { prisma } = await import("@/lib/prisma");
  const runs = await prisma.ugcRun.findMany({ orderBy: { startedAt: "desc" }, take: 8 });
  const queued = d.all.filter((c) => c.status === "queued").length;
  const ready = d.all.filter((c) => c.status === "approved").length;

  const filterLink = (k: string, v: string | undefined) => {
    const p = new URLSearchParams({
      ...(searchParams.status ? { status: searchParams.status } : {}),
      ...(searchParams.persona ? { persona: searchParams.persona } : {}),
      ...(searchParams.type ? { type: searchParams.type } : {}),
    });
    if (v) p.set(k, v);
    else p.delete(k);
    return `/admin/ugc?${p}`;
  };

  return (
    <div className="min-h-screen bg-acuity-bg text-white p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">UGC creators</h1>
            <p className="text-sm text-acuity-text-ter">
              Buying ad videos from creators. Weekly run Sundays, digest Mondays. Sending is{" "}
              <b>{OUTREACH_SEND_ENABLED ? "ON" : "OFF"}</b> · mailbox{" "}
              {mailbox.connected ? `connected (${mailbox.email})` : <a className="underline" href="/api/admin/ugc/gmail/connect">Connect Gmail ({OUTREACH_FROM_EMAIL})</a>}
            </p>
            {searchParams.gmail && <p className="text-xs text-acuity-text-sec mt-1">Gmail: {searchParams.gmail}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/ugc/review" className="px-3 py-1.5 rounded text-sm font-semibold bg-emerald-600 hover:bg-emerald-500">
              Review ({queued}) · Ready to send ({ready})
            </Link>
            <ActionButton body={{ action: "run", kind: "dry-run" }} label="Dry run (25)" doneText="Started — report emails in ~15 min" />
            <ActionButton body={{ action: "run", kind: "weekly" }} label="Run weekly now" confirm="Spends up to $10 Apify — click again" doneText="Started" />
            <ActionButton body={{ action: "digest" }} label="Send digest now" doneText="Sending" />
          </div>
        </div>

        {d.warning && (
          <div className="rounded-lg border border-amber-500 bg-amber-500/10 p-4 text-sm font-semibold text-amber-300">{d.warning}</div>
        )}

        <section className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4">
          <h2 className="font-semibold mb-2">Results</h2>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-acuity-text-ter text-xs">
              <tr>
                <th className="pr-4">Group</th>
                <th className="pr-4">Offers sent</th>
                <th className="pr-4">Reply rate</th>
                <th className="pr-4">Deals</th>
                <th className="pr-4">Paid to creators</th>
                <th>Avg cost per trial</th>
              </tr>
            </thead>
            <tbody>
              <StatsRow label="All" s={d.overall} />
              {Object.entries(d.byPersona).map(([k, s]) => (
                <StatsRow key={k} label={`Persona: ${PERSONAS[k as keyof typeof PERSONAS].label}`} s={s} />
              ))}
              {Object.entries(d.byType).map(([k, s]) => (
                <StatsRow key={k} label={`Type: ${CREATOR_TYPES[k as keyof typeof CREATOR_TYPES].label}`} s={s} />
              ))}
            </tbody>
          </table>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4">
            <h2 className="font-semibold">KILL ({d.kill.length})</h2>
            <p className="text-xs text-acuity-text-ter mb-2">Spent ${KILL_SPEND}+ with zero trials. Turn these ads off.</p>
            {d.kill.map((v) => (
              <p key={v.id} className="text-sm">
                <Link className="underline" href={`/admin/ugc/creators/${v.creatorId}`}>@{v.creator.handle}</Link> video {v.videoNumber}
                {v.hookVersion} · spent {usd(v.adSpendCents)}
              </p>
            ))}
          </div>
          <div className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4">
            <h2 className="font-semibold">REHIRE ({d.rehire.length})</h2>
            <p className="text-xs text-acuity-text-ter mb-2">At least one winner.</p>
            {d.rehire.map((c) => (
              <p key={c.id} className="text-sm">
                <Link className="underline" href={`/admin/ugc/creators/${c.id}`}>@{c.handle}</Link> · {c.videos.filter((v) => v.winner).length} winning cut(s)
              </p>
            ))}
          </div>
          <div className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4">
            <h2 className="font-semibold">RIGHTS ({d.rights.length})</h2>
            <p className="text-xs text-acuity-text-ter mb-2">Usage rights end within {RIGHTS_WARNING_DAYS} days. Extend winners only.</p>
            {d.rights.map((v) => (
              <p key={v.id} className="text-sm">
                <Link className="underline" href={`/admin/ugc/creators/${v.creatorId}`}>@{v.creator.handle}</Link> video {v.videoNumber}
                {v.hookVersion} · ends {v.rightsEndAt?.toISOString().slice(0, 10)} ·{" "}
                {v.winner ? <b className="text-emerald-400">winner</b> : <span className="text-acuity-text-ter">not a winner</span>}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4 space-y-2">
          <h2 className="font-semibold">Add a creator by hand</h2>
          <p className="text-xs text-acuity-text-ter">Spotted in a competitor ad, or they pitched us. Goes through the same scoring and drafting.</p>
          <ManualAddForm />
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-acuity-text-ter">Status:</span>
            <Link className={!searchParams.status ? "font-bold" : "underline"} href={filterLink("status", undefined)}>all</Link>
            {ALL_STATUSES.map((s) => (
              <Link key={s} className={searchParams.status === s ? "font-bold" : "underline"} href={filterLink("status", s)}>
                {s}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-acuity-text-ter">Persona:</span>
            <Link className={!searchParams.persona ? "font-bold" : "underline"} href={filterLink("persona", undefined)}>all</Link>
            {Object.keys(PERSONAS).map((p) => (
              <Link key={p} className={searchParams.persona === p ? "font-bold" : "underline"} href={filterLink("persona", p)}>
                {p}
              </Link>
            ))}
            <span className="text-acuity-text-ter ml-4">Type:</span>
            <Link className={!searchParams.type ? "font-bold" : "underline"} href={filterLink("type", undefined)}>all</Link>
            {Object.keys(CREATOR_TYPES).map((t) => (
              <Link key={t} className={searchParams.type === t ? "font-bold" : "underline"} href={filterLink("type", t)}>
                {t}
              </Link>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-acuity-line">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-acuity-text-ter text-xs bg-acuity-bg-inset">
                <tr>
                  <th className="p-2">Creator</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Persona</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Score</th>
                  <th className="p-2">Rate</th>
                  <th className="p-2">Tracking link</th>
                  <th className="p-2">Tracked signups / trials</th>
                  <th className="p-2">Best cost/trial</th>
                </tr>
              </thead>
              <tbody>
                {d.shown.map((c) => {
                  const t = d.tracked[trackingCampaign(c.trackingCode)];
                  const cpts = c.videos.map(costPerTrial).filter((x): x is number => x != null);
                  return (
                    <tr key={c.id} className="border-t border-acuity-line">
                      <td className="p-2">
                        <Link className="underline" href={`/admin/ugc/creators/${c.id}`}>@{c.handle}</Link>
                        <span className="text-acuity-text-ter"> · {c.platform}</span>
                      </td>
                      <td className="p-2">{c.status}</td>
                      <td className="p-2">{c.persona ?? "—"}</td>
                      <td className="p-2">{c.creatorType ?? "—"}</td>
                      <td className="p-2">{c.score ?? "—"}</td>
                      <td className="p-2">
                        {c.agreedFeeCents ? `${usd(c.agreedFeeCents)}/video` : c.costPerVideoCents ? `quoted ${usd(c.costPerVideoCents)}${c.underFeeCap ? "" : " (over cap)"}` : "—"}
                      </td>
                      <td className="p-2 text-xs">{trackingUrl(c.trackingCode).replace("https://", "")}</td>
                      <td className="p-2">{t ? `${t.signups} / ${t.trials}` : "—"}</td>
                      <td className="p-2">{cpts.length ? `$${Math.min(...cpts).toFixed(2)}` : "—"}</td>
                    </tr>
                  );
                })}
                {d.shown.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-4 text-acuity-text-ter">No creators yet. Start with a dry run.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4">
          <h2 className="font-semibold mb-2">Recent runs</h2>
          {runs.map((r) => {
            const errs = (r.errors as { stage: string; message: string }[] | null) ?? [];
            return (
              <div key={r.id} className="text-sm border-t border-acuity-line py-1.5">
                <Link className="underline" href={`/admin/ugc/runs/${r.id}`}>{r.startedAt.toISOString().slice(0, 16).replace("T", " ")}</Link>{" "}
                · {r.kind} · {r.status} ({r.stage}) · {r.profilesFound} profiles · {r.queued} queued · Apify ${r.apifyCostUsd.toFixed(2)} · models $
                {r.modelCostUsd.toFixed(2)}
                {errs.length > 0 && <span className="text-red-400"> · {errs.length} error(s)</span>}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
