import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { BackButton } from "@/components/back-button";
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

  const { prisma } = await import("@/lib/prisma");
  const theme = await prisma.theme.findFirst({
    where: { id: params.themeId, userId: session.user.id },
    select: { id: true },
  });
  if (!theme) notFound();

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-2xl px-6 py-10 animate-fade-in">
        <BackButton className="mb-6" ariaLabel="Back to Theme Map" />
        <ThemeDetailClient themeId={params.themeId} />
      </main>
    </div>
  );
}
