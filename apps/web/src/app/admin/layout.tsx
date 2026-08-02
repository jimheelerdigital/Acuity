import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";

import { AdminTopbar } from "./admin-topbar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/admin");
  }

  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    redirect("/dashboard");
  }

  return (
    // data-theme="dark" forces the Ripple dark token set for the whole
    // admin subtree (tokens.css scopes dark vars to any [data-theme=
    // "dark"] element), independent of the user's app theme. We do NOT
    // set min-h-screen here because the child admin-dashboard page
    // already does — stacking both would exceed viewport by 68px.
    <div data-theme="dark" className="bg-acuity-bg text-acuity-text">
      <AdminTopbar />
      {children}
    </div>
  );
}
