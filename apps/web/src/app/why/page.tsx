/**
 * One-tap answer page for "Why wasn't Ripple for you?" (lib/cancel-feedback.ts).
 * Records the tapped reason on load, then offers an optional note.
 */
import { prisma } from "@/lib/prisma";
import { CANCEL_REASONS, reasonLabel, verifyWhyToken } from "@/lib/cancel-feedback";

import { WhyNote } from "./why-note";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thanks for telling us · Ripple", robots: { index: false } };

export default async function WhyPage({ searchParams }: { searchParams: { t?: string; r?: string } }) {
  const userId = verifyWhyToken(searchParams.t);
  const reason = CANCEL_REASONS.find((x) => x.id === searchParams.r)?.id ?? null;
  if (userId && reason) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (user) {
      // One answer per reason per person; tapping again doesn't double count.
      const dup = await prisma.onboardingEvent.findFirst({ where: { userId, event: "cancel_reason", value: reason }, select: { id: true } });
      if (!dup) await prisma.onboardingEvent.create({ data: { userId, event: "cancel_reason", value: reason } });
    }
  }
  const ok = !!(userId && reason);
  return (
    <main style={{ minHeight: "100vh", background: "#FBF8F6", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "64px 20px", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ maxWidth: 440, width: "100%", background: "#fff", borderRadius: 24, padding: 28, boxShadow: "0 6px 24px rgba(40,20,10,.06)" }}>
        <p style={{ color: "#E06B46", fontWeight: 700, letterSpacing: 0.4, fontSize: 13, margin: 0 }}>RIPPLE</p>
        <h1 style={{ fontSize: 24, lineHeight: 1.2, margin: "10px 0 8px", color: "#1a1a1a" }}>{ok ? "Thank you. That really helps." : "Thanks for stopping by"}</h1>
        {ok ? (
          <>
            <p style={{ color: "#555", fontSize: 15, lineHeight: 1.6, margin: "0 0 18px" }}>
              You said: <strong>{reasonLabel(reason!)}</strong>. If you have a minute, tell me a bit more. I read every one.
            </p>
            <WhyNote token={searchParams.t!} />
          </>
        ) : (
          <p style={{ color: "#555", fontSize: 15, lineHeight: 1.6 }}>This link didn&rsquo;t work, but you can always reply to the email instead.</p>
        )}
        <p style={{ color: "#999", fontSize: 13, marginTop: 22 }}>Keenan, founder of Ripple</p>
      </div>
    </main>
  );
}
