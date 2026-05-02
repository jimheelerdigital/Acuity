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
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
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
    },
  });

  // Slice C5b — drives the IntegrationsSection paywall variant.
  // Uses the existing user select (no extra round-trip; no C3 calendar
  // columns referenced — those would P2022 against prod until the
  // db push lands).
  const isProLocked = user
    ? entitlementsFor({
        subscriptionStatus: user.subscriptionStatus,
        trialEndsAt: user.trialEndsAt,
      }).canExtractEntries === false
    : false;

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
      justUpgraded={searchParams?.upgrade === "success"}
    />
  );
}
