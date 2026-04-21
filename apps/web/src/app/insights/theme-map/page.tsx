import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";

import { ThemeMapClient } from "./theme-map-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Theme Map — Acuity",
  robots: { index: false, follow: false },
};

/**
 * Theme Evolution Map — force-directed graph of the user's extracted
 * themes across a selectable time window. Server component owns the
 * session check; the client component owns all interactivity
 * (dynamic() loaded force-graph-2d touches canvas, can't SSR).
 */
export default async function ThemeMapPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/insights/theme-map");

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-6 py-10">
        <ThemeMapClient />
      </main>
    </div>
  );
}
