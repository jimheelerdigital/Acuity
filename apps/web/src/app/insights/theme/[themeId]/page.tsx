import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";

import { ThemeDetailClient } from "./theme-detail-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Theme — Acuity",
  robots: { index: false, follow: false },
};

export default async function ThemeDetailPage({
  params,
}: {
  params: { themeId: string };
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id)
    redirect(`/auth/signin?callbackUrl=/insights/theme/${params.themeId}`);

  // Ownership check + existence. The client fetches the full payload;
  // this is a server-side gate so a forged URL gets 404'd before the
  // API exposes any data.
  const { prisma } = await import("@/lib/prisma");
  const theme = await prisma.theme.findFirst({
    where: { id: params.themeId, userId: session.user.id },
    select: { id: true },
  });
  if (!theme) notFound();

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-2xl px-6 py-10 animate-fade-in">
        <Link
          href="/insights/theme-map"
          className="mb-4 inline-block text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition"
        >
          ← Theme Map
        </Link>
        <ThemeDetailClient themeId={params.themeId} />
      </main>
    </div>
  );
}
