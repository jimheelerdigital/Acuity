import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { TrackCompleteRegistration } from "@/components/meta-pixel-events";
import { SyncAttribution } from "./sync-attribution";
import { FirstDebriefFlow } from "./first-debrief-flow";

export const metadata: Metadata = {
  title: "You're in — Your First Debrief",
  robots: { index: false, follow: false },
};

export default async function SignupSuccessPage() {
  // Check if user has already completed a recording — if so, skip
  // straight to the download/CTA screen.
  let skipToDownload = false;

  try {
    const session = await getServerSession(getAuthOptions());
    if (session?.user?.id) {
      const { prisma } = await import("@/lib/prisma");
      const existing = await prisma.entry.count({
        where: { userId: session.user.id, status: "COMPLETE" },
      });
      if (existing > 0) skipToDownload = true;
    }
  } catch {
    // If auth or DB fails, default to showing the record flow
  }

  return (
    <>
      <TrackCompleteRegistration />
      <SyncAttribution />
      <FirstDebriefFlow skipToDownload={skipToDownload} />
    </>
  );
}
