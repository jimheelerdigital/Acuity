/**
 * /free-week?t=<signed token> — the button in the free_week_offer /
 * free_week_followup emails (lib/free-week.ts).
 *
 * The GET only shows the offer. Starting the week is a form POST (server
 * action), so mail scanners that pre-open links can't start someone's
 * 7-day clock before she has seen it. The token identifies the account, so
 * no sign-in is needed; after claiming, "Open Ripple, signed in" uses the
 * one-tap app link (lib/app-access.ts).
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { claimFreeWeek, freeWeekState, verifyFreeWeekToken } from "@/lib/free-week";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your free week of Ripple Pro", robots: { index: false, follow: false } };

async function startFreeWeek(formData: FormData) {
  "use server";
  const token = String(formData.get("t") ?? "");
  const userId = verifyFreeWeekToken(token);
  if (userId) await claimFreeWeek(userId);
  redirect(`/free-week?t=${encodeURIComponent(token)}`);
}

const btnPrimary =
  "block w-full rounded-full bg-acuity-primary px-6 py-3.5 text-center text-[15px] font-semibold text-white transition active:scale-[0.98]";
const btnSecondary =
  "block w-full rounded-full border border-zinc-200 dark:border-white/10 px-6 py-3.5 text-center text-[15px] font-semibold text-zinc-900 dark:text-zinc-50";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-[22px] border border-zinc-200 dark:border-white/10 bg-white dark:bg-acuity-card-bg p-8 shadow-lg animate-fade-in">
        {children}
      </div>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="mb-3 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{children}</h1>;
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">{children}</p>;
}

export default async function FreeWeekPage({ searchParams }: { searchParams: { t?: string } }) {
  const token = searchParams.t ?? "";
  const userId = verifyFreeWeekToken(token);

  if (!userId) {
    return (
      <Card>
        <Title>This link has expired</Title>
        <Body>Sign in to Ripple and you&apos;ll find your account where you left it.</Body>
        <Link href="/auth/signin" className={btnPrimary}>Sign in</Link>
      </Card>
    );
  }

  const state = await freeWeekState(userId);

  if (state === "eligible") {
    return (
      <Card>
        <Title>A free week of Ripple Pro</Title>
        <Body>
          Seven days of everything Pro does: the to-do list pulled from what you say, habit tracking, and the
          patterns that keep coming up in your week.
        </Body>
        <Body>No card, nothing to cancel. When the week ends you go back to the free plan unless you choose to keep Pro.</Body>
        <form action={startFreeWeek} className="mt-6">
          <input type="hidden" name="t" value={token} />
          <button type="submit" className={btnPrimary}>Start my free week</button>
        </form>
      </Card>
    );
  }

  if (state === "already_claimed" || state === "already_pro") {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, subscriptionStatus: true, trialEndsAt: true },
    });
    let signInUrl: string | null = null;
    if (user?.email) {
      const { createAppSignInUrl } = await import("@/lib/app-access");
      signInUrl = await createAppSignInUrl(user.email).catch(() => null);
    }
    const onTrial = user?.subscriptionStatus === "TRIAL" && user.trialEndsAt && user.trialEndsAt > new Date();
    const until = onTrial
      ? user!.trialEndsAt!.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
      : null;

    return (
      <Card>
        {state === "already_pro" ? (
          <>
            <Title>You already have Pro</Title>
            <Body>Everything is on. Open Ripple and say what&apos;s on your plate.</Body>
          </>
        ) : onTrial ? (
          <>
            <Title>Your free week of Pro is on</Title>
            <Body>It runs until {until}. Open Ripple and say what&apos;s on your plate. Pro turns it into your list and tracks the habits you mention.</Body>
            <Body>On your phone, tap the button below and Ripple opens already signed in. No password.</Body>
          </>
        ) : (
          <>
            <Title>Your free week has ended</Title>
            <Body>Your account and everything you recorded are still there. You can keep Pro from inside the app.</Body>
          </>
        )}
        <div className="mt-6 space-y-3">
          {signInUrl && <a href={signInUrl} className={btnPrimary}>Open Ripple, signed in</a>}
          <Link href="/home" className={btnSecondary}>Use Ripple on the web</Link>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Title>This offer isn&apos;t available on this account</Title>
      <Body>The free week is for new accounts that haven&apos;t had a trial yet. Your account is still here.</Body>
      <Link href="/home" className={btnPrimary}>Go to Ripple</Link>
    </Card>
  );
}
