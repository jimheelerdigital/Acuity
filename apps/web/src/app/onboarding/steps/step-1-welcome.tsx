/**
 * Step 1 — Welcome.
 *
 * Intent: warm handshake before the product pitch (that's step 2).
 * Signals that the flow is short (≈ 90 seconds) and that the
 * questions have a purpose (shape what Acuity pays attention to).
 * No captured data, no interaction beyond the shell's Continue
 * button. onboarding_started fires on mount from the shell.
 *
 * Tone reference: landing hero "Brain dump daily. Get your life back."
 * Short sentences. No exclamation marks. Calm, not peppy.
 */
export function Step1Welcome() {
  return (
    <div className="flex flex-col items-start">
      {/* Subtle brand bug — one small moment of delight without a
          logo animation library. The violet-500 ring matches the
          landing page accent + the progress dots above. */}
      <div className="mb-8 h-10 w-10 rounded-full border-2 border-[#7C5CFC] bg-white dark:bg-[#1E1E2E] shadow-sm" />

      <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
        You&rsquo;re in.
      </h1>

      <p className="mt-5 text-base leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-lg">
        Before your first recording, a short walk-through. About ninety
        seconds. Seven questions, most of them quick.
      </p>

      <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-lg">
        The answers shape what Acuity pays attention to on your behalf —
        your baseline mood, the areas of your life you&rsquo;re here to
        work on, how often you think you&rsquo;ll actually record.
      </p>

      <p className="mt-6 text-sm text-zinc-400 dark:text-zinc-500">
        You can skip anything. You can come back to it later.
      </p>
    </div>
  );
}
