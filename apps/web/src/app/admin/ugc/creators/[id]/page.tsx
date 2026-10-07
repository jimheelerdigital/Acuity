/**
 * One UGC creator: profile, score, drafts, status history, outreach log,
 * deal → brief → delivery → paid, and per-video tracking (winner flag,
 * rights, bonus, the hand-typed spend / trials / paid conversions, cost per
 * trial).
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { BUNDLE_SIZE, RIGHTS_EXTENSION_FEE, trackingUrl } from "@/lib/ugc/config";
import { costPerTrial, isKill, rightsEndingSoon } from "@/lib/ugc/metrics";
import { ALL_STATUSES } from "@/lib/ugc/status";

import { ActionButton, CopyButton, DealForm, PaidForm, StatusSelect, VideoNumbers } from "../../ugc-client";

export const dynamic = "force-dynamic";

const usd = (cents: number | null | undefined) => (cents == null ? "—" : `$${(cents / 100).toFixed(2)}`);

export default async function UgcCreatorPage({ params }: { params: { id: string } }) {
  const { prisma } = await import("@/lib/prisma");
  const c = await prisma.ugcCreator.findUnique({
    where: { id: params.id },
    include: {
      events: { orderBy: { at: "desc" } },
      outreach: { orderBy: { sentAt: "desc" } },
      briefs: { orderBy: { createdAt: "desc" }, take: 1 },
      videos: { orderBy: [{ videoNumber: "asc" }, { hookVersion: "asc" }] },
    },
  });
  if (!c) notFound();
  const detail = (c.scoreDetail ?? {}) as Record<string, unknown>;
  const owed =
    (c.agreedFeeCents ?? 0) * BUNDLE_SIZE -
    c.feePaidCents +
    c.videos.reduce((s, v) => s + v.bonusOwedCents - v.bonusPaidCents + v.extensionOwedCents - v.extensionPaidCents, 0);

  return (
    <div className="min-h-screen bg-acuity-bg text-white p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <Link href="/admin/ugc" className="text-xs underline text-acuity-text-ter">← UGC dashboard</Link>
          <h1 className="text-2xl font-bold">
            <a className="underline" href={c.profileUrl ?? "#"} target="_blank" rel="noreferrer">@{c.handle}</a>{" "}
            <span className="text-base font-normal text-acuity-text-ter">{c.platform} · {c.source}</span>
          </h1>
          <p className="text-sm text-acuity-text-sec">
            {c.persona} · {c.creatorType} · score {c.score ?? "—"} (fit {String(detail.fit ?? "—")}, camera {String(detail.camera ?? "—")}, proof{" "}
            {String(detail.proof ?? "—")}, active {String(detail.active ?? "—")})
          </p>
          <p className="text-sm mt-1">{c.scoreReason}</p>
          <p className="text-xs text-acuity-text-ter mt-1">
            {c.email ?? "no email"} · followers {c.followers ?? "—"} (not scored) · avg views {c.avgViews ?? "—"} · last post{" "}
            {c.lastPostAt?.toISOString().slice(0, 10) ?? "—"} {c.credentials ? `· ${c.credentials}` : ""}
          </p>
          <p className="text-xs text-acuity-text-ter mt-1 flex items-center gap-2">
            Tracking link: {trackingUrl(c.trackingCode)} <CopyButton text={trackingUrl(c.trackingCode)} />
          </p>
        </div>

        <section className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">Status:</span>
            <StatusSelect creatorId={c.id} current={c.status} statuses={ALL_STATUSES} />
            {["replied", "negotiating", "contacted"].includes(c.status) && <DealForm creatorId={c.id} />}
            {c.status === "briefed" && <ActionButton body={{ action: "delivered", creatorId: c.id }} label="Mark delivered" tone="go" />}
            {["delivered", "paid"].includes(c.status) && <PaidForm creatorId={c.id} />}
          </div>
          <p className="text-sm">
            Agreed fee: {c.agreedFeeCents ? `${usd(c.agreedFeeCents)}/video` : "—"} · fee paid {usd(c.feePaidCents)} · still owed{" "}
            <b>{usd(Math.max(0, owed))}</b> <span className="text-acuity-text-ter">(the system never pays anyone; this is what you owe)</span>
          </p>
        </section>

        {c.videos.length > 0 && (
          <section className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4">
            <h2 className="font-semibold mb-2">Videos</h2>
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-acuity-text-ter">
                <tr>
                  <th className="pr-3">Cut</th>
                  <th className="pr-3">Branch</th>
                  <th className="pr-3">Rights end</th>
                  <th className="pr-3">Winner</th>
                  <th className="pr-3">Bonus owed / paid</th>
                  <th className="pr-3">Cost / trial</th>
                  <th>Spend · trials · paid · bonus paid · extension paid</th>
                </tr>
              </thead>
              <tbody>
                {c.videos.map((v) => {
                  const cpt = costPerTrial(v);
                  return (
                    <tr key={v.id} className="border-t border-acuity-line align-top">
                      <td className="py-2 pr-3">
                        {v.videoNumber}
                        {v.hookVersion}
                        {isKill(v) && <span className="ml-1 text-red-400 text-xs">KILL</span>}
                      </td>
                      <td className="pr-3">{v.painBranch ?? "—"}</td>
                      <td className="pr-3">
                        {v.rightsEndAt?.toISOString().slice(0, 10) ?? "not delivered"}
                        {rightsEndingSoon(v) && <span className="ml-1 text-amber-400 text-xs">soon</span>}
                        {v.winner && v.rightsEndAt && (
                          <div className="mt-1">
                            <ActionButton body={{ action: "extend-rights", videoId: v.id }} label={`Extend (+$${RIGHTS_EXTENSION_FEE})`} confirm="Confirm extend" />
                          </div>
                        )}
                        {v.extensionOwedCents > 0 && <div className="text-xs text-acuity-text-ter">ext. owed {usd(v.extensionOwedCents)}</div>}
                      </td>
                      <td className="pr-3">
                        <ActionButton body={{ action: "winner", videoId: v.id, winner: !v.winner }} label={v.winner ? "★ winner (undo)" : "Mark winner"} tone={v.winner ? "go" : "plain"} />
                      </td>
                      <td className="pr-3">
                        {usd(v.bonusOwedCents)} / {usd(v.bonusPaidCents)}
                      </td>
                      <td className="pr-3">{cpt == null ? "—" : `$${cpt.toFixed(2)}`}</td>
                      <td>
                        <VideoNumbers
                          videoId={v.id}
                          adSpend={v.adSpendCents == null ? null : v.adSpendCents / 100}
                          trials={v.trials}
                          paidConversions={v.paidConversions}
                          bonusPaid={v.bonusPaidCents / 100}
                          extensionPaid={v.extensionPaidCents / 100}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {c.briefs[0] && (
          <section className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4">
            <h2 className="font-semibold mb-2">
              Brief · claims {c.briefs[0].claimsStatus} · {c.briefs[0].approvedAt ? "approved" : "not approved"} ·{" "}
              {c.briefs[0].sentAt ? "sent" : "not sent"} <Link className="text-xs underline" href={`/admin/ugc/review?b=${c.briefs[0].id}#brief-${c.briefs[0].id}`}>review</Link>
            </h2>
            <pre className="whitespace-pre-wrap text-sm bg-acuity-bg-inset rounded p-3 font-sans">{c.briefs[0].body}</pre>
          </section>
        )}

        {c.emailDraft && (
          <section className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4 space-y-2">
            <h2 className="font-semibold">Offer draft · claims {c.claimsStatus}</h2>
            {c.claimsNotes && <p className="text-xs text-amber-300">{c.claimsNotes}</p>}
            <p className="text-xs text-acuity-text-ter">Subject: {c.emailSubject}</p>
            <pre className="whitespace-pre-wrap text-sm bg-acuity-bg-inset rounded p-3 font-sans">{c.emailDraft}</pre>
            <pre className="whitespace-pre-wrap text-sm bg-acuity-bg-inset rounded p-3 font-sans">{c.dmDraft}</pre>
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4">
            <h2 className="font-semibold mb-2">Status history</h2>
            {c.events.map((e) => (
              <p key={e.id} className="text-xs border-t border-acuity-line py-1">
                {e.at.toISOString().slice(0, 16).replace("T", " ")} · {e.from ?? "—"} → <b>{e.to}</b> · {e.by}
                {e.note ? ` · ${e.note}` : ""}
              </p>
            ))}
          </div>
          <div className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4">
            <h2 className="font-semibold mb-2">Outreach</h2>
            {c.outreach.map((o) => (
              <p key={o.id} className="text-xs border-t border-acuity-line py-1">
                {o.sentAt.toISOString().slice(0, 16).replace("T", " ")} · {o.kind} · {o.channel}
                {o.repliedAt ? ` · replied ${o.repliedAt.toISOString().slice(0, 10)}` : ""}
              </p>
            ))}
            {c.outreach.length === 0 && <p className="text-xs text-acuity-text-ter">Nothing sent.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
