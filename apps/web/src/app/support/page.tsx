import Link from "next/link";

export const metadata = {
  title: "Support · Acuity",
  description:
    "Get help with Acuity — contact support, read our privacy policy and terms of service.",
  robots: { index: true, follow: true },
};

/**
 * Support page. App Store Connect requires a live "Support URL" on
 * every app record; this is it. Minimal-but-real FAQs so App Review
 * doesn't flag the page as placeholder copy.
 *
 * Styling mirrors the marketing site's dark aesthetic (landing.tsx)
 * for public / unauth users — the page is indexable, so the marketing
 * register is the right one, not the in-app light/dark toggle. The
 * `dark:` variants are still present for consistency but the base
 * classes are the dark palette.
 */
export default function SupportPage() {
  return (
    <div className="min-h-screen bg-[#13131F] text-zinc-100">
      <main className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-[#A0A0B8] transition hover:text-white"
        >
          ← Back to Acuity
        </Link>

        <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl">
          Support
        </h1>

        <p className="mt-6 text-base leading-relaxed text-[#A0A0B8]">
          Need help? Email{" "}
          <a
            href="mailto:jim@heelerdigital.com"
            className="text-[#A78BFA] underline-offset-4 hover:underline"
          >
            jim@heelerdigital.com
          </a>
          . We aim to respond within 24&ndash;48 hours, usually sooner.
        </p>

        <section className="mt-12">
          <h2 className="text-lg font-semibold text-white">
            Common questions
          </h2>
          <div className="mt-6 space-y-6">
            <Faq
              q="How do I cancel my subscription?"
              a={
                <>
                  Subscriptions are managed through your Stripe billing
                  portal, accessible from the{" "}
                  <Link
                    href="/upgrade"
                    className="text-[#A78BFA] hover:underline"
                  >
                    account page
                  </Link>
                  . Cancel any time; you keep access through the end of
                  your billing period.
                </>
              }
            />
            <Faq
              q="How do I delete my account?"
              a={
                <>
                  From the iOS app, tap Profile → Delete account. From the
                  web, the same option lives under your{" "}
                  <Link
                    href="/account"
                    className="text-[#A78BFA] hover:underline"
                  >
                    account
                  </Link>{" "}
                  menu. This permanently erases your entries, transcripts,
                  and extracted data. Stripe records are retained per US
                  tax law for seven years in redacted form.
                </>
              }
            />
            <Faq
              q="I can't get the microphone to work on iOS."
              a={
                <>
                  iOS microphone permission lives in{" "}
                  <span className="font-medium text-zinc-100">
                    Settings → Acuity → Microphone
                  </span>
                  . If you denied it on first launch, toggle it on there,
                  then reopen the app. On Safari (web), the permission
                  control is in the URL bar.
                </>
              }
            />
            <Faq
              q="Is my data used to train AI models?"
              a={
                <>
                  No. Your recordings and transcripts are processed by
                  Anthropic (Claude) and OpenAI (Whisper) under no-training
                  contracts. Audio files are deleted from our servers once
                  transcription completes. Full detail in our{" "}
                  <Link
                    href="/privacy"
                    className="text-[#A78BFA] hover:underline"
                  >
                    privacy policy
                  </Link>
                  .
                </>
              }
            />
            <Faq
              q="What counts as personal or sensitive data?"
              a={
                <>
                  Voice recordings (discarded after transcription),
                  transcripts, extracted insights (mood, themes, tasks,
                  goals), account email + name, and PostHog usage
                  analytics. We don&rsquo;t track location, contacts, or
                  device identifiers beyond standard web/app analytics.
                </>
              }
            />
          </div>
        </section>

        <section className="mt-12 rounded-lg border border-amber-500/20 bg-amber-500/5 p-5 text-sm leading-relaxed text-amber-100/90">
          <p className="font-semibold text-amber-100">In crisis?</p>
          <p className="mt-1 text-amber-100/80">
            Acuity is a journaling tool, not a substitute for professional
            support. If you or someone you know is in crisis, please reach out.{" "}
            <Link
              href="/support/crisis"
              className="text-[#A78BFA] hover:underline"
            >
              Crisis resources →
            </Link>
          </p>
        </section>

        <section className="mt-12 border-t border-white/10 pt-8">
          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href="/privacy"
              className="text-[#A0A0B8] transition hover:text-white"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-[#A0A0B8] transition hover:text-white"
            >
              Terms of Service
            </Link>
            <Link
              href="/support/crisis"
              className="text-[#A0A0B8] transition hover:text-white"
            >
              Crisis resources
            </Link>
            <a
              href="mailto:jim@heelerdigital.com"
              className="text-[#A0A0B8] transition hover:text-white"
            >
              Email support
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-white">{q}</p>
      <div className="mt-1.5 text-sm leading-relaxed text-[#A0A0B8]">{a}</div>
    </div>
  );
}
