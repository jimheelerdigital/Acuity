/**
 * One creator on the creator platform (admin). Code + invite, free premium,
 * payout hold, adjustments, posts (boost + spend figures), referrals with
 * reassign, and manual attribution. Customer emails are visible here to
 * admins only — never on the creator dashboard.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { AGREEMENT_VERSION } from "@/lib/creators/config";
import { labelFor } from "@/lib/creators/emails";
import { balancesFor } from "@/lib/creators/ledger";
import { formatCents } from "@/lib/creators/money";
import { prisma } from "@/lib/prisma";

import { ActionButton, FormAction, PostFigures } from "../creators-client";

export const dynamic = "force-dynamic";

const usd = (c: number | null | undefined) => (c == null ? "—" : formatCents(c));
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");
const CARD = "rounded-lg border border-acuity-line bg-acuity-card-bg p-4 space-y-3";

export default async function CreatorDetail({ params }: { params: { id: string } }) {
  const c = await prisma.ugcCreator.findUnique({
    where: { id: params.id },
    include: {
      posts: { orderBy: { postedAt: "desc" } },
      referrals: { orderBy: { attributedAt: "desc" }, take: 200 },
      flags: { where: { status: { in: ["open", "held"] } } },
      payouts: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!c) notFound();
  const [balances, users, recentLedger] = await Promise.all([
    balancesFor([c.id]),
    prisma.user.findMany({
      where: { id: { in: c.referrals.map((r) => r.userId) } },
      select: { id: true, email: true },
    }),
    prisma.creatorLedgerEntry.findMany({
      where: { creatorId: c.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const b = balances.get(c.id)!;
  const emailBy = new Map(users.map((u) => [u.id, u.email]));
  const link = c.referralCode ? `https://goripple.io/c/${c.referralCode}` : null;
  const agreementOk = Boolean(c.agreementAcceptedAt && c.agreementVersion === AGREEMENT_VERSION);

  return (
    <div className="min-h-screen bg-acuity-bg text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <Link className="text-sm underline text-acuity-text-ter" href="/admin/creators">← Creator payouts</Link>
          <h1 className="text-2xl font-bold mt-1">{c.displayName ?? `@${c.handle}`}</h1>
          <p className="text-sm text-acuity-text-ter">
            @{c.handle} · {c.platform} · status {c.status} · {c.email ?? "no email"} ·{" "}
            <Link className="underline" href={`/admin/ugc/creators/${c.id}`}>outreach record</Link>
          </p>
        </div>

        {c.flags.length > 0 && (
          <div className="rounded-lg border border-amber-500 bg-amber-500/10 p-3 text-sm text-amber-300">
            {c.flags.length} open flag(s) — payouts held. <Link className="underline" href="/admin/creators?tab=flags">Review</Link>
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-4">
          {[
            ["Pending (in hold)", b.pending],
            ["Payable", b.payable],
            ["Paid to date", b.paidToDate],
            ["Bonuses (lifetime)", b.bonuses],
          ].map(([label, v]) => (
            <div key={label as string} className="rounded-lg border border-acuity-line bg-acuity-card-bg p-4">
              <p className="text-xs text-acuity-text-ter">{label}</p>
              <p className="text-xl font-bold tabular-nums">{usd(v as number)}</p>
            </div>
          ))}
        </section>

        <section className={CARD}>
          <h2 className="font-semibold">Setup</h2>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <p>Code: <b className="font-mono">{c.referralCode ?? "none yet"}</b> {link && <span className="text-acuity-text-ter">· {link}</span>}</p>
            <p>Dashboard invite: {c.dashboardInvitedAt ? day(c.dashboardInvitedAt) : "not sent"}</p>
            <p>Agreement: {agreementOk ? `accepted ${day(c.agreementAcceptedAt)} (v${c.agreementVersion})` : c.agreementAcceptedAt ? `old version ${c.agreementVersion}` : "not accepted"}</p>
            <p>Payouts: {c.stripePayoutsEnabled ? "Stripe ready" : c.stripeAccountId ? "Stripe onboarding incomplete" : "no Stripe"}{c.paypalEmail ? ` · PayPal ${c.paypalEmail}` : ""}</p>
            <p>Own Ripple account: {c.userId ? <span className="font-mono text-xs">{c.userId}</span> : "not linked"}</p>
            <p>Payout hold: {c.payoutHold ? <b className="text-amber-400">ON</b> : "off"}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {!c.referralCode && <ActionButton body={{ action: "issue-code", creatorId: c.id }} label="Issue code" tone="go" />}
            {c.email && (
              <ActionButton body={{ action: "invite", creatorId: c.id }} label={c.dashboardInvitedAt ? "Resend dashboard invite" : "Send dashboard invite"} />
            )}
            <ActionButton
              body={{ action: "payout-hold", creatorId: c.id, hold: !c.payoutHold }}
              label={c.payoutHold ? "Release payout hold" : "Put payouts on hold"}
              tone={c.payoutHold ? "go" : "warn"}
              confirm
            />
          </div>
          <div>
            <p className="text-xs text-acuity-text-ter mb-1">Free premium perk: comps their Ripple account and marks it as theirs (never counts as a referral).</p>
            <FormAction body={{ action: "grant-premium", creatorId: c.id }} fields={[{ name: "email", placeholder: "Their Ripple account email", width: "w-64", initial: c.email ?? "" }]} required={["email"]} label="Grant free premium" />
          </div>
          <div>
            <p className="text-xs text-acuity-text-ter mb-1">Adjustment: dollars, negative to deduct. Payable immediately. Reason is required and logged.</p>
            <FormAction
              body={{ action: "adjustment", creatorId: c.id }}
              fields={[
                { name: "amountDollars", placeholder: "± dollars", width: "w-24" },
                { name: "reason", placeholder: "Reason", width: "w-72" },
              ]}
              required={["amountDollars", "reason"]}
              label="Add adjustment"
              tone="warn"
              confirm
            />
          </div>
        </section>

        <section className={CARD}>
          <h2 className="font-semibold">Posts ({c.posts.length})</h2>
          <FormAction
            body={{ action: "add-post", creatorId: c.id }}
            fields={[
              { name: "url", placeholder: "Post URL", width: "w-72" },
              { name: "platform", placeholder: "instagram / tiktok…", width: "w-36" },
              { name: "postedAt", placeholder: "Posted", type: "date", width: "w-36" },
            ]}
            required={["url"]}
            label="Log a post"
          />
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-acuity-text-ter text-xs">
              <tr>
                <th className="py-1">Post</th>
                <th>Posted</th>
                <th>Boost</th>
                <th>Spend / trials / paid</th>
              </tr>
            </thead>
            <tbody>
              {c.posts.map((p) => (
                <tr key={p.id} className="border-t border-acuity-line align-top">
                  <td className="py-2 pr-2">
                    <a className="underline break-all" href={p.url} target="_blank" rel="noreferrer">{p.url}</a>
                    <div className="text-xs text-acuity-text-ter">{p.platform}</div>
                  </td>
                  <td className="py-2 pr-2">{day(p.postedAt)}</td>
                  <td className="py-2 pr-2">
                    {p.boosted ? (
                      <span className="text-emerald-400">boosted {day(p.boostedAt)}</span>
                    ) : (
                      <ActionButton body={{ action: "boost", postId: p.id }} label="Mark boosted ($100)" tone="go" confirm />
                    )}
                    {p.adSpend != null && p.trials ? (
                      <div className="text-xs text-acuity-text-ter">{usd(Math.round(p.adSpend / p.trials))}/trial</div>
                    ) : null}
                  </td>
                  <td className="py-2">
                    <PostFigures postId={p.id} adSpend={p.adSpend} trials={p.trials} paidConversions={p.paidConversions} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={CARD}>
          <h2 className="font-semibold">Referrals ({c.referrals.length})</h2>
          <div>
            <p className="text-xs text-acuity-text-ter mb-1">Attribute an account by hand (writes source=admin, or moves an existing referral here).</p>
            <FormAction
              body={{ action: "attribute", toCode: c.referralCode ?? "" }}
              fields={[
                { name: "email", placeholder: "Customer account email", width: "w-64" },
                { name: "reason", placeholder: "Reason", width: "w-64" },
              ]}
              required={["email", "reason"]}
              label="Attribute to this creator"
              confirm
            />
          </div>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-acuity-text-ter text-xs">
              <tr>
                <th className="py-1">Customer</th>
                <th>Source</th>
                <th>Attributed</th>
                <th>First paid</th>
                <th>Window end</th>
                <th>Reassign</th>
              </tr>
            </thead>
            <tbody>
              {c.referrals.map((r) => (
                <tr key={r.id} className="border-t border-acuity-line align-top">
                  <td className="py-2 pr-2">
                    {emailBy.get(r.userId) ?? "(deleted)"}
                    <div className="font-mono text-xs text-acuity-text-ter">{r.userId}</div>
                    {r.reassignedFrom && <div className="text-xs text-acuity-text-ter">reassigned: {r.reason}</div>}
                  </td>
                  <td className="py-2 pr-2">{r.source}</td>
                  <td className="py-2 pr-2">{day(r.attributedAt)}</td>
                  <td className="py-2 pr-2">{day(r.firstPaidAt)}</td>
                  <td className="py-2 pr-2">{day(r.windowEnd)}</td>
                  <td className="py-2">
                    <FormAction
                      body={{ action: "reassign", userId: r.userId }}
                      fields={[
                        { name: "toCode", placeholder: "New code", width: "w-24" },
                        { name: "reason", placeholder: "Reason", width: "w-40" },
                      ]}
                      required={["toCode", "reason"]}
                      label="Reassign"
                      confirm
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={CARD}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent ledger</h2>
            <Link className="text-xs underline" href={`/admin/creators?tab=ledger&creator=${c.id}`}>All rows</Link>
          </div>
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {recentLedger.map((r) => (
                <tr key={r.id} className="border-t border-acuity-line">
                  <td className="py-1.5 pr-2">{day(r.createdAt)}</td>
                  <td className="pr-2">{labelFor(r.type)}</td>
                  <td className={`pr-2 ${r.amount < 0 ? "text-amber-400" : ""}`}>{usd(r.amount)}</td>
                  <td className="pr-2">{r.status}</td>
                  <td className="text-xs text-acuity-text-sec">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {c.payouts.length > 0 && (
          <section className={CARD}>
            <h2 className="font-semibold">Payouts</h2>
            {c.payouts.map((p) => (
              <p key={p.id} className="text-sm">
                {p.runKey} · {usd(p.amount)} · {p.rail} · {p.status}{p.sentAt ? ` ${day(p.sentAt)}` : ""}{p.error ? ` · ${p.error}` : ""}
              </p>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
