import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import type { StateOfMeContent } from "@acuity/shared";

import { StateOfMeDetail } from "./detail";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "State of Me — Acuity",
  robots: { index: false, follow: false },
};

export default async function StateOfMeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/insights/state-of-me/${params.id}`);
  }

  const { prisma } = await import("@/lib/prisma");
  const report = await prisma.stateOfMeReport.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!report) notFound();

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link
          href="/insights/state-of-me"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition"
        >
          ← All reports
        </Link>
        <StateOfMeDetail
          reportId={report.id}
          periodStart={report.periodStart.toISOString()}
          periodEnd={report.periodEnd.toISOString()}
          status={report.status}
          degraded={report.degraded}
          errorMessage={report.errorMessage}
          content={report.content as unknown as StateOfMeContent | Record<string, never>}
          publicShareId={report.publicShareId}
          publicShareExpiresAt={report.publicShareExpiresAt?.toISOString() ?? null}
        />
      </main>
    </div>
  );
}
