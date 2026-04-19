import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";

import AdminDashboardClient from "./admin-dashboard-client";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/admin/dashboard");
  }

  const { prisma } = await import("@/lib/prisma");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    redirect("/dashboard");
  }

  return <AdminDashboardClient />;
}
