/**
 * /creator-desk — narrow page for adding creators who said yes (2026-10-26).
 * Only add + resend invite; no money, ledger, customer data or ads. Access:
 * lib/creators/desk.ts (listed emails + full admins).
 */
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AGREEMENT_VERSION } from "@/lib/creators/config";
import { getAuthOptions } from "@/lib/auth";

import { AddCreatorForm, ResendInvite } from "./desk-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Creator desk", robots: { index: false, follow: false } };

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${ok ? "bg-acuity-good-soft text-acuity-good" : "bg-white/5 text-acuity-text-ter"}`}>
      {children}
    </span>
  );
}

export default async function CreatorDesk() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/creator-desk");
  const { canUseCreatorDesk } = await import("@/lib/creators/desk");
  if (!(await canUseCreatorDesk(session.user.id))) redirect("/");

  const { prisma } = await import("@/lib/prisma");
  const creators = await prisma.ugcCreator.findMany({
    where: { referralCode: { not: null } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true, handle: true, firstName: true, displayName: true, email: true, referralCode: true,
      dashboardInvitedAt: true, agreementAcceptedAt: true, agreementVersion: true, stripePayoutsEnabled: true, paypalEmail: true, userId: true,
    },
  });

  return (
    <div data-theme="dark" className="min-h-screen bg-acuity-bg px-4 py-10 text-acuity-text sm:px-6">
      <main className="mx-auto flex max-w-3xl flex-col gap-8">
        <header>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">Ripple</p>
          <h1 className="mt-2 font-display text-[32px] font-extrabold tracking-[-0.8px]">Creator desk</h1>
          <p className="mt-2 text-[15px] text-acuity-text-sec">
            Add creators who said yes. Each one gets their code, a dashboard invite by email, and free Ripple Pro when they sign up with the same email.
          </p>
        </header>

        <section className="rounded-[22px] border border-acuity-line bg-acuity-card-bg p-5">
          <h2 className="mb-4 text-[17px] font-semibold">Add a creator</h2>
          <AddCreatorForm />
        </section>

        <section>
          <h2 className="mb-3 text-[17px] font-semibold">Creators in the program ({creators.length})</h2>
          <div className="flex flex-col gap-2">
            {creators.map((c) => (
              <div key={c.id} data-handle={c.handle} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] border border-acuity-line bg-acuity-card-bg px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.firstName ?? c.displayName ?? `@${c.handle}`} <span className="font-normal text-acuity-text-ter">@{c.handle}</span></p>
                  <p className="text-[13px] text-acuity-text-ter">{c.email ?? "no email"} · code <span className="font-mono text-acuity-text">{c.referralCode}</span></p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill ok={Boolean(c.dashboardInvitedAt)}>{c.dashboardInvitedAt ? "Invited" : "Not invited"}</Pill>
                  <Pill ok={Boolean(c.agreementAcceptedAt && c.agreementVersion === AGREEMENT_VERSION)}>Agreement</Pill>
                  <Pill ok={c.stripePayoutsEnabled || Boolean(c.paypalEmail)}>Payout set up</Pill>
                  <Pill ok={Boolean(c.userId)}>Ripple Pro</Pill>
                  {c.email && <ResendInvite creatorId={c.id} />}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
