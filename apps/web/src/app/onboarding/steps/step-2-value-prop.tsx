// TODO: tight value prop — what the user actually gets from this
// ritual. Match the tone of the landing page (components/landing.tsx)
// but condensed. Three bullets max. NO feature list — describe the
// experience. Placeholder copy below is a starting point, not final.
// Consider: visual showing the core loop (record → extraction →
// dashboard) once a designer touches this.
export function Step2ValueProp() {
  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        Here&rsquo;s the loop.
      </h1>
      <p className="mt-3 text-base text-zinc-500">
        What you do, and what Acuity does while you sleep.
      </p>

      <ul className="mt-8 space-y-4">
        <li className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-semibold text-zinc-900">
            You talk for 60 seconds.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            About your day — your worries, wins, what you&rsquo;re chewing on. No
            structure. No prompt. Just whatever&rsquo;s in your head.
          </p>
        </li>
        <li className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-semibold text-zinc-900">
            AI extracts the signal.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Tasks, goals, mood, recurring themes — pulled out of your own
            words and organized into a dashboard while you sleep.
          </p>
        </li>
        <li className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-semibold text-zinc-900">
            You see the shape of your life.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Weekly reports. Life Matrix scores across six areas. Pattern
            detection that catches what you can&rsquo;t see from the inside.
          </p>
        </li>
      </ul>
    </div>
  );
}
