import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { entitlementsFor } from "@/lib/entitlements";

import AccountClient from "./account-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Account — Acuity",
  robots: { index: false, follow: false },
};

export default async function AccountPage({
  searchParams,
}: {
  /** Set by Stripe Checkout's success_url when the user completes
   *  checkout. Also carries `session_id={CHECKOUT_SESSION_ID}` for
   *  correlation; we don't need to read the session_id server-side,
   *  but it lives in the URL so the client could log it if needed.
   *  See apps/web/src/app/api/stripe/checkout/route.ts success_url
   *  for the source. */
  searchParams?: { upgrade?: string; session_id?: string };
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id || !session.user.email) {
    redirect("/auth/signin?callbackUrl=/account");
  }

  const { prisma } = await import("@/lib/prisma");
  const userId = session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      notificationTime: true,
      notificationDays: true,
      notificationsEnabled: true,
      subscriptionStatus: true,
      stripeCustomerId: true,
      stripeCurrentPeriodEnd: true,
      trialEndsAt: true,
      weeklyEmailEnabled: true,
      monthlyEmailEnabled: true,
      // Calendar fields — re-enabled in slice 5 now that prisma db
      // push has landed the C3 columns.
      calendarConnectedProvider: true,
      calendarConnectedAt: true,
      targetCalendarId: true,
      autoSendTasks: true,
      defaultEventDuration: true,
      // Backfill state — drives the /account "Process older entries"
      // button visibility + the in-flight indicator.
      backfillStartedAt: true,
      backfillCompletedAt: true,
    },
  });

  // Slice C5b — drives the IntegrationsSection paywall variant.
  const isProLocked = user
    ? entitlementsFor({
        subscriptionStatus: user.subscriptionStatus,
        trialEndsAt: user.trialEndsAt,
      }).canExtractEntries === false
    : false;

  // Slice 5 — count older-window backfill candidates so the
  // /account "Process older entries" button can render the live
  // remainder. Skipped for FREE users (the entire backfill flow
  // is canExtractEntries-gated). Single COUNT, runs alongside
  // the user fetch implicitly via the page render.
  let olderBackfillCount = 0;
  if (user && !isProLocked) {
    const { backfillWindowCutoff } = await import(
      "@/lib/backfill-extractions"
    );
    const cutoff = backfillWindowCutoff("older");
    olderBackfillCount = await prisma.entry.count({
      where: {
        userId,
        extracted: false,
        rawAnalysis: { equals: Prisma.DbNull },
        status: "COMPLETE",
        transcript: { not: null },
        createdAt: { lte: cutoff.lte! },
      },
    });
  }

  // Calendar connection summary — surfaces in IntegrationsSection's
  // connected-state card. Defensive: returns null if any of the
  // required fields are missing (e.g. never-connected user) so the
  // component renders the "Connect from iOS app" placeholder.
  const calendarConnection =
    user && user.calendarConnectedProvider
      ? {
          provider: user.calendarConnectedProvider,
          connectedAt: user.calendarConnectedAt,
          targetCalendarId: user.targetCalendarId,
          autoSendTasks: user.autoSendTasks,
          defaultEventDuration: user.defaultEventDuration,
        }
      : null;

  // Backfill in-flight indicator — Inngest's per-user concurrency=1
  // means a stale startedAt with no completedAt past the worst-case
  // run-time (~5min for the 60-day window) is the signal. We render
  // a "Processing…" affordance in account UI rather than letting
  // the user re-trigger a no-op.
  const backfillInFlight =
    !!user?.backfillStartedAt &&
    (!user.backfillCompletedAt ||
      user.backfillStartedAt.getTime() > user.backfillCompletedAt.getTime());

  return (
    <AccountClient
      email={session.user.email}
      name={session.user.name ?? null}
      notificationTime={user?.notificationTime ?? "21:00"}
      notificationDays={user?.notificationDays ?? [0, 1, 2, 3, 4, 5, 6]}
      notificationsEnabled={user?.notificationsEnabled ?? false}
      subscriptionStatus={user?.subscriptionStatus ?? "FREE"}
      hasStripeCustomer={Boolean(user?.stripeCustomerId)}
      periodEnd={user?.stripeCurrentPeriodEnd?.toISOString() ?? null}
      trialEndsAt={user?.trialEndsAt?.toISOString() ?? null}
      weeklyEmailEnabled={user?.weeklyEmailEnabled ?? true}
      monthlyEmailEnabled={user?.monthlyEmailEnabled ?? true}
      isProLocked={isProLocked}
      calendarConnection={calendarConnection}
      olderBackfillCount={olderBackfillCount}
      backfillInFlight={backfillInFlight}
      justUpgraded={searchParams?.upgrade === "success"}
    />
  );
}
