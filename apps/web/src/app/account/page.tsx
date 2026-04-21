import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";

import AccountClient from "./account-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Account — Acuity",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
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
    />
  );
}
