/**
 * goripple.io/creators — the creator dashboard (2026-10-22, spec "Ripple UGC
 * Creator Platform", section "Creator dashboard"). Reached by a magic link
 * (/creators/login); no password. A creator sees only their own data and
 * never a customer's identity: customers are numbers.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Card } from "@/components/acuity";
import { AGREEMENT_SECTIONS } from "@/lib/creators/agreement";
import {
  AGREEMENT_VERSION,
  CONNECT_COUNTRIES,
  HOLD_DAYS,
  PAYOUT_MIN_CENTS,
  SITE_URL,
} from "@/lib/creators/config";
import { firstNameOf, formatCents, nextPayoutDate } from "@/lib/creators/money";
import { ADMIN_VIEW_COOKIE, currentCreatorId } from "@/lib/creators/session";

import {
  AcceptAgreementButton,
  CodeEditor,
  CopyButton,
  DeletePostButton,
  PaypalForm,
  PostForm,
  RequestLinkForm,
  SignOutButton,
} from "./creators-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Creator dashboard",
  robots: { index: false, follow: false },
};

const EYEBROW = "font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter";
const NUM = "font-display tabular-nums";

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" className="relative min-h-screen overflow-hidden bg-acuity-bg font-sans text-acuity-text">
      {/* App hero atmosphere: coral + violet glow behind the header (DESIGN_SYSTEM heroGrad). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
        style={{
          background:
            "radial-gradient(55% 60% at 12% 0%, color-mix(in oklch, var(--acuity-primary), transparent 78%) 0%, transparent 70%), radial-gradient(50% 55% at 92% 4%, color-mix(in oklch, var(--acuity-secondary), transparent 76%) 0%, transparent 70%)",
        }}
      />
      <main className="relative mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
    </div>
  );
}

function Section({ eyebrow, title, children }: { eyebrow: string; title?: string; children: ReactNode }) {
  return (
    <Card>
      <div className={`${EYEBROW} flex items-center gap-2`}>
        <span className="h-1.5 w-1.5 rounded-full bg-acuity-grad-mix" />
        {eyebrow}
      </div>
      {title && <h2 className="mt-2 font-display text-[20px] font-bold tracking-[-0.3px]">{title}</h2>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  accent = "quiet",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "primary" | "secondary" | "mix" | "quiet";
}) {
  const bar =
    accent === "primary"
      ? "bg-acuity-grad-primary"
      : accent === "secondary"
        ? "bg-acuity-grad-secondary"
        : accent === "mix"
          ? "bg-acuity-grad-mix"
          : "bg-acuity-line-strong";
  return (
    <div className="relative flex flex-col gap-1 overflow-hidden rounded-acuity-md border border-acuity-line bg-acuity-bg-sub p-4">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-[3px] ${bar}`} />
      <div className={EYEBROW}>{label}</div>
      <div
        className={`${NUM} text-[26px] font-bold tracking-[-0.6px] ${
          accent === "mix" ? "bg-acuity-grad-mix bg-clip-text text-transparent" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[13px] text-acuity-text-ter">{sub}</div>}
    </div>
  );
}

function Pill({ tone, children }: { tone: "good" | "warn" | "quiet"; children: ReactNode }) {
  const cls =
    tone === "good"
      ? "bg-acuity-good-soft text-acuity-good border-acuity-good"
      : tone === "warn"
        ? "bg-acuity-warn-soft text-acuity-warn border-acuity-warn"
        : "bg-acuity-bg-sub text-acuity-text-ter border-acuity-line";
  return (
    <span className={`inline-flex items-center rounded-acuity-pill border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[1.4px] ${cls}`}>
      {children}
    </span>
  );
}

const CAPTIONS = [
  "I used to carry my whole to-do list in my head. Now I talk it out and Ripple turns it into tasks, tracks my habits and shows me what keeps coming up. 7-day free trial: {link} (code {code})",
  "The mental load is real. Ripple is where I put mine: I say what's on my mind and it pulls out the to-dos, notices the patterns and sends me a weekly report. Try it free for 7 days at {link}, code {code}.",
  "What surprised me about Ripple: it remembers. I talk, it keeps track, and every week I can see what's actually changing and what keeps repeating. {link} · code {code}",
];

export default async function CreatorsPage({
  searchParams,
}: {
  searchParams: { expired?: string; connected?: string; connect_error?: string };
}) {
  const creatorId = await currentCreatorId();
  if (!creatorId) {
    return (
      <Shell>
        <div className="mx-auto flex w-full max-w-[440px] flex-col gap-6 pt-8">
          <div>
            <div className={EYEBROW}>Ripple creators</div>
            <h1 className="mt-2 font-display text-[30px] font-extrabold tracking-[-0.8px]">Your dashboard</h1>
            <p className="mt-3 text-[15px] text-acuity-text-sec">
              Enter the email we have on file and we&apos;ll send you a sign-in link. No password needed.
            </p>
          </div>
          {searchParams.expired && (
            <p className="rounded-acuity-sm border border-acuity-line bg-acuity-bg-sub px-4 py-3 text-[14px] text-acuity-text-sec">
              That link has expired or was replaced by a newer one. Ask for a fresh link below.
            </p>
          )}
          <Card>
            <RequestLinkForm />
          </Card>
        </div>
      </Shell>
    );
  }

  const { prisma } = await import("@/lib/prisma");
  const { balancesFor } = await import("@/lib/creators/ledger");
  const { creatorCustomers, creatorFunnels } = await import("@/lib/creators/stats");
  const { refreshConnectStatus } = await import("@/lib/creators/payouts");

  const pre = await prisma.ugcCreator.findUniqueOrThrow({
    where: { id: creatorId },
    select: { stripeAccountId: true },
  });
  if (pre.stripeAccountId) await refreshConnectStatus(creatorId);

  const [creator, balances, funnels, customers, posts, payouts, brief] = await Promise.all([
    prisma.ugcCreator.findUniqueOrThrow({
      where: { id: creatorId },
      select: {
        handle: true,
        displayName: true,
        firstName: true,
        referralCode: true,
        agreementVersion: true,
        agreementAcceptedAt: true,
        stripeAccountId: true,
        stripePayoutsEnabled: true,
        paypalEmail: true,
      },
    }),
    balancesFor([creatorId]),
    creatorFunnels(creatorId),
    creatorCustomers(creatorId),
    prisma.creatorPost.findMany({
      where: { creatorId },
      orderBy: { postedAt: "desc" },
      select: { id: true, url: true, platform: true, postedAt: true, boosted: true, boostedAt: true },
    }),
    prisma.creatorPayout.findMany({
      where: { creatorId, status: "sent" },
      orderBy: { sentAt: "desc" },
      select: { id: true, amount: true, rail: true, sentAt: true },
    }),
    prisma.ugcBrief.findFirst({
      where: { creatorId, approvedAt: { not: null } },
      orderBy: { approvedAt: "desc" },
      select: { body: true, approvedAt: true },
    }),
  ]);

  const b = balances.get(creatorId)!;
  const name = creator.firstName ?? firstNameOf(creator.displayName, creator.handle);
  const code = creator.referralCode ?? "";
  const link = `${SITE_URL}/c/${code}`;
  const agreed = Boolean(creator.agreementAcceptedAt && creator.agreementVersion === AGREEMENT_VERSION);
  const agreedOld = Boolean(creator.agreementAcceptedAt) && !agreed;
  const payoutReady = creator.stripePayoutsEnabled || Boolean(creator.paypalEmail);
  const nextDate = nextPayoutDate();
  const nextAmount =
    b.payable >= PAYOUT_MIN_CENTS
      ? formatCents(b.payable)
      : b.payable < 0
        ? "Nothing yet"
        : "Rolls over";
  const captions = CAPTIONS.map((c) => c.replace(/\{link\}/g, link.replace("https://", "")).replace(/\{code\}/g, code));

  const { cookies } = await import("next/headers");
  const adminView = cookies().get(ADMIN_VIEW_COOKIE)?.value === creatorId;

  return (
    <Shell>
      {adminView && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-acuity-sm border border-acuity-line-strong bg-acuity-bg-sub px-4 py-3 text-[14px]">
          <span className="text-acuity-text-sec">
            Admin view: this is exactly what {name} sees. Anything you click here acts as them.
          </span>
          <a className="font-semibold underline" href="/api/admin/creators/view-as?exit=1">
            Back to admin
          </a>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className={EYEBROW}>Ripple creators</div>
          <div className="mt-3 flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-acuity-grad-mix text-[22px] font-bold text-white ring-2 ring-white/15">
              {name.replace(/^@/, "").charAt(0).toUpperCase()}
            </span>
            <h1 className="font-display text-[32px] font-extrabold leading-none tracking-[-1px] sm:text-[40px]">
              Hi <span className="bg-acuity-grad-mix bg-clip-text text-transparent">{name}</span>
            </h1>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {agreed ? <Pill tone="good">Agreement accepted</Pill> : <Pill tone="warn">Agreement needed</Pill>}
            {payoutReady ? <Pill tone="good">Payouts set up</Pill> : <Pill tone="warn">Payouts not set up</Pill>}
          </div>
        </div>
        <SignOutButton />
      </div>

      {searchParams.connected && (
        <p className="rounded-acuity-sm border border-acuity-line bg-acuity-bg-sub px-4 py-3 text-[14px] text-acuity-text-sec">
          {creator.stripePayoutsEnabled
            ? "Stripe is connected. Payouts will go to your account."
            : "Thanks. Stripe is still checking your details; this page updates once they're done."}
        </p>
      )}
      {searchParams.connect_error && (
        <p className="rounded-acuity-sm border border-acuity-bad bg-acuity-bad-soft px-4 py-3 text-[14px] text-acuity-text">
          We couldn&apos;t open Stripe just now. Try again in a minute, or reply to any of our emails and we&apos;ll sort it out.
        </p>
      )}

      <Card variant="tinted" className="relative isolate overflow-hidden">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 -z-10 h-48 w-48 rounded-full bg-acuity-grad-primary opacity-25 blur-3xl"
        />
        <div className={`${EYEBROW} relative`}>Your link</div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="truncate font-display text-[22px] font-bold tracking-[-0.4px] text-acuity-text">
              goripple.io/c/<span className="bg-acuity-grad-mix bg-clip-text text-transparent">{code}</span>
            </div>
            <div className="mt-1 text-[14px] text-acuity-text-sec">
              Code <span className="font-mono font-bold tracking-[1.4px] text-acuity-text">{code}</span> for people who install the app first
            </div>
          </div>
          <div className="flex gap-2">
            <CopyButton text={link} label="Copy link" primary />
            <CopyButton text={code} label="Copy code" />
          </div>
        </div>
        <div className="mt-4 border-t border-acuity-line pt-4">
          <CodeEditor current={code} />
        </div>
      </Card>

      {/* Earnings */}
      <Section eyebrow="Earnings">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat accent="secondary" label="Pending" value={formatCents(b.pending)} sub={`In the ${HOLD_DAYS}-day hold`} />
          <Stat accent="primary" label="Payable" value={formatCents(b.payable)} sub={b.payable < 0 ? "Covered by future earnings" : "Ready for the next payout"} />
          <Stat label="Paid to date" value={formatCents(b.paidToDate)} />
          <Stat accent="mix" label="Next payout" value={nextAmount} sub={fmtDate(nextDate)} />
        </div>
        {b.payable < 0 && (
          <p className="mt-4 text-[14px] text-acuity-text-sec">
            Balance: {formatCents(b.payable)}, covered by future earnings. You never owe us money.
          </p>
        )}
        <p className="mt-4 text-[13px] text-acuity-text-ter">
          Each commission waits {HOLD_DAYS} days after the customer&apos;s payment, in case of a refund, then it&apos;s
          payable. Payouts go out every other Friday once you have {formatCents(PAYOUT_MIN_CENTS)} payable.
        </p>
      </Section>

      {/* Funnel */}
      <Section eyebrow="Your funnel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[15px]">
            <thead>
              <tr className="text-left">
                <th className={`${EYEBROW} pb-2 font-bold`} />
                {["Clicks", "Signups", "Trials", "Paying"].map((h) => (
                  <th key={h} className={`${EYEBROW} pb-2 text-right font-bold`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Last 30 days", funnels.last30],
                  ["All time", funnels.allTime],
                ] as const
              ).map(([label, f]) => (
                <tr key={label} className="border-t border-acuity-line">
                  <td className="py-3 text-acuity-text-sec">{label}</td>
                  {[f.clicks, f.signups, f.trials, f.paying].map((n, i) => (
                    <td key={i} className={`${NUM} py-3 text-right text-[17px] font-bold`}>{n.toLocaleString("en-US")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Customers */}
      <Section eyebrow="Paying customers">
        {customers.length === 0 ? (
          <p className="text-[15px] text-acuity-text-sec">
            No paying customers yet. People appear here after their free trial turns into a first payment.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[14px]">
              <thead>
                <tr className="text-left">
                  {["Customer", "Started", "Plan", "Earning until", "Your commission"].map((h, i) => (
                    <th key={h} className={`${EYEBROW} pb-2 font-bold ${i === 4 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.number} className="border-t border-acuity-line">
                    <td className="py-3 font-mono">#{c.number}</td>
                    <td className="py-3 text-acuity-text-sec">{fmtDate(c.startDate)}</td>
                    <td className="py-3 capitalize text-acuity-text-sec">
                      {c.plan ?? "—"}
                      {c.refunded && <span className="ml-2 text-acuity-text-ter">(refunded)</span>}
                    </td>
                    <td className="py-3 text-acuity-text-sec">{fmtDate(c.windowEnd)}</td>
                    <td className={`${NUM} py-3 text-right font-bold`}>{formatCents(c.commissionToDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Posts */}
      <Section eyebrow="Your posts" title="Log each post with your link">
        <PostForm />
        {posts.length > 0 && (
          <ul className="mt-5 flex flex-col">
            {posts.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 border-t border-acuity-line py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[15px] text-acuity-text hover:underline">
                    {p.url.replace(/^https:\/\/(www\.)?/, "")}
                  </a>
                  <div className="text-[13px] capitalize text-acuity-text-ter">
                    {p.platform} · {fmtDate(p.postedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {p.boosted ? <Pill tone="good">Running as an ad</Pill> : <DeletePostButton id={p.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Payouts */}
      <Section eyebrow="Payouts">
        {payouts.length === 0 ? (
          <p className="text-[15px] text-acuity-text-sec">No payouts yet. Your first statement will show here.</p>
        ) : (
          <ul className="flex flex-col">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-t border-acuity-line py-3 first:border-t-0">
                <div>
                  <div className={`${NUM} text-[17px] font-bold`}>{formatCents(p.amount)}</div>
                  <div className="text-[13px] text-acuity-text-ter">
                    {fmtDate(p.sentAt)} · {p.rail === "stripe_connect" ? "Stripe" : p.rail === "paypal" ? "PayPal" : "Manual"}
                  </div>
                </div>
                <a href={`/api/creators/payouts/${p.id}/csv`} className="text-[14px] text-acuity-text-sec hover:text-acuity-text hover:underline">
                  Download CSV
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Setup */}
      <Section eyebrow="Setup" title="Get ready to be paid">
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="text-[15px] font-semibold">1. Payout account</h3>
            {creator.stripePayoutsEnabled ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Pill tone="good">Stripe connected</Pill>
                <a href="/api/creators/connect" className="text-[14px] text-acuity-text-sec hover:text-acuity-text hover:underline">
                  View payouts and tax info at Stripe
                </a>
              </div>
            ) : (
              <>
                <p className="mt-1 text-[14px] text-acuity-text-sec">
                  Stripe collects your bank details and tax form (W-9 or W-8BEN) and sends US creators a 1099. It takes about five minutes.
                </p>
                <form action="/api/creators/connect" method="get" className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-[14px] text-acuity-text-sec">
                    Where you live
                    <select
                      name="country"
                      defaultValue="US"
                      className="rounded-acuity-md border border-acuity-line bg-acuity-bg-sub px-3 py-2 text-[14px] text-acuity-text"
                    >
                      {CONNECT_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-acuity-pill bg-acuity-grad-primary px-6 py-3 text-[15px] font-semibold text-white hover:brightness-105 active:scale-[0.98]"
                  >
                    {creator.stripeAccountId ? "Finish Stripe setup" : "Connect Stripe"}
                  </button>
                </form>
                <p className="mt-2 text-[13px] text-acuity-text-ter">
                  Outside the US, Stripe pays you in your local currency.
                </p>
              </>
            )}
            <div className="mt-4">
              <p className="mb-2 text-[13px] text-acuity-text-ter">If Stripe can&apos;t onboard you, give us a PayPal email instead.</p>
              <PaypalForm current={creator.paypalEmail} />
            </div>
          </div>

          <div className="border-t border-acuity-line pt-6">
            <h3 className="text-[15px] font-semibold">2. Creator agreement</h3>
            {agreed ? (
              <p className="mt-1 text-[14px] text-acuity-text-sec">
                Accepted {fmtDate(creator.agreementAcceptedAt)} (version {AGREEMENT_VERSION}).
              </p>
            ) : (
              <p className="mt-1 text-[14px] text-acuity-text-sec">
                {agreedOld
                  ? "We've updated the agreement. Please read and accept the new version so we can keep paying you."
                  : "We can pay you once you've read and accepted this."}
              </p>
            )}
            <details className="mt-3 rounded-acuity-md border border-acuity-line bg-acuity-bg-sub p-4" open={!agreed}>
              <summary className="cursor-pointer text-[14px] font-semibold text-acuity-text">Read the agreement</summary>
              <div className="mt-3 flex flex-col gap-4">
                {AGREEMENT_SECTIONS.map((s) => (
                  <div key={s.title}>
                    <div className="text-[14px] font-semibold">{s.title}</div>
                    <p className="mt-1 text-[14px] leading-[1.5] text-acuity-text-sec">{s.body}</p>
                  </div>
                ))}
              </div>
            </details>
            {!agreed && (
              <div className="mt-4">
                <AcceptAgreementButton />
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Post kit */}
      <Section eyebrow="Post kit" title="What to post">
        <h3 className="text-[15px] font-semibold">Caption ideas</h3>
        <p className="mt-1 text-[13px] text-acuity-text-ter">Rewrite them in your own words.</p>
        <div className="mt-3 flex flex-col gap-3">
          {captions.map((c, i) => (
            <div key={i} className="rounded-acuity-md border border-acuity-line bg-acuity-bg-sub p-4">
              <p className="whitespace-pre-line text-[14px] leading-[1.5] text-acuity-text-sec">{c}</p>
              <div className="mt-3">
                <CopyButton text={c} label="Copy caption" />
              </div>
            </div>
          ))}
        </div>

        {brief && (
          <>
            <h3 className="mt-6 text-[15px] font-semibold">Your brief</h3>
            <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-acuity-md border border-acuity-line bg-acuity-bg-inset p-4 font-sans text-[14px] leading-[1.5] text-acuity-text-sec">
              {brief.body}
            </pre>
          </>
        )}

        <p className="mt-6 text-[14px] text-acuity-text-sec">
          Need logos or app screenshots? Ask Keenan for the brand kit by replying to any of our emails.
        </p>
      </Section>
    </Shell>
  );
}
