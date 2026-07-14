/**
 * Step 1 — Welcome.
 *
 * Intent: warm handshake before the product pitch (that's step 2).
 * Signals that the flow is short (a couple of minutes) and that the
 * questions have a purpose (shape what Ripple pays attention to).
 * No captured data, no interaction beyond the shell's Continue
 * button. onboarding_started fires on mount from the shell.
 *
 * Tone reference: landing hero "Debrief daily. See your life clearly."
 * Short sentences. No exclamation marks. Calm, not peppy.
 */
export function Step1Welcome() {
  return (
    <div className="acuity-fade-up flex flex-col items-start">
      <div className="mb-8 h-10 w-10 rounded-full border-2 border-acuity-primary bg-acuity-card-bg shadow-acuity-soft" />

      <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-acuity-text sm:text-5xl">
        You&rsquo;re in.
      </h1>

      <p className="mt-5 text-base leading-relaxed text-acuity-text-sec sm:text-lg">
        Before your first recording, a short walk-through. Just a couple of minutes. Seven questions, most of them quick.
      </p>

      <p className="mt-4 text-base leading-relaxed text-acuity-text-sec sm:text-lg">
        The answers shape what Ripple pays attention to on your behalf —
        your baseline mood, the areas of your life you&rsquo;re here to
        work on, how often you think you&rsquo;ll actually record.
      </p>

      <p className="mt-6 text-sm text-acuity-text-ter">
        You can skip anything. You can come back to it later.
      </p>
    </div>
  );
}
