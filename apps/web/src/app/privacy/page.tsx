import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Acuity",
  description:
    "How Acuity collects, uses, stores, and protects your voice journal data. GDPR + UK GDPR compliant.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "June 3, 2026";

/**
 * Privacy Policy — GDPR + UK GDPR compliant rewrite for Phase 1
 * international launch (UK / IE / AU / NZ). v1.4 (2026-06-03).
 *
 * Sections required for compliance and present below:
 *   1. Data we collect (categories + sources)
 *   2. Lawful basis (Art. 6 GDPR per processing purpose)
 *   3. How we use your data
 *   4. Subprocessors + international transfers (Art. 28, Art. 46)
 *   5. Data subject rights (Art. 12–22)
 *   6. Retention policy
 *   7. Security
 *   8. Breach notification (Art. 33–34)
 *   9. Cookies + tracking
 *  10. Children
 *  11. Changes to this policy
 *  12. Contact + DPO (Art. 13(1)(b))
 *
 * Companion doc: docs/compliance/subprocessors.md — the canonical
 * subprocessor list with DPA links + SCC posture, mirrored in
 * Section 4 below.
 */
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
              explains what data we collect, why we collect it, who we
              share it with, how long we keep it, the lawful basis for
              each processing activity, and how to exercise your
              privacy rights, including rights under the EU and UK
              General Data Protection Regulations (GDPR / UK GDPR),
              the Australian Privacy Act 1988, and the New Zealand
              Privacy Act 2020.
            </p>
            <p className="mt-4">
              The short version: your recordings and transcripts are
              yours. We use them only to give you the service you
              signed up for &mdash; transcription, AI extraction,
              weekly reports, life-area insights. We don&rsquo;t sell
              your data. We don&rsquo;t train models on it. You can
              export or delete it at any time.
            </p>
            <p className="mt-4">
              <strong className="text-white">Data controller.</strong>{" "}
              Heeler Digital, LLC (&ldquo;Acuity&rdquo;, &ldquo;we&rdquo;,
              &ldquo;us&rdquo;) is the data controller for personal data
              processed via the Acuity service. Contact details for our
              privacy contact appear in Section 12.
            </p>
          </section>

          <Section id="data-we-collect" title="1. Data we collect">
            <p>To run Acuity, we collect the following categories of personal data:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-white">Account data.</strong> Email
                address (required for sign-in), display name and profile
                image (if provided via Google or Apple sign-in), timezone,
                reminder preferences, language.
              </li>
              <li>
                <strong className="text-white">Voice recordings.</strong>{" "}
                The audio you record in the app, up to 120 seconds per
                session. Stored encrypted at rest until transcription
                completes, then deleted from our servers within minutes.
              </li>
              <li>
                <strong className="text-white">Transcripts.</strong> The
                text version of each recording, generated automatically
                from your audio via OpenAI Whisper.
              </li>
              <li>
                <strong className="text-white">
                  AI-extracted structured data.
                </strong>{" "}
                Mood, energy level, themes, wins, blockers, tasks,
                goals, and life-area mentions, all derived from your
                transcript by Anthropic Claude.
              </li>
              <li>
                <strong className="text-white">Subscription state.</strong>{" "}
                Your trial status and (if you subscribe) the
                Stripe-issued customer and subscription identifiers.
                Payment card details are handled directly by Stripe
                &mdash; we never see them.
              </li>
              <li>
                <strong className="text-white">Device + technical data.</strong>{" "}
                Push notification token (if you opt in), app version,
                operating system, anonymised crash + diagnostic data
                from Sentry.
              </li>
              <li>
                <strong className="text-white">Usage analytics.</strong>{" "}
                Sanitised, aggregate product events sent to PostHog
                (e.g. &ldquo;recorded an entry&rdquo;,
                &ldquo;viewed paywall&rdquo;). Your email is sent as a
                SHA-256 hash; transcripts, audio, and free-text content
                are never included. Loaded only after you grant cookie
                consent on the web.
              </li>
              <li>
                <strong className="text-white">Consent records.</strong>{" "}
                We retain a record of your cookie + email-marketing
                consent (date, choice, version of this policy) so we
                can demonstrate compliance with Art. 7(1) GDPR.
              </li>
            </ul>
            <p className="mt-4">
              We do not collect: precise location, contacts, browsing
              history, advertising identifiers (IDFA / Google
              Advertising ID), financial information beyond Stripe
              identifiers, or sensitive categories of data
              (Art. 9 GDPR) directly. Voice transcripts may, of course,
              contain sensitive content you choose to volunteer
              &mdash; see Section 2 on the lawful basis for that
              category.
            </p>
          </Section>

          <Section id="lawful-basis" title="2. Lawful basis for processing">
            <p>
              For users in the EU, UK, Switzerland, and similar
              jurisdictions, we rely on the following lawful bases
              under Article 6 GDPR (and, where applicable, Article 9
              for special categories):
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/10 text-white">
                  <tr>
                    <th className="py-2 pr-4 font-semibold">Processing purpose</th>
                    <th className="py-2 pr-4 font-semibold">Lawful basis</th>
                    <th className="py-2 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="text-[#C5C5D2]">
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">
                      Account creation + sign-in
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 6(1)(b) &mdash; performance of a contract
                    </td>
                    <td className="py-2 align-top">
                      We can&rsquo;t deliver the service without an account.
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">
                      Voice transcription + AI extraction
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 6(1)(b)
                    </td>
                    <td className="py-2 align-top">
                      Core feature; processed by OpenAI + Anthropic as
                      our subprocessors under Art. 28 DPAs.
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">
                      Special-category data inside transcripts
                      (e.g. health, beliefs)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 9(2)(a) &mdash; explicit consent
                    </td>
                    <td className="py-2 align-top">
                      When you record an entry, you give explicit
                      consent for that content to be transcribed and
                      analysed. You can withdraw consent for future
                      entries at any time by stopping recording.
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">
                      Subscription billing
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 6(1)(b)
                    </td>
                    <td className="py-2 align-top">
                      Payments are processed by Stripe; we hold only
                      the Stripe customer / subscription identifiers.
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">
                      Transactional email (weekly report, Life Audit,
                      account events)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 6(1)(b)
                    </td>
                    <td className="py-2 align-top">
                      Delivers the product you signed up for.
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">
                      Product analytics (PostHog, sanitised events)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 6(1)(a) &mdash; consent
                    </td>
                    <td className="py-2 align-top">
                      Loaded only after you accept cookies on the web.
                      Mobile analytics use the same consent record.
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">
                      Marketing emails (drip + waitlist nudges)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 6(1)(a)
                    </td>
                    <td className="py-2 align-top">
                      Unsubscribe link in every email. Withdrawal of
                      consent does not affect lawfulness of prior
                      processing.
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">
                      Crash + error telemetry (Sentry, scrubbed)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 6(1)(f) &mdash; legitimate interest
                    </td>
                    <td className="py-2 align-top">
                      Keeping the service running. Personal identifiers
                      are scrubbed before upload.
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">
                      Fraud and abuse prevention; rate limiting
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 6(1)(f)
                    </td>
                    <td className="py-2 align-top">
                      Necessary for the security of the service. A
                      balancing test is documented internally.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              Where the basis is consent (Art. 6(1)(a) or Art. 9(2)(a)),
              you can withdraw at any time by adjusting your cookie
              choices, unsubscribing from marketing email, or deleting
              your account. Withdrawal does not affect the lawfulness
              of processing carried out before the withdrawal.
            </p>
          </Section>

          <Section id="how-we-use" title="3. How we use your data">
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Transcribe your recordings into text, then extract
                themes, tasks, mood, and goals.
              </li>
              <li>
                Render your dashboard, Life Matrix, weekly report, and
                Day-14 Life Audit.
              </li>
              <li>
                Send transactional and (with consent) marketing email
                and push notifications.
              </li>
              <li>
                Bill you for your subscription via Stripe.
              </li>
              <li>
                Improve product reliability through scrubbed crash and
                performance telemetry.
              </li>
            </ul>
            <p className="mt-4">
              We do <strong className="text-white">not</strong> use
              your voice, transcripts, or extracted content to train AI
              models. We do not sell personal data. We do not use
              automated decision-making with legal or similarly
              significant effects (Art. 22 GDPR).
            </p>
          </Section>

          <Section
            id="subprocessors"
            title="4. Subprocessors and international transfers"
          >
            <p>
              Acuity is operated from the United States. The following
              third parties process personal data on our behalf as
              subprocessors under Article 28 GDPR Data Processing
              Agreements (DPAs). Personal data may be transferred to
              the United States or other countries listed below. We
              rely on the European Commission&rsquo;s Standard
              Contractual Clauses (SCCs) (2021/914), the UK
              International Data Transfer Addendum (IDTA), and the
              EU&ndash;US Data Privacy Framework (DPF) where
              applicable, as our transfer mechanisms under Article 46.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/10 text-white">
                  <tr>
                    <th className="py-2 pr-4 font-semibold">Subprocessor</th>
                    <th className="py-2 pr-4 font-semibold">Purpose</th>
                    <th className="py-2 pr-4 font-semibold">Country</th>
                    <th className="py-2 font-semibold">Transfer mechanism</th>
                  </tr>
                </thead>
                <tbody className="text-[#C5C5D2]">
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">OpenAI</td>
                    <td className="py-2 pr-4 align-top">
                      Voice transcription (Whisper API)
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + DPF</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">Anthropic</td>
                    <td className="py-2 pr-4 align-top">
                      AI extraction + weekly report (Claude API)
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + DPF</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">Stripe</td>
                    <td className="py-2 pr-4 align-top">
                      Subscription billing
                    </td>
                    <td className="py-2 pr-4 align-top">
                      US / Ireland (EU customers)
                    </td>
                    <td className="py-2 align-top">SCCs + DPF</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">Supabase</td>
                    <td className="py-2 pr-4 align-top">
                      Database hosting + voice file storage
                    </td>
                    <td className="py-2 pr-4 align-top">US (us-west-2)</td>
                    <td className="py-2 align-top">SCCs</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">Vercel</td>
                    <td className="py-2 pr-4 align-top">
                      Web and API hosting
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + DPF</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">Resend</td>
                    <td className="py-2 pr-4 align-top">
                      Transactional + marketing email
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">Inngest</td>
                    <td className="py-2 pr-4 align-top">
                      Background job orchestration
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">PostHog</td>
                    <td className="py-2 pr-4 align-top">
                      Product analytics (consent-gated)
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + DPF</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">Sentry</td>
                    <td className="py-2 pr-4 align-top">
                      Crash + error monitoring (scrubbed)
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + DPF</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">
                      Google (OAuth, Analytics)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Sign-in; analytics on consenting visitors only
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + DPF</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-2 pr-4 align-top">
                      Meta (Pixel)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Marketing attribution on consenting visitors only
                    </td>
                    <td className="py-2 pr-4 align-top">US / Ireland</td>
                    <td className="py-2 align-top">SCCs + DPF</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top">
                      Apple (Sign in with Apple, Push Notification Service)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Sign-in; push delivery on iOS
                    </td>
                    <td className="py-2 pr-4 align-top">US / Ireland</td>
                    <td className="py-2 align-top">SCCs + DPF</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              The full per-subprocessor disclosure, including links to
              each provider&rsquo;s public DPA and SCC documents, is
              published at{" "}
              <Link
                href="https://getacuity.io/compliance/subprocessors"
                className="underline hover:text-white"
              >
                /compliance/subprocessors
              </Link>{" "}
              and mirrored in the open-source repository at{" "}
              <code className="font-mono text-xs">
                docs/compliance/subprocessors.md
              </code>
              . We will give existing customers at least 30
              days&rsquo; notice of any new subprocessor via this page
              and (for accounts with marketing consent) by email.
            </p>
            <p className="mt-4">
              We do not use AI subprocessor outputs to train any model.
              OpenAI and Anthropic process content under their API
              terms which prohibit training on inbound API content.
            </p>
          </Section>

          <Section id="your-rights" title="5. Your rights">
            <p>
              If you are in the EU, UK, Switzerland, Australia, New
              Zealand, California, or another jurisdiction with
              equivalent rights, you have the following rights with
              respect to your personal data, exercisable free of
              charge:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-white">Right of access (Art. 15).</strong>{" "}
                Request a copy of your data. The fastest route is the
                in-app export at Profile &rarr; Export my data, which
                returns a JSON file covering all data we hold about
                you. You can also email us (see Section 12).
              </li>
              <li>
                <strong className="text-white">Right to rectification (Art. 16).</strong>{" "}
                Correct inaccurate or incomplete data. Most fields are
                editable in-app; for others, email us.
              </li>
              <li>
                <strong className="text-white">Right to erasure / right to be forgotten (Art. 17).</strong>{" "}
                Delete your account and all associated personal data
                via Profile &rarr; Delete account. This is a
                hard delete: we do not retain a hidden copy. Anonymous
                aggregate cost data may survive (see Section 6).
              </li>
              <li>
                <strong className="text-white">Right to restrict processing (Art. 18).</strong>{" "}
                Ask us to pause processing while we investigate a
                request. Email us.
              </li>
              <li>
                <strong className="text-white">Right to data portability (Art. 20).</strong>{" "}
                Receive your data in a structured, machine-readable
                format (JSON). Same export endpoint as above.
              </li>
              <li>
                <strong className="text-white">Right to object (Art. 21).</strong>{" "}
                Object to processing based on legitimate interest
                (Art. 6(1)(f)) or to direct marketing.
              </li>
              <li>
                <strong className="text-white">Right to withdraw consent (Art. 7(3)).</strong>{" "}
                Withdraw cookie consent or marketing-email consent at
                any time. Future processing stops; past processing
                stays lawful.
              </li>
              <li>
                <strong className="text-white">Right to lodge a complaint.</strong>{" "}
                You can complain to your local data protection
                authority. In the UK, the Information Commissioner&rsquo;s
                Office (ico.org.uk). In Ireland, the Data Protection
                Commission (dataprotection.ie). In Australia, the
                Office of the Australian Information Commissioner
                (oaic.gov.au). In New Zealand, the Office of the
                Privacy Commissioner (privacy.org.nz). We&rsquo;d
                rather hear from you first &mdash; see Section 12.
              </li>
            </ul>
            <p className="mt-4">
              We will respond to verifiable rights requests within
              30 days. Where requests are complex or numerous, we may
              extend by up to a further 60 days and will tell you why
              (Art. 12(3) GDPR).
            </p>
          </Section>

          <Section id="retention" title="6. Retention">
            <p>How long we keep things:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-white">Voice recordings.</strong>{" "}
                Deleted from our servers within minutes of
                transcription completing. We do not retain the audio
                file beyond the transcription window.
              </li>
              <li>
                <strong className="text-white">Transcripts + extracted data.</strong>{" "}
                Retained while your account is active. Deleted within
                30 days of account deletion (some short-lived backups
                expire on the same window).
              </li>
              <li>
                <strong className="text-white">Account + subscription records.</strong>{" "}
                Retained while your account is active. After deletion,
                we retain a minimal anti-abuse tombstone (email hash
                only) for up to 6 months to prevent free-trial
                cycling. No content, no name, no profile data.
              </li>
              <li>
                <strong className="text-white">Billing records.</strong>{" "}
                Stripe retains payment records for the period required
                by tax and accounting law (typically 7 years). We do
                not hold card numbers.
              </li>
              <li>
                <strong className="text-white">Crash + diagnostic logs.</strong>{" "}
                Sentry retains scrubbed crash data for 30 days. Vercel
                runtime logs are retained for up to 1 day. Neither
                contains transcripts.
              </li>
              <li>
                <strong className="text-white">Analytics events.</strong>{" "}
                PostHog retains aggregated event data for the
                contractual term of our agreement; events are
                sanitised before upload (no transcripts, audio, or
                names) and the user identifier is a SHA-256 hash of
                your email.
              </li>
              <li>
                <strong className="text-white">Backups.</strong>{" "}
                Database backups are retained for up to 7 days on a
                rolling window and then irrevocably overwritten.
                Deleted accounts may persist in backups during this
                window; they are not restorable to the live database.
              </li>
            </ul>
          </Section>

          <Section id="security" title="7. Security">
            <p>
              We use industry-standard safeguards to protect your data,
              including TLS 1.2+ for all data in transit, encryption at
              rest for the database and voice file storage, rate
              limiting and abuse detection on authentication, principle-
              of-least-privilege access controls for our team, regular
              security audits, and Row Level Security policies on every
              user-data table.
            </p>
            <p className="mt-4">
              No system is perfectly secure. If you suspect a security
              issue with Acuity, please email{" "}
              <a
                href="mailto:security@heelerdigital.com"
                className="underline hover:text-white"
              >
                security@heelerdigital.com
              </a>
              .
            </p>
          </Section>

          <Section id="breach" title="8. Breach notification">
            <p>
              If a personal data breach is likely to result in a risk
              to your rights and freedoms, we will notify our lead
              supervisory authority within 72 hours of becoming aware
              of it (Art. 33 GDPR) and, where the risk is high, notify
              affected users without undue delay (Art. 34).
              Notifications will describe the nature of the breach,
              the categories and approximate number of data subjects
              concerned, the likely consequences, and the measures we
              have taken or propose to take to address it.
            </p>
          </Section>

          <Section id="cookies" title="9. Cookies and tracking">
            <p>
              Acuity uses a small number of strictly-necessary cookies
              (session, theme preference, consent record) that load
              regardless of consent because the site can&rsquo;t
              function without them.
            </p>
            <p className="mt-4">
              All non-essential tracking &mdash; Google Analytics, the
              Meta Pixel, session-recording tools, and PostHog product
              analytics &mdash; loads only after you accept cookies on
              the banner shown to first-time visitors. You can change
              your choice at any time via the &ldquo;Cookie settings&rdquo;
              link in the footer.
            </p>
          </Section>

          <Section id="children" title="10. Children">
            <p>
              Acuity is not directed to children under 16, and we do
              not knowingly collect data from children under 16. If
              you believe a child has provided us with personal data,
              email{" "}
              <a
                href="mailto:privacy@heelerdigital.com"
                className="underline hover:text-white"
              >
                privacy@heelerdigital.com
              </a>{" "}
              and we will delete it.
            </p>
          </Section>

          <Section id="changes" title="11. Changes to this policy">
            <p>
              We may update this Privacy Policy from time to time. When
              we do, we&rsquo;ll change the &ldquo;Last updated&rdquo;
              date at the top of this page and, for material changes,
              notify active users by email at least 14 days before the
              changes take effect.
            </p>
          </Section>

          <Section id="contact" title="12. Contact">
            <p>
              For any privacy question, request, or complaint, contact:
            </p>
            <p className="mt-3">
              <strong className="text-white">Heeler Digital, LLC</strong>
              <br />
              Privacy contact:{" "}
              <a
                href="mailto:privacy@heelerdigital.com"
                className="underline hover:text-white"
              >
                privacy@heelerdigital.com
              </a>
              <br />
              Security disclosures:{" "}
              <a
                href="mailto:security@heelerdigital.com"
                className="underline hover:text-white"
              >
                security@heelerdigital.com
              </a>
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
