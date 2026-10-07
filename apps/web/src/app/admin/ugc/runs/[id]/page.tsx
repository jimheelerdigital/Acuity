/**
 * One UGC pipeline run: stage, cost (Apify + models/transcripts), errors,
 * and — for a dry run — every creator it found with persona, type, score,
 * reason and drafts. Nothing from a dry run is saved anywhere else.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import type { Candidate } from "@/lib/ugc/sources/types";

export const dynamic = "force-dynamic";

export default async function UgcRunPage({ params }: { params: { id: string } }) {
  const { prisma } = await import("@/lib/prisma");
  const run = await prisma.ugcRun.findUnique({ where: { id: params.id } });
  if (!run) notFound();
  const list = ((run.candidates ?? []) as unknown as Candidate[]).slice().sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const errors = (run.errors as { stage: string; message: string; at: string }[] | null) ?? [];
  const report = (run.report ?? {}) as Record<string, unknown>;
  const total = run.apifyCostUsd + run.modelCostUsd;

  return (
    <div className="min-h-screen bg-acuity-bg text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <Link href="/admin/ugc" className="text-xs underline text-acuity-text-ter">← UGC dashboard</Link>
          <h1 className="text-2xl font-bold">
            {run.kind} run · {run.status}
          </h1>
          <p className="text-sm text-acuity-text-sec">
            Started {run.startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC · stage {run.stage} · {run.profilesFound} profiles · {run.queued} queued
          </p>
          <p className="text-sm">
            Cost: Apify <b>${run.apifyCostUsd.toFixed(2)}</b> · models + transcripts <b>${run.modelCostUsd.toFixed(2)}</b> · total <b>${total.toFixed(2)}</b>
          </p>
          {Object.keys(report).length > 0 && <pre className="text-xs text-acuity-text-ter mt-2 whitespace-pre-wrap">{JSON.stringify(report, null, 1)}</pre>}
        </div>
        {errors.length > 0 && (
          <div className="rounded-lg border border-red-500 bg-red-500/10 p-4 text-sm space-y-1">
            {errors.map((e, i) => (
              <p key={i}>
                <b>{e.stage}</b>: {e.message} <span className="text-xs text-acuity-text-ter">{e.at}</span>
              </p>
            ))}
          </div>
        )}
        {list.map((c) => (
          <div key={`${c.platform}:${c.handle}`} className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4 space-y-2">
            <div className="flex flex-wrap justify-between gap-2">
              <a className="font-semibold underline" href={c.profileUrl} target="_blank" rel="noreferrer">
                @{c.handle}
              </a>
              <span className="text-sm text-acuity-text-sec">
                {c.platform} · {c.persona ?? "—"} · {c.creatorType ?? "—"} · rough {c.roughScore ?? "—"} · <b>score {c.score ?? "—"}</b>
              </span>
            </div>
            {c.dropped && <p className="text-xs text-amber-300">Dropped / would drop: {c.dropped}</p>}
            <p className="text-sm">{c.scoreReason}</p>
            <p className="text-xs text-acuity-text-ter">
              {c.email ?? "no email"} · {c.portfolioUrl ?? "no portfolio"} · followers {c.followers ?? "—"} · avg views {c.avgViews ?? "—"} ·{" "}
              {c.recentVideos?.filter((v) => v.transcript).length ?? 0} transcripts
            </p>
            {c.emailDraft && (
              <>
                <p className="text-xs text-acuity-text-ter">
                  Claims: {c.claimsStatus}
                  {c.claimsNotes ? ` — ${c.claimsNotes}` : ""} · Subject: {c.emailSubject}
                </p>
                <pre className="whitespace-pre-wrap text-sm bg-acuity-bg-inset rounded p-3 font-sans">{c.emailDraft}</pre>
                <pre className="whitespace-pre-wrap text-sm bg-acuity-bg-inset rounded p-3 font-sans">{c.dmDraft}</pre>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
