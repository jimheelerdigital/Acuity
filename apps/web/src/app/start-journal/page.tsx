import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FunnelV9 } from "@/components/funnel-v9";
import { findAdMatch } from "@/lib/funnel-ad-match";
import { isJournalSplitOn, journalArmScript, journalControlUrl, JSPLIT_COOKIE, pickJournalArm } from "@/lib/journal-split";

export const metadata: Metadata = {
  title: "Start Free Trial — Ripple",
  description: "See what Ripple would keep track of for you. No planner to keep up.",
  robots: { index: false, follow: false },
};

/**
 * /start-journal — the "journals and planners have failed you" funnel for
 * the Planners ads (2026-10-31, per Keenan). Same engine as /start-test with
 * its own questions, the new-app-design preview and the 3-screen paywall
 * (lib/funnel-v9-config.ts → JOURNAL_V9). Split 50/50 against /start-test
 * while the funnel_journal_split flag is on (lib/journal-split.ts).
 */
export default async function StartJournalPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const step = typeof searchParams.step === "string" ? searchParams.step : null;
  let inSplit = false;
  if (!step && (await isJournalSplitOn())) {
    const arm = pickJournalArm(cookies().get(JSPLIT_COOKIE)?.value);
    if (arm === "control") redirect(journalControlUrl(searchParams));
    inSplit = true;
  }
  const adMatch = await findAdMatch(searchParams.utm_content);
  return (
    <>
      {/* Fraunces: the redesign's heading face (sunrise theme). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" />
      {inSplit ? <script dangerouslySetInnerHTML={{ __html: journalArmScript() }} /> : null}
      {/* ?for=men: his wording and portrait (2026-11-03). */}
      <FunnelV9 brand={searchParams.for === "men" ? "journal_m" : "journal"} adMatch={adMatch} />
    </>
  );
}
