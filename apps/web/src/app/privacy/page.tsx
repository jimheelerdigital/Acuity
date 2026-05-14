import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Acuity",
  description:
    "How Acuity collects, uses, stores, and protects your voice journal data.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "May 14, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] px-6 py-16 text-[#E5E5EC]">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-sm text-[#A0A0B8] transition hover:text-white"
        >
          &larr; Back to Acuity
        </Link>

        <h1 className="mt-8 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-[#A0A0B8]">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-10 text-[15px] leading-relaxed">
          <section>
            <p>
              Acuity is a nightly voice journal that uses AI to extract
              insights from your spoken brain dumps. This Privacy Policy
              explains what data we collect, why we collect it, who we share
              it with, how long we keep it, and how to exercise your
              privacy rights.
            </p>
            <p className="mt-4">
              The short version: your recordings and transcripts are yours.
              We use them only to give you the service you signed up for —
              transcription, AI extraction, weekly reports, life-area
              insights. We don&rsquo;t sell your data. We don&rsquo;t train
              models on it. You can export or delete it at any time.
            </p>
          </section>

          <Section id="data-we-collect" title="1. Data we collect">
            <p>To run Acuity, we collect the following:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-white">Account data.</strong> Email
                address (required for sign-in), display name and profile
                image (if provided via Google OAuth), timezone, reminder
                time preference.
              </li>
              <li>
                <strong className="text-white">Voice recordings.</strong>{" "}
                The audio you record in the app, up to 120 seconds per
                session.
              </li>
              <li>
                <strong className="text-white">Transcripts.</strong> The
                text version of each recording, generated automatically
                from your audio.
              </li>
              <li>
                <strong className="text-white">
                  AI-extracted structured data.
                </strong>{" "}
                Mood, energy level, themes, wins, blockers, tasks, goals,
                and life-area mentions, all derived from your transcript by
                Claude.
              </li>
              <li>
                <strong className="text-white">Subscription state.</strong>{" "}
                Your trial status and (if you subscribe) the
                Stripe-issued customer and subscription identifiers.
                Payment card details are handled directly by Stripe — we
                never see them.
              </li>
              <li>
                <strong className="text-white">Usage analytics.</strong>{" "}
                Anonymous-by-default product analytics (sign-in events,
                page views, recording counts) so we can understand which
                parts of the app are working.
              </li>
              <li>
                <strong className="text-white">Operational logs.</strong>{" "}
                Standard server-side request logs (timestamps, response
                codes, error stack traces) for debugging and security
                monitoring.
              </li>
            </ul>
          </Section>

          <Section id="why-we-collect" title="2. Why we collect it">
            <p>
              We collect each category of data only for purposes that the
              product itself makes obvious:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Account data &rarr; sign you in, send sign-in emails,
                schedule your reminders.
              </li>
              <li>
                Voice recordings &rarr; transcribe the audio. Stored so
                you can play back your own entries.
              </li>
              <li>
                Transcripts and AI-extracted data &rarr; populate the
                dashboard, the Life Matrix, and weekly reports.
              </li>
              <li>
                Subscription state &rarr; gate paid features and process
                renewals.
              </li>
              <li>
                Analytics &rarr; understand which features are used,
                detect outages, prioritise improvements.
              </li>
            </ul>
            <p className="mt-4">
              We do not use your recordings, transcripts, or extracted
              data to train AI models. We do not sell or rent your data
              to anyone.
            </p>
            <p className="mt-4">
              <strong className="text-white">
                Your consent to AI processing.
              </strong>{" "}
              On mobile (iOS), you are asked for explicit consent to
              AI processing during onboarding, before any voice data
              is uploaded. On the web, your continued use of the
              service after reading this policy constitutes your
              consent. You can withdraw consent at any time by
              deleting your account &mdash; this stops all future
              processing and removes your stored data per the
              retention rules in Section 7.
            </p>
          </Section>

          <Section id="subprocessors" title="3. Who we share data with">
            <p>
              We rely on a small set of vendors (&ldquo;subprocessors&rdquo;)
              to operate the service. Each subprocessor provides
              privacy and security protections at least equivalent to
              those described in this Policy under the terms of their
              respective data-processing agreements with us. Each one
              receives only the data it
              needs to do its job, and each one&rsquo;s privacy policy
              applies to the data they handle:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-white">Anthropic</strong> &mdash;
                processes your transcripts to extract structured data and
                generate weekly narratives via the Claude API.
                Subprocessor privacy policy:{" "}
                <a
                  href="https://www.anthropic.com/legal/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  anthropic.com/legal/privacy
                </a>
                .
              </li>
              <li>
                <strong className="text-white">OpenAI</strong> &mdash;
                transcribes your audio via the Whisper API.{" "}
                <a
                  href="https://openai.com/policies/privacy-policy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  openai.com/policies/privacy-policy
                </a>
                .
              </li>
              <li>
                <strong className="text-white">Supabase</strong> &mdash;
                hosts our Postgres database and stores your audio files.{" "}
                <a
                  href="https://supabase.com/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  supabase.com/privacy
                </a>
                .
              </li>
              <li>
                <strong className="text-white">Stripe</strong> &mdash;
                processes subscription payments on the web. Stripe
                handles your payment-card details directly; Acuity
                never receives them.{" "}
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  stripe.com/privacy
                </a>
                .
              </li>
              <li>
                <strong className="text-white">Apple</strong> &mdash;
                processes auto-renewing subscription payments made
                through our iOS app via Apple in-app purchase. The
                transaction is billed to your Apple ID; Acuity
                receives the transaction identifier and renewal state
                from Apple&rsquo;s App Store Server API but never
                receives your payment-card details.{" "}
                <a
                  href="https://www.apple.com/legal/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  apple.com/legal/privacy
                </a>
                .
              </li>
              <li>
                <strong className="text-white">Resend</strong> &mdash;
                delivers sign-in magic links and transactional email.{" "}
                <a
                  href="https://resend.com/legal/privacy-policy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  resend.com/legal/privacy-policy
                </a>
                .
              </li>
              <li>
                <strong className="text-white">Vercel</strong> &mdash;
                hosts and serves the web application.{" "}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  vercel.com/legal/privacy-policy
                </a>
                .
              </li>
              <li>
                <strong className="text-white">Inngest</strong> &mdash;
                orchestrates background jobs that run our AI pipeline.{" "}
                <a
                  href="https://www.inngest.com/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  inngest.com/privacy
                </a>
                .
              </li>
            </ul>
            <p className="mt-4">
              We will update this list when we add or remove subprocessors.
              We do not share data with any party for advertising,
              marketing, or model-training purposes.
            </p>
          </Section>

          <Section id="retention" title="4. How long we keep your data">
            <p>
              While your account is active, we keep your data for as long
              as you use the service. When you delete your account from{" "}
              <a
                href="/account"
                className="underline hover:text-white"
              >
                Account &rarr; Delete account
              </a>
              , we immediately and permanently hard-delete:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Your account record, sessions, and authentication tokens.
              </li>
              <li>
                All your entries, transcripts, tasks, goals, weekly
                reports, life audits, and life-map data.
              </li>
              <li>
                All audio files in our storage bucket under your user ID.
              </li>
              <li>
                Your row in our analytics provider (subject to that
                provider&rsquo;s deletion API).
              </li>
            </ul>
            <p className="mt-4">
              Deletion from our application database is immediate. We do
              not maintain our own backup snapshots that would preserve
              deleted data. Our infrastructure provider (Supabase)
              maintains automated database backups for service reliability;
              those backups age out per their provider-managed schedule
              and are not under our direct control.
            </p>
            <p className="mt-4">
              Stripe customer records, when applicable, are deleted via
              Stripe&rsquo;s API at the same time as the account
              deletion. Stripe may retain non-personal financial
              transaction history independently as legally required for
              tax and accounting purposes (typically 7 years).
            </p>
          </Section>

          <Section id="rights" title="5. Your rights">
            <p>
              Depending on where you live, you have one or more of the
              following rights over your personal data. Acuity honours
              these rights for all users regardless of jurisdiction:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-white">Right of access</strong>{" "}
                (GDPR Art. 15 / CCPA &sect;1798.100) &mdash; ask us what
                personal data we hold about you.
              </li>
              <li>
                <strong className="text-white">
                  Right to data portability
                </strong>{" "}
                (GDPR Art. 20) &mdash; receive a machine-readable export
                of your entries, transcripts, and extracted data.
              </li>
              <li>
                <strong className="text-white">Right to erasure</strong>{" "}
                (GDPR Art. 17 / CCPA &sect;1798.105) &mdash; have us
                delete your account and all associated data.
              </li>
              <li>
                <strong className="text-white">Right to rectification</strong>{" "}
                &mdash; correct inaccurate personal data we hold about
                you.
              </li>
              <li>
                <strong className="text-white">Right to object</strong>{" "}
                &mdash; opt out of any processing not strictly necessary
                to provide the service.
              </li>
              <li>
                <strong className="text-white">
                  Right to non-discrimination
                </strong>{" "}
                (CCPA) &mdash; we will not penalise you for exercising
                any of the above rights.
              </li>
            </ul>
            <p className="mt-4">
              To exercise any of these rights, email{" "}
              <a
                href="mailto:privacy@getacuity.io"
                className="underline hover:text-white"
              >
                privacy@getacuity.io
              </a>
              . We respond to verified requests within 30 days.
            </p>
          </Section>

          <Section id="children" title="6. Children's privacy">
            <p>
              Acuity is not intended for users under 13 years of age. We
              do not knowingly collect personal information from children
              under 13. If you believe a child under 13 has created an
              account, contact us at{" "}
              <a
                href="mailto:privacy@getacuity.io"
                className="underline hover:text-white"
              >
                privacy@getacuity.io
              </a>{" "}
              and we will delete the account and any associated data.
            </p>
          </Section>

          <Section id="security" title="7. How we protect your data">
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                All traffic between your device and our servers is
                encrypted with TLS 1.2 or higher.
              </li>
              <li>
                Database storage and audio file storage are encrypted at
                rest by our infrastructure provider (Supabase).
              </li>
              <li>
                Access to production systems is limited to a small number
                of authorised operators and is audit-logged.
              </li>
              <li>
                We never store payment-card details. Stripe handles those
                directly with PCI-compliant infrastructure.
              </li>
              <li>
                We use a credential-leak pre-commit hook to prevent
                secrets from entering source control.
              </li>
            </ul>
            <p className="mt-4">
              No system is perfectly secure. If we discover a breach
              affecting your data, we will notify you within 72 hours of
              becoming aware of it (or sooner if required by law in your
              jurisdiction).
            </p>
          </Section>

          <Section id="contact" title="8. Contact us">
            <p>
              For privacy questions or to exercise any of the rights
              above:
            </p>
            <p className="mt-3">
              <a
                href="mailto:privacy@getacuity.io"
                className="underline hover:text-white"
              >
                privacy@getacuity.io
              </a>
            </p>
            <p className="mt-3">
              For general support:{" "}
              <a
                href="mailto:hello@getacuity.io"
                className="underline hover:text-white"
              >
                hello@getacuity.io
              </a>
              .
            </p>
          </Section>

          <Section id="changes" title="9. Changes to this policy">
            <p>
              We may update this Privacy Policy from time to time. When
              we do, we&rsquo;ll change the &ldquo;Last updated&rdquo;
              date at the top of this page and, for material changes,
              notify active users by email at least 14 days before the
              changes take effect.
            </p>
          </Section>
        </div>

        <div className="mt-16 border-t border-white/10 pt-8 text-sm text-[#A0A0B8]">
          <p>
            See also:{" "}
            <Link href="/terms" className="underline hover:text-white">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id}>
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-4 text-[#C5C5D2]">{children}</div>
    </section>
  );
}
