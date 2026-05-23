import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { TrackCompleteRegistration } from "@/components/meta-pixel-events";
import { SyncAttribution } from "./sync-attribution";
import { FirstDebriefFlow } from "./first-debrief-flow";
import { TrySessionClaimer } from "./try-session-claimer";

export const metadata: Metadata = {
  title: "You're in — Your First Debrief",
  robots: { index: false, follow: false },
};

export default async function SignupSuccessPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const force = searchParams.force === "1";
  const fromTry = searchParams.from_try === "1";

  // Check for a pending try session cookie — if present, the user just
  // signed up after doing a "Try it now" recording. The TrySessionClaimer
  // client component will POST to /api/try-recording/claim to convert it
  // into a real Entry, then show the celebration + download flow.
  const cookieStore = cookies();
  const trySessionToken = cookieStore.get("acuity_try_session")?.value ?? null;
  const hasPendingTry = fromTry && !!trySessionToken;

  // Check if user has already completed a recording — if so, skip
  // straight to the download/CTA screen. ?force=1 bypasses this for testing.
  let skipToDownload = false;
  let userId: string | null = null;

  if (!force) {
    try {
      const session = await getServerSession(getAuthOptions());
      if (session?.user?.id) {
        userId = session.user.id;
        const { prisma } = await import("@/lib/prisma");
        const existing = await prisma.entry.count({
          where: { userId: session.user.id, status: "COMPLETE" },
        });
        if (existing > 0) skipToDownload = true;
      }
    } catch {
      // If auth or DB fails, default to showing the record flow
    }
  }

  // If the user came from "Try it now", claim the session and skip
  // straight to the celebration → download flow.
  if (hasPendingTry) {
    return (
      <>
        <TrackCompleteRegistration />
        <SyncAttribution />
        <TrySessionClaimer />
      </>
    );
  }

  return (
    <>
      <TrackCompleteRegistration />
      <SyncAttribution />
      <FirstDebriefFlow skipToDownload={skipToDownload} userId={userId} />
    </>
  );
}
