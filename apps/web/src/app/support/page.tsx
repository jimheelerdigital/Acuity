import Link from "next/link";

export const metadata = {
  title: "Support · Acuity",
  description:
    "Get help with Acuity — contact support, read our privacy policy and terms of service.",
  robots: { index: true, follow: true },
};

/**
 * Support page stub. Created for App Store Connect submission, which
 * requires a live "Support URL" on every app record. Minimal-but-real
 * content so App Review doesn't flag it as placeholder copy.
 *
 * Flesh this out when support volume actually materializes — FAQ,
 * known issues, troubleshooting steps, link to a help-desk if we
 * stand one up.
 */
export default function SupportPage() {
  return (
    <div className="min-h-screen bg-[#0D0D0F] text-zinc-100 px-6 py-16">
      <main className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="text-sm text-zinc-400 hover:text-zinc-200 transition"
        >
          ← Back to Acuity
        </Link>

        <h1 className="mt-8 text-4xl font-bold tracking-tight">Support</h1>

        <p className="mt-6 text-base leading-relaxed text-zinc-300">
          Need help? Email{" "}
          <a
            href="mailto:support@heelerdigital.com"
            className="text-violet-400 underline-offset-4 hover:underline"
          >
            support@heelerdigital.com
          </a>
          . We aim to respond within 48 hours, usually sooner.
        </p>

        <section className="mt-12">
          <h2 className="text-lg font-semibold text-zinc-100">
            Common questions
          </h2>
          <div className="mt-4 space-y-5 text-sm leading-relaxed text-zinc-400">
            <div>
              <p className="font-semibold text-zinc-200">
                How do I cancel my subscription?
              </p>
              <p className="mt-1">
                Subscriptions are managed through your Stripe billing
                portal, accessible from the{" "}
                <Link
                  href="/upgrade"
                  className="text-violet-400 hover:underline"
                >
                  account page
                </Link>
                . Cancel any time; you keep access through the end of
                your billing period.
              </p>
            </div>
            <div>
              <p className="font-semibold text-zinc-200">
                How do I delete my account?
              </p>
              <p className="mt-1">
                From the iOS app, tap Profile → Delete account. From
                the web, the same option lives under your account menu.
                This permanently erases your entries, transcripts, and
                extracted data; Stripe records are retained per US tax
                law for seven years in redacted form.
              </p>
            </div>
            <div>
              <p className="font-semibold text-zinc-200">
                I can&rsquo;t get the microphone to work on iOS.
              </p>
              <p className="mt-1">
                iOS microphone permission lives in Settings → Acuity →
                Microphone. If you denied it on first launch, toggle
                it on there, then reopen the app. On Safari (web), the
                permission control is in the URL bar.
              </p>
            </div>
            <div>
              <p className="font-semibold text-zinc-200">
                Is my data used to train AI models?
              </p>
              <p className="mt-1">
                No. Your recordings and transcripts are processed by
                our transcription and analysis providers under
                no-training contracts. Full detail in our{" "}
                <Link
                  href="/privacy"
                  className="text-violet-400 hover:underline"
                >
                  privacy policy
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 border-t border-zinc-800 pt-8">
          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href="/privacy"
              className="text-zinc-400 hover:text-zinc-200 transition"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-zinc-400 hover:text-zinc-200 transition"
            >
              Terms of Service
            </Link>
            <a
              href="mailto:support@heelerdigital.com"
              className="text-zinc-400 hover:text-zinc-200 transition"
            >
              Email support
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
