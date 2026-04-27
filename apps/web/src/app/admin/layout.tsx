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
    // Wrapper carries the dark bg so the topbar's translucent backdrop-
    // blur lands on dark even before child page paint. We do NOT set
    // min-h-screen here because the child admin-dashboard page already
    // does — stacking both would make the page exceed viewport by 68px.
    <div className="bg-[#0A0A0F]">
      <AdminTopbar />
      {children}
    </div>
  );
}
