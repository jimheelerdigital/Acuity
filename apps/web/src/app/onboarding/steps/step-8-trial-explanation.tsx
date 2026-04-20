// TODO: final step — set expectations for the trial + Day 14 Life
// Audit + Month 2 transition. Tone matches IMPLEMENTATION_PLAN_PAYWALL
// §4.2 (soft-transition framing, continuation-not-gate language).
// The user has read this page RIGHT before their first recording;
// what we say here shapes their expectations of what's coming.
//
// Do NOT surface pricing. Pricing belongs on /upgrade. This page
// belongs to the trial. The trial is 14 days AND the baseline for
// the rest of the journey.
//
// Consider a small illustration here (day 1 → day 14 → ∞ timeline).
// Post-design, probably.
export function Step8TrialExplanation() {
  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        One last thing.
      </h1>
      <p className="mt-4 text-base leading-relaxed text-zinc-500">
        You&rsquo;ve got fourteen days to find out whether this fits into your
        nights. Talk at it whenever. Miss a few days — that&rsquo;s fine too.
      </p>

      <div className="mt-8 rounded-2xl border border-violet-200 bg-violet-50/50 p-5">
        <p className="text-sm font-semibold text-zinc-900">
          At the end of the fourteen, you get a Life Audit.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          A long-form letter. Written from your own entries. Names the
          pattern that showed up. Hard to produce any other way than by
          sitting with two weeks of honest notes.
        </p>
      </div>

      <p className="mt-6 text-base leading-relaxed text-zinc-500">
        Month 2 is where the pattern either deepens or breaks — but that&rsquo;s
        a decision you can make then. For now: just the record.
      </p>

      <p className="mt-8 text-sm text-zinc-400">
        Hit Finish to go to your dashboard. The mic is waiting.
      </p>
    </div>
  );
}
