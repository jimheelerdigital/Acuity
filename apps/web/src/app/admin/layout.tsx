import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";

import { AdminTopbar } from "./admin-topbar";

import "./admin-neo.css";

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
    // data-admin-neo layers the 2026-09 "Neo" skin on top (admin-neo.css
    // overrides the acuity-* vars inside this subtree only). The
    // .neo-shell-bg div is the fixed grid/aurora atmosphere; content is
    // wrapped in a relative z-[1] div so it stacks above it.
    <div data-theme="dark" data-admin-neo className="bg-acuity-bg text-acuity-text">
      <div className="neo-shell-bg" aria-hidden />
      <div className="relative z-[1]">
        <AdminTopbar />
        {children}
      </div>
    </div>
  );
}
