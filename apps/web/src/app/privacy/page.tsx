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
    <div className="min-h-screen bg-acuity-bg px-6 py-16 text-acuity-text">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-sm text-acuity-text-sec transition hover:text-acuity-text"
        >
          &larr; Back to Acuity
        </Link>

        <h1 className="mt-8 text-3xl font-bold tracking-tight text-acuity-text sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-acuity-text-sec">
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
              <strong className="text-acuity-text">Data controller.</strong>{" "}
              Heeler Digital, LLC (&ldquo;Acuity&rdquo;, &ldquo;we&rdquo;,
              &ldquo;us&rdquo;) is the data controller for personal data
              processed via the Acuity service. We are established in the
              United States. Contact details for our privacy contact
              appear in Section 12.
            </p>
          </section>

          <Section id="data-we-collect" title="1. Data we collect">
            <p>To run Acuity, we collect the following categories of personal data:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-acuity-text">Account data.</strong> Email
                address (required for sign-in), display name and profile
                image (if provided via Google or Apple sign-in), timezone,
                reminder preferences, language.
              </li>
              <li>
                <strong className="text-acuity-text">Voice recordings.</strong>{" "}
                The audio you record in the app, up to 120 seconds per
                session. Stored encrypted at rest until transcription
                completes, then deleted from our servers within minutes.
              </li>
              <li>
                <strong className="text-acuity-text">Transcripts.</strong> The
                text version of each recording, generated automatically
                from your audio via OpenAI Whisper.
              </li>
              <li>
                <strong className="text-acuity-text">
                  AI-extracted structured data.
                </strong>{" "}
                Mood, energy level, themes, wins, blockers, tasks,
                goals, and life-area mentions, all derived from your
                transcript by Anthropic Claude.
              </li>
              <li>
                <strong className="text-acuity-text">Subscription state.</strong>{" "}
                Your trial status and (if you subscribe) the
                Stripe-issued customer and subscription identifiers.
                Payment card details are handled directly by Stripe
                &mdash; we never see them.
              </li>
              <li>
                <strong className="text-acuity-text">Device + technical data.</strong>{" "}
                Push notification token (if you opt in), app version,
                operating system, and scrubbed crash + diagnostic data
                from Sentry with personal identifiers removed before
                upload.
              </li>
              <li>
                <strong className="text-acuity-text">Usage analytics.</strong>{" "}
                Sanitised, aggregate product events sent to PostHog
                (e.g. &ldquo;recorded an entry&rdquo;,
                &ldquo;viewed paywall&rdquo;). Your account is
                identified only by a pseudonymised one-way (SHA-256)
                hash of your email &mdash; this is pseudonymisation, not
                anonymisation, and the hash remains personal data.
                Transcripts, audio, and free-text content are never
                included. On the web these load only after you grant
                cookie consent. In the app we measure how features are
                used to improve them; you can opt out at any time via
                Settings &rarr; Privacy &rarr; Product analytics.
                Pre-signup funnel measurement (anonymous, used for ad
                attribution) is conducted under our legitimate interest
                and is not controlled by that toggle &mdash; see
                Section 2.
              </li>
              <li>
                <strong className="text-acuity-text">Consent records.</strong>{" "}
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
                <thead className="border-b border-acuity-line text-acuity-text">
                  <tr>
                    <th className="py-2 pr-4 font-semibold">Processing purpose</th>
                    <th className="py-2 pr-4 font-semibold">Lawful basis</th>
                    <th className="py-2 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="text-acuity-text-ter">
                  <tr className="border-b border-acuity-line">
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
                  <tr className="border-b border-acuity-line">
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
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">
                      Special-category data inside transcripts
                      (e.g. health, beliefs)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 9(2)(a) &mdash; explicit consent
                    </td>
                    <td className="py-2 align-top">
                      When you first set up Acuity we ask you to give
                      separate, explicit consent (an affirmative,
                      unticked confirmation) to transcribe and analyse
                      voice entries that may contain special-category
                      information. You choose what to say, you can
                      journal without disclosing such information, and
                      you can withdraw consent at any time by deleting
                      entries or your account. We keep a record of this
                      consent.
                    </td>
                  </tr>
                  <tr className="border-b border-acuity-line">
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
                  <tr className="border-b border-acuity-line">
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
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">
                      Product analytics on the web (PostHog, sanitised
                      events)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 6(1)(a) &mdash; consent
                    </td>
                    <td className="py-2 align-top">
                      Loaded only after you accept analytics cookies on
                      the web.
                    </td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">
                      In-app product analytics (how you use features,
                      after sign-in)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 6(1)(f) &mdash; legitimate interest
                    </td>
                    <td className="py-2 align-top">
                      We measure how the app is used to improve it. You
                      can opt out at any time in Settings &rarr; Privacy
                      &rarr; Product analytics. We never sell this data
                      or share it for advertising.
                    </td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">
                      Pre-signup funnel measurement + ad attribution
                      (anonymous)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Art. 6(1)(f) &mdash; legitimate interest
                    </td>
                    <td className="py-2 align-top">
                      Before you create an account, anonymous funnel
                      events let us attribute installs to ads and
                      improve the sign-up flow. This is not controlled
                      by the in-app toggle; to avoid it, don&rsquo;t
                      install the app, or use a tracking-blocking
                      browser on our website.
                    </td>
                  </tr>
                  <tr className="border-b border-acuity-line">
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
                  <tr className="border-b border-acuity-line">
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
                  <tr className="border-b border-acuity-line">
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
              We do <strong className="text-acuity-text">not</strong> use
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
                <thead className="border-b border-acuity-line text-acuity-text">
                  <tr>
                    <th className="py-2 pr-4 font-semibold">Subprocessor</th>
                    <th className="py-2 pr-4 font-semibold">Purpose</th>
                    <th className="py-2 pr-4 font-semibold">Country</th>
                    <th className="py-2 font-semibold">Transfer mechanism</th>
                  </tr>
                </thead>
                <tbody className="text-acuity-text-ter">
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">OpenAI</td>
                    <td className="py-2 pr-4 align-top">
                      Voice transcription (Whisper API)
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + UK IDTA</td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">Anthropic</td>
                    <td className="py-2 pr-4 align-top">
                      AI extraction + weekly report (Claude API)
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + UK IDTA</td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">Stripe</td>
                    <td className="py-2 pr-4 align-top">
                      Subscription billing
                    </td>
                    <td className="py-2 pr-4 align-top">
                      US / Ireland (EU customers)
                    </td>
                    <td className="py-2 align-top">SCCs + UK IDTA</td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">Supabase</td>
                    <td className="py-2 pr-4 align-top">
                      Database hosting + voice file storage
                    </td>
                    <td className="py-2 pr-4 align-top">US (us-west-2)</td>
                    <td className="py-2 align-top">SCCs + UK IDTA</td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">Vercel</td>
                    <td className="py-2 pr-4 align-top">
                      Web and API hosting
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + UK IDTA</td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">Expo</td>
                    <td className="py-2 pr-4 align-top">
                      Push token relay + notification delivery
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + UK IDTA</td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">
                      Google (FCM, OAuth, Analytics)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Android push delivery; sign-in; analytics on
                      consenting visitors only
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + UK IDTA + DPF</td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">Resend</td>
                    <td className="py-2 pr-4 align-top">
                      Transactional + marketing email
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + UK IDTA</td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">Inngest</td>
                    <td className="py-2 pr-4 align-top">
                      Background job orchestration
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + UK IDTA</td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">PostHog</td>
                    <td className="py-2 pr-4 align-top">
                      Product analytics (consent-gated)
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + UK IDTA</td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">Sentry</td>
                    <td className="py-2 pr-4 align-top">
                      Crash + error monitoring (scrubbed)
                    </td>
                    <td className="py-2 pr-4 align-top">US</td>
                    <td className="py-2 align-top">SCCs + UK IDTA</td>
                  </tr>
                  <tr className="border-b border-acuity-line">
                    <td className="py-2 pr-4 align-top">
                      Meta (Pixel)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Marketing attribution on consenting visitors only
                    </td>
                    <td className="py-2 pr-4 align-top">US / Ireland</td>
                    <td className="py-2 align-top">SCCs + UK IDTA + DPF</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top">
                      Apple (Sign in with Apple, Push Notification Service)
                    </td>
                    <td className="py-2 pr-4 align-top">
                      Sign-in; push delivery on iOS
                    </td>
                    <td className="py-2 pr-4 align-top">US / Ireland</td>
                    <td className="py-2 align-top">SCCs + UK IDTA + DPF</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              Where we rely on SCCs or the UK IDTA for transfers to the
              United States, we have carried out transfer risk
              assessments taking account of US surveillance law, and we
              apply supplementary measures including encryption in
              transit and at rest, data minimisation, and short
              audio-retention windows. You can obtain a copy of the
              relevant Standard Contractual Clauses or UK IDTA by
              emailing{" "}
              <a
                href="mailto:privacy@heelerdigital.com"
                className="underline hover:text-acuity-text"
              >
                privacy@heelerdigital.com
              </a>
              .
            </p>
            <p className="mt-4">
              The full per-subprocessor disclosure, including links to
              each provider&rsquo;s public DPA and SCC documents, is
              published at{" "}
              <Link
                href="https://getacuity.io/compliance/subprocessors"
                className="underline hover:text-acuity-text"
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
                <strong className="text-acuity-text">Right of access (Art. 15).</strong>{" "}
                Request a copy of your data. The fastest route is the
                in-app export at Profile &rarr; Export my data, which
                returns a JSON file covering all data we hold about
                you. You can also email us (see Section 12).
              </li>
              <li>
                <strong className="text-acuity-text">Right to rectification (Art. 16).</strong>{" "}
                Correct inaccurate or incomplete data. Most fields are
                editable in-app; for others, email us.
              </li>
              <li>
                <strong className="text-acuity-text">Right to erasure / right to be forgotten (Art. 17).</strong>{" "}
                Delete your account and all associated personal data
                via Profile &rarr; Delete account. We erase your data
                from our live systems immediately and from rolling
                backups within 7 days, except a minimal email-hash
                tombstone retained up to 6 months for anti-abuse,
                consent records we must keep to evidence lawful
                processing, and billing records held by Stripe for
                legally required periods (see Section 6).
              </li>
              <li>
                <strong className="text-acuity-text">Right to restrict processing (Art. 18).</strong>{" "}
                Ask us to pause processing while we investigate a
                request. Email us.
              </li>
              <li>
                <strong className="text-acuity-text">Right to data portability (Art. 20).</strong>{" "}
                Receive your data in a structured, machine-readable
                format (JSON). Same export endpoint as above.
              </li>
              <li>
                <strong className="text-acuity-text">Right to object (Art. 21).</strong>{" "}
                Object to processing based on legitimate interest
                (Art. 6(1)(f)) or to direct marketing.
              </li>
              <li>
                <strong className="text-acuity-text">Right to withdraw consent (Art. 7(3)).</strong>{" "}
                Withdraw cookie consent or marketing-email consent at
                any time. Future processing stops; past processing
                stays lawful.
              </li>
              <li>
                <strong className="text-acuity-text">Right to complain to us directly.</strong>{" "}
                You can raise a data-protection complaint with us at{" "}
                <a
                  href="mailto:privacy@heelerdigital.com"
                  className="underline hover:text-acuity-text"
                >
                  privacy@heelerdigital.com
                </a>
                . We will acknowledge it within 30 days and respond
                without undue delay. You can still escalate to a
                supervisory authority at any time.
              </li>
              <li>
                <strong className="text-acuity-text">Right to lodge a complaint.</strong>{" "}
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
            <p className="mt-4">
              We verify rights requests against your signed-in account;
              for requests made by email we may ask you to confirm from
              your registered email address before we disclose any
              data, to protect your account.
            </p>
          </Section>

          <Section id="retention" title="6. Retention">
            <p>How long we keep things:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-acuity-text">Voice recordings.</strong>{" "}
                Deleted from our servers within minutes of
                transcription completing. We do not retain the audio
                file beyond the transcription window.
              </li>
              <li>
                <strong className="text-acuity-text">Transcripts + extracted data.</strong>{" "}
                Retained while your account is active. Deleted within
                30 days of account deletion (some short-lived backups
                expire on the same window).
              </li>
              <li>
                <strong className="text-acuity-text">Account + subscription records.</strong>{" "}
                Retained while your account is active. After deletion,
                we retain a minimal anti-abuse tombstone (email hash
                only) for up to 6 months to prevent free-trial
                cycling. No content, no name, no profile data.
              </li>
              <li>
                <strong className="text-acuity-text">Consent records.</strong>{" "}
                The record of any explicit consent you give (for
                example, to processing special-category content, or
                your 14-day-withdrawal acknowledgement at checkout) is
                retained while your account is active and for the
                relevant limitation period after deletion, so we can
                evidence that our processing was lawful if challenged.
                It stores only the wording you saw and the surrounding
                metadata &mdash; never transcripts, audio, or free-text
                content.
              </li>
              <li>
                <strong className="text-acuity-text">Billing records.</strong>{" "}
                Stripe retains payment records for the period required
                by tax and accounting law (typically 7 years). We do
                not hold card numbers.
              </li>
              <li>
                <strong className="text-acuity-text">Crash + diagnostic logs.</strong>{" "}
                Sentry retains scrubbed crash data for 30 days. Vercel
                runtime logs are retained for up to 1 day. Neither
                contains transcripts.
              </li>
              <li>
                <strong className="text-acuity-text">Analytics events.</strong>{" "}
                PostHog retains aggregated event data for the
                contractual term of our agreement; events are
                sanitised before upload (no transcripts, audio, or
                names) and the user identifier is a SHA-256 hash of
                your email.
              </li>
              <li>
                <strong className="text-acuity-text">Backups.</strong>{" "}
                Database backups are retained for up to 7 days on a
                rolling window and then irrevocably overwritten.
                Deleted accounts may persist in backups during this
                window; they are not restorable to the live database.
              </li>
            </ul>
          </Section>

          <Section id="security" title="7. Security">
            <p>
              We use appropriate safeguards to protect your data,
              including TLS 1.2+ for all data in transit, encryption at
              rest for the database and voice file storage, Row Level
              Security policies on user-data tables, least-privilege
              access controls for the small number of team members with
              access, rate limiting and abuse detection on
              authentication, encrypted rolling backups so we can
              restore the service after an incident, and periodic
              internal review of our security practices.
            </p>
            <p className="mt-4">
              No system is perfectly secure. If you suspect a security
              issue with Acuity, please email{" "}
              <a
                href="mailto:security@heelerdigital.com"
                className="underline hover:text-acuity-text"
              >
                security@heelerdigital.com
              </a>
              .
            </p>
          </Section>

          <Section id="breach" title="8. Breach notification">
            <p>
              If a personal data breach is likely to result in a risk
              to your rights and freedoms, we will notify the UK
              Information Commissioner&rsquo;s Office and each relevant
              supervisory authority in the EU/EEA where affected users
              are located, within 72 hours of becoming aware of it
              (Art. 33 UK/EU GDPR), and, where the risk is high, notify
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
              Acuity is intended for adults and is not directed to
              anyone under 18. We do not knowingly collect personal
              data from anyone under 18, and we design the service with
              the ICO&rsquo;s Children&rsquo;s Code in mind. If you
              believe a minor has provided us with personal data,
              email{" "}
              <a
                href="mailto:privacy@heelerdigital.com"
                className="underline hover:text-acuity-text"
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
              <strong className="text-acuity-text">Heeler Digital, LLC</strong>
              <br />
              Privacy contact:{" "}
              <a
                href="mailto:privacy@heelerdigital.com"
                className="underline hover:text-acuity-text"
              >
                privacy@heelerdigital.com
              </a>
              <br />
              Security disclosures:{" "}
              <a
                href="mailto:security@heelerdigital.com"
                className="underline hover:text-acuity-text"
              >
                security@heelerdigital.com
              </a>
            </p>
          </Section>
        </div>

        <div className="mt-16 border-t border-acuity-line pt-8 text-sm text-acuity-text-sec">
          <p>
            See also:{" "}
            <Link href="/terms" className="underline hover:text-acuity-text">
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
      <h2 className="text-xl font-semibold text-acuity-text">{title}</h2>
      <div className="mt-4 text-acuity-text-ter">{children}</div>
    </section>
  );
}
