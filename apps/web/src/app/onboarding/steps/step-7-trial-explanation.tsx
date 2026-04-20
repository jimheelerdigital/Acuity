/**
 * Step 7 — How the trial works.
 *
 * Sets expectation for the 14-day trial + Day 14 Life Audit + Month 2
 * transition. Tone comes from IMPLEMENTATION_PLAN_PAYWALL §4.2 —
 * continuation-not-gate language, the paywall is soft, your entries
 * and insights remain visible regardless of whether you subscribe.
 *
 * Deliberately does NOT surface pricing. Pricing lives on /upgrade.
 * This screen belongs to the trial; naming a dollar amount now would
 * prime the user to evaluate before they've even recorded once.
 *
 * No interaction. The user reads; they hit Continue from the shell.
 * Back-nav works via the shell; onboarding_step_completed fires on
 * advance.
 */
export function Step7TrialExplanation() {
  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        How the trial works.
      </h1>

      <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Fourteen days on us. Talk at it whenever. Miss a few nights —
        that&rsquo;s fine too. We&rsquo;re not trying to trap you in a streak.
      </p>

      {/* Three-beat timeline: today / day 14 / beyond. Each one a small
          card with a subtle left border, reading like a receipt. */}
      <div className="mt-10 space-y-4">
        <TimelineRow
          marker="Today"
          title="You start recording."
          body="Night one — thirty seconds is fine. Tomorrow the dashboard will already have a little bit of the shape of you on it."
        />
        <TimelineRow
          marker="Day 14"
          title="You get a Life Audit."
          body="A long-form letter. Not a summary. Written from your own entries by our flagship model — the one we save for the moments that deserve the extra thought. Names the pattern that showed up. Hard to produce any other way than by sitting with two weeks of honest notes."
        />
        <TimelineRow
          marker="After"
          title="The pattern either deepens or breaks."
          body="You decide then. Everything you&rsquo;ve recorded stays visible to you either way. Subscriptions keep new weekly reports + new insights flowing; without one, the dashboard freezes where it is. No cliff."
          dim
        />
      </div>
    </div>
  );
}

function TimelineRow({
  marker,
  title,
  body,
  dim = false,
}: {
  marker: string;
  title: string;
  body: string;
  dim?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white dark:bg-[#1E1E2E] p-4 shadow-sm transition-shadow hover:shadow-md ${
        dim ? "border-zinc-200 dark:border-white/10" : "border-zinc-200 dark:border-white/10"
      }`}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-widest ${
          dim ? "text-zinc-400 dark:text-zinc-500" : "text-[#7C5CFC]"
        }`}
      >
        {marker}
      </p>
      <p className="mt-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{body}</p>
    </div>
  );
}
