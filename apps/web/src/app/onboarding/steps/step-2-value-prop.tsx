/**
 * Step 2 — Value prop.
 *
 * Three-beat description of the loop. Not a feature list, not a pitch.
 * Plain statements about what the user does and what Acuity does in
 * response. No exclamation marks, no marketing superlatives.
 *
 * The card visuals are simple geometric marks — a dot, a chevron
 * stack, a small bar chart — standing in for waveform / extraction /
 * dashboard. Keeps the page quiet and lets the copy carry it.
 */
export function Step2ValueProp() {
  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        Here&rsquo;s the loop.
      </h1>

      <p className="mt-3 text-base leading-relaxed text-zinc-500 dark:text-zinc-400">
        What you do. What Acuity does in return.
      </p>

      <div className="mt-10 space-y-3">
        <ValueCard
          mark={<WaveMark />}
          title="You talk for about a minute."
          body="Whatever&rsquo;s on your mind. Your day, what&rsquo;s bothering you, what you&rsquo;re chewing on. No prompt, no format. Just your own words."
        />
        <ValueCard
          mark={<ExtractMark />}
          title="Acuity pulls out the signal."
          body="Tasks, goals, mood, recurring themes — lifted from what you said and placed on your dashboard. Takes a minute or two."
        />
        <ValueCard
          mark={<ShapeMark />}
          title="You see the shape of your life."
          body="Weekly narrative. Life Matrix across six areas. Patterns that are hard to spot from the inside. Quietly building, one entry at a time."
        />
      </div>
    </div>
  );
}

function ValueCard({
  mark,
  title,
  body,
}: {
  mark: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4 shadow-sm transition hover:border-zinc-300 dark:hover:border-white/20 hover:shadow-md">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3F0FF] text-[#7C5CFC]">
        {mark}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{body}</p>
      </div>
    </div>
  );
}

function WaveMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="8" width="2" height="4" rx="1" fill="currentColor" />
      <rect x="7" y="5" width="2" height="10" rx="1" fill="currentColor" />
      <rect x="11" y="3" width="2" height="14" rx="1" fill="currentColor" />
      <rect x="15" y="7" width="2" height="6" rx="1" fill="currentColor" />
    </svg>
  );
}

function ExtractMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5 7l5 5 5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 12l5 5 5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  );
}

function ShapeMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="11" width="3" height="6" rx="0.5" fill="currentColor" />
      <rect x="8.5" y="7" width="3" height="10" rx="0.5" fill="currentColor" />
      <rect x="14" y="4" width="3" height="13" rx="0.5" fill="currentColor" />
    </svg>
  );
}
