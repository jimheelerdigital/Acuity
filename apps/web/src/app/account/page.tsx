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

  return (
    <AccountClient
      email={session.user.email}
      name={session.user.name ?? null}
    />
  );
}
