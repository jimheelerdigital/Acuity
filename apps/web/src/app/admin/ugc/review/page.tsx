/**
 * UGC review page — where the digest's Approve / Edit / Skip buttons land.
 * Approve only works on a draft whose claims check passed. Also: briefs to
 * approve, the "ready to send" list (sending is off: copy, send yourself,
 * mark sent), follow-ups due on hand-sent offers, and the DM copy list.
 */
import Link from "next/link";

import { FOLLOWUP_AFTER_DAYS, OUTREACH_SEND_ENABLED, trackingUrl } from "@/lib/ugc/config";
import { followUpBody } from "@/lib/ugc/draft";

import { ActionButton, BriefEditor, CopyButton, DraftEditor } from "../ugc-client";

export const dynamic = "force-dynamic";

const claimsTone = (s: string | null) =>
  s === "passed" ? "text-emerald-400" : s === "flagged" ? "text-red-400" : "text-amber-400";

export default async function UgcReview({ searchParams }: { searchParams: { c?: string; do?: string; b?: string } }) {
  const { prisma } = await import("@/lib/prisma");
  const [queued, ready, briefs, contacted] = await Promise.all([
    prisma.ugcCreator.findMany({ where: { status: "queued" }, orderBy: { score: "desc" } }),
    prisma.ugcCreator.findMany({ where: { status: "approved" }, orderBy: { score: "desc" } }),
    prisma.ugcBrief.findMany({
      where: { OR: [{ approvedAt: null }, { sentAt: null }] },
      include: { creator: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ugcCreator.findMany({
      where: { status: "contacted", repliedAt: null },
      include: { outreach: { orderBy: { sentAt: "asc" } } },
    }),
  ]);
  // Hand-sent offers have no Gmail thread to watch, so their follow-ups are listed here.
  const dueBefore = Date.now() - FOLLOWUP_AFTER_DAYS * 86_400_000;
  const followups = contacted.filter((c) => {
    const offer = c.outreach.find((o) => o.kind === "offer");
    return offer && offer.channel.startsWith("manual") && offer.sentAt.getTime() <= dueBefore && !c.outreach.some((o) => o.kind === "followup");
  });
  const latestBriefs = new Map<string, (typeof briefs)[number]>();
  for (const b of briefs) if (!latestBriefs.has(b.creatorId)) latestBriefs.set(b.creatorId, b);

  return (
    <div className="min-h-screen bg-acuity-bg text-white p-6">
      <div className="max-w-4xl mx-auto space-y-10">
        <div>
          <Link href="/admin/ugc" className="text-xs underline text-acuity-text-ter">← UGC dashboard</Link>
          <h1 className="text-2xl font-bold">Review</h1>
          <p className="text-sm text-acuity-text-ter">Nothing moves forward without Approve. Sending is {OUTREACH_SEND_ENABLED ? "ON" : "OFF"}.</p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">To review ({queued.length})</h2>
          {queued.map((c) => (
            <div
              key={c.id}
              id={c.id}
              className={`rounded-lg border p-4 space-y-2 bg-acuity-card-bg ${searchParams.c === c.id ? "border-emerald-500" : "border-acuity-line"}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <a className="font-semibold underline" href={c.profileUrl ?? "#"} target="_blank" rel="noreferrer">
                    @{c.handle}
                  </a>
                  <span className="text-acuity-text-ter text-sm"> · {c.platform} · {c.persona} · {c.creatorType} · score {c.score}{c.source === "manual" ? " · manual add" : ""}</span>
                </div>
                <span className={`text-xs ${claimsTone(c.claimsStatus)}`}>claims: {c.claimsStatus}</span>
              </div>
              <p className="text-sm">{c.scoreReason}</p>
              <p className="text-xs text-acuity-text-ter">
                {c.email ?? "no email (DM only)"} {c.portfolioUrl && <>· <a className="underline" href={c.portfolioUrl}>portfolio</a></>}
                {c.costPerVideoCents ? ` · quoted $${(c.costPerVideoCents / 100).toFixed(0)}/video${c.underFeeCap ? "" : " (over cap)"}` : ""}
                {c.notes ? ` · notes: ${c.notes}` : ""}
              </p>
              {c.claimsNotes && <p className="text-xs text-amber-300">{c.claimsNotes}</p>}
              <p className="text-xs text-acuity-text-ter">Subject: {c.emailSubject}</p>
              <pre className="whitespace-pre-wrap text-sm bg-acuity-bg-inset rounded p-3 font-sans">{c.emailDraft}</pre>
              <p className="text-xs text-acuity-text-ter">DM version</p>
              <pre className="whitespace-pre-wrap text-sm bg-acuity-bg-inset rounded p-3 font-sans">{c.dmDraft}</pre>
              <div className="flex flex-wrap items-start gap-2">
                <ActionButton body={{ action: "approve", creatorId: c.id }} label="Approve" tone="go" />
                <DraftEditor
                  creatorId={c.id}
                  subject={c.emailSubject ?? ""}
                  email={c.emailDraft ?? ""}
                  dm={c.dmDraft ?? ""}
                  startOpen={searchParams.c === c.id && searchParams.do === "edit"}
                />
                {c.claimsStatus !== "passed" && <ActionButton body={{ action: "recheck", creatorId: c.id }} label="Re-check claims" />}
                <ActionButton body={{ action: "redraft", creatorId: c.id }} label="Redraft" />
                <ActionButton
                  body={{ action: "skip", creatorId: c.id }}
                  label="Skip"
                  tone="stop"
                  confirm={searchParams.c === c.id && searchParams.do === "skip" ? undefined : "Skip forever? Click again"}
                />
              </div>
            </div>
          ))}
          {queued.length === 0 && <p className="text-sm text-acuity-text-ter">Nothing waiting.</p>}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Briefs ({latestBriefs.size})</h2>
          {Array.from(latestBriefs.values()).map((b) => (
            <div
              key={b.id}
              id={`brief-${b.id}`}
              className={`rounded-lg border p-4 space-y-2 bg-acuity-card-bg ${searchParams.b === b.id ? "border-emerald-500" : "border-acuity-line"}`}
            >
              <div className="flex justify-between">
                <span className="font-semibold">@{b.creator.handle} · {b.approvedAt ? "approved, not sent" : "awaiting approval"}</span>
                <span className={`text-xs ${claimsTone(b.claimsStatus)}`}>claims: {b.claimsStatus}</span>
              </div>
              {b.claimsNotes && <p className="text-xs text-amber-300">{b.claimsNotes}</p>}
              <pre className="whitespace-pre-wrap text-sm bg-acuity-bg-inset rounded p-3 font-sans">{b.body}</pre>
              <div className="flex flex-wrap gap-2">
                {!b.approvedAt && <ActionButton body={{ action: "brief-approve", briefId: b.id }} label="Approve brief" tone="go" />}
                {!b.approvedAt && <BriefEditor briefId={b.id} body={b.body} />}
                {!b.approvedAt && <ActionButton body={{ action: "brief-regenerate", creatorId: b.creatorId }} label="Regenerate" />}
                {b.approvedAt && <CopyButton text={b.body} label="Copy brief" />}
                {b.approvedAt && <ActionButton body={{ action: "mark-sent", creatorId: b.creatorId, kind: "brief" }} label="Mark brief sent" />}
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Ready to send ({ready.length})</h2>
          <p className="text-xs text-acuity-text-ter">
            {OUTREACH_SEND_ENABLED
              ? "These go out from your Gmail at 10am Central, max 5 a day, follow-ups first."
              : "Sending is off. Copy the email, send it from keenan@heelerdigital.com yourself, then mark it sent. No email? Use the DM."}
          </p>
          {ready.map((c) => (
            <div key={c.id} className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4 space-y-2">
              <div className="font-semibold">
                <a className="underline" href={c.profileUrl ?? "#"} target="_blank" rel="noreferrer">@{c.handle}</a>
                <span className="text-acuity-text-ter text-sm font-normal"> · {c.email ?? "DM only"} · tracking link {trackingUrl(c.trackingCode)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.email && <CopyButton text={c.email} label="Copy address" />}
                {c.email && <CopyButton text={c.emailSubject ?? ""} label="Copy subject" />}
                {c.email && <CopyButton text={c.emailDraft ?? ""} label="Copy email" />}
                <CopyButton text={c.dmDraft ?? ""} label="Copy DM" />
                {c.email && <ActionButton body={{ action: "mark-sent", creatorId: c.id, kind: "offer", channel: "email" }} label="Mark emailed" tone="go" />}
                <ActionButton body={{ action: "mark-sent", creatorId: c.id, kind: "offer", channel: "dm" }} label="Mark DM'd" tone="go" />
              </div>
            </div>
          ))}
        </section>

        {followups.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Follow-ups due ({followups.length})</h2>
            <p className="text-xs text-acuity-text-ter">Sent by hand {FOLLOWUP_AFTER_DAYS}+ days ago with no reply marked. One follow-up, then stop.</p>
            {followups.map((c) => (
              <div key={c.id} className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4 space-y-2">
                <div className="font-semibold">@{c.handle} · {c.email ?? "DM"}</div>
                <pre className="whitespace-pre-wrap text-sm bg-acuity-bg-inset rounded p-3 font-sans">{followUpBody(null)}</pre>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={followUpBody(null)} label="Copy follow-up" />
                  <ActionButton body={{ action: "mark-sent", creatorId: c.id, kind: "followup" }} label="Mark follow-up sent" tone="go" />
                  <ActionButton body={{ action: "status", creatorId: c.id, to: "replied" }} label="They replied" />
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
