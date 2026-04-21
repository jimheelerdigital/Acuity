import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";

import { AskPastClient } from "./ask-past-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ask your past self — Acuity",
  robots: { index: false, follow: false },
};

export default async function AskPastPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/insights/ask");

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-2xl px-6 py-10">
        <AskPastClient />
      </main>
    </div>
  );
}
