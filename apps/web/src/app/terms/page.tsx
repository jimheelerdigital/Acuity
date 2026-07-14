import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Ripple",
  description:
    "The terms governing your use of Ripple, the nightly voice journaling service.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "June 3, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-acuity-bg px-6 py-16 text-acuity-text">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-sm text-acuity-text-sec transition hover:text-acuity-text"
        >
          &larr; Back to Ripple
        </Link>

        <h1 className="mt-8 text-3xl font-bold tracking-tight text-acuity-text sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-acuity-text-sec">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-10 text-[15px] leading-relaxed">
          <section>
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your
              use of Ripple, a nightly voice journaling service operated
              by Heeler Digital. By creating an account or using the
              service, you agree to these Terms. If you don&rsquo;t agree,
              don&rsquo;t use the service.
            </p>
          </section>

          <Section id="service" title="1. The service">
            <p>
              Ripple lets you record short voice journal entries (up to
              120 seconds), automatically transcribes them, and uses AI
              to extract themes, mood, tasks, goals, and life-area
              insights. The service is delivered via the web at{" "}
              <a
                href="https://getacuity.io"
                className="underline hover:text-acuity-text"
              >
                getacuity.io
              </a>{" "}
              and via our mobile applications.
            </p>
          </Section>

          <Section id="eligibility" title="2. Eligibility">
            <p>
              To use Ripple, you must be at least 18 years old and have
              the legal capacity to enter into a binding contract in
              your jurisdiction. By creating an account you represent
              that both of those things are true.
            </p>
          </Section>

          <Section id="account" title="3. Your account">
            <p>You are responsible for:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Keeping your login credentials confidential. Magic-link
                emails and Google sign-in tokens are bearer credentials
                &mdash; treat them like a password.
              </li>
              <li>
                Anything that happens under your account, whether or not
                you authorised it.
              </li>
              <li>
                The content you record. Don&rsquo;t record other
                people&rsquo;s voices without their consent and
                don&rsquo;t record content you don&rsquo;t have the right
                to journal about (for example, content covered by a
                non-disclosure obligation you owe to someone else).
              </li>
            </ul>
            <p className="mt-4">
              If you lose access to your sign-in email, we may be unable
              to verify your identity and may have to deny account
              recovery.
            </p>
          </Section>

          <Section id="acceptable-use" title="4. Acceptable use">
            <p>You agree not to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Use the service for any illegal activity or to record
                content that is illegal where you live.
              </li>
              <li>
                Harass, threaten, or impersonate any person, including
                Ripple employees and other users.
              </li>
              <li>
                Attempt to reverse-engineer, decompile, scrape, or
                otherwise extract source code or model parameters from
                the service.
              </li>
              <li>
                Send automated requests at a rate that interferes with
                normal operation, evade rate limits, or attempt to
                disrupt the service.
              </li>
              <li>
                Resell, sublicense, or redistribute the service or any
                of its outputs in a way that competes with Ripple.
              </li>
            </ul>
            <p className="mt-4">
              We may suspend or terminate your account if we determine,
              acting reasonably, that you&rsquo;ve violated this section.
            </p>
          </Section>

          <Section id="subscription" title="5. Subscription &amp; billing">
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-acuity-text">Free trial.</strong>{" "}
                New accounts get a 7-day free trial of the full
                product. No payment information required to start the
                trial. The trial ends automatically; if you don&rsquo;t
                subscribe, your access shifts to read-only on existing
                content (you keep your entries; you don&rsquo;t get new
                AI outputs until you subscribe).
              </li>
              <li>
                <strong className="text-acuity-text">Subscription.</strong>{" "}
                When you subscribe, you authorise us (via Stripe on
                the web, or Apple via in-app purchase on iOS) to
                charge you $4.99 per month or $39.99 per year, depending
                on the plan you select. The subscription renews
                automatically at the end of each billing period until
                you cancel.
              </li>
              <li>
                <strong className="text-acuity-text">In-app purchase (iOS).</strong>{" "}
                If you subscribe through our iOS app, the transaction
                is processed by Apple and billed to your Apple ID.
                Apple&rsquo;s standard auto-renewing subscription
                terms apply: payment is charged at confirmation of
                purchase, the subscription renews automatically unless
                you cancel at least 24 hours before the end of the
                current period, and your Apple ID is charged for
                renewal within 24 hours prior to the end of the
                current period. You can manage or cancel the
                subscription at any time in iOS Settings &rarr; Apple
                ID &rarr; Subscriptions, or via the App Store app.
                Apple&rsquo;s{" "}
                <a
                  href="https://www.apple.com/legal/internet-services/itunes/"
                  className="underline hover:text-acuity-text"
                >
                  Media Services Terms
                </a>{" "}
                also apply to in-app purchases.
              </li>
              <li>
                <strong className="text-acuity-text">In-app purchase (Android).</strong>{" "}
                If you subscribe through our Android app, the
                transaction is processed by Google and billed to your
                Google account under Google Play&rsquo;s terms. The
                subscription renews automatically unless you cancel at
                least 24 hours before the end of the current period. You
                can manage or cancel it any time in the Google Play
                Store under Payments &amp; subscriptions &rarr;
                Subscriptions. Refunds for Google Play purchases are
                governed by Google&rsquo;s policy and requested through
                Google Play; Ripple cannot process Play Store refunds
                directly.
              </li>
              <li>
                <strong className="text-acuity-text">Cancellation.</strong>{" "}
                For web subscriptions, you can cancel any time from
                your account settings or the Stripe billing portal.
                For iOS in-app purchases, cancel via iOS Settings
                &rarr; Apple ID &rarr; Subscriptions. Cancellation
                takes effect at the end of the current billing period;
                you keep access until then.
              </li>
              <li>
                <strong className="text-acuity-text">Refunds.</strong> For
                web subscriptions, we don&rsquo;t prorate or refund
                partial months &mdash; if you cancel mid-month, you
                keep paid access until the end of that month and
                won&rsquo;t be charged again. For iOS in-app
                purchases, refunds are governed by Apple&rsquo;s
                policy; request them at{" "}
                <a
                  href="https://reportaproblem.apple.com"
                  className="underline hover:text-acuity-text"
                >
                  reportaproblem.apple.com
                </a>
                . Ripple cannot process refunds for App Store
                transactions directly.
              </li>
              <li>
                <strong className="text-acuity-text">Price changes.</strong>{" "}
                If we change the subscription price, we&rsquo;ll notify
                existing subscribers by email at least 30 days before
                the change takes effect on your account.
              </li>
              <li>
                <strong className="text-acuity-text">Failed payments.</strong>{" "}
                If a renewal payment fails, Stripe will retry for up to
                three weeks. During that window your access continues.
                If the retries don&rsquo;t succeed, your subscription
                ends and you&rsquo;ll be moved to read-only access.
              </li>
            </ul>
          </Section>

          <Section
            id="eu-uk-consumer-rights"
            title="5b. EU / UK / EEA consumer rights"
          >
            <p>
              If you are a consumer resident in the UK, the EU, or the
              EEA, you have a statutory right to withdraw from a
              distance subscription contract within 14 days of entering
              into it, without giving any reason and without penalty.
              For UK consumers this right is set by the Consumer
              Contracts (Information, Cancellation and Additional
              Charges) Regulations 2013 (in particular Regulations
              29&ndash;38, including Reg. 36 for services and Reg. 37
              for digital content). For EU/EEA consumers, Directive
              2011/83/EU applies.
            </p>
            <p className="mt-3">
              <strong className="text-acuity-text">When the 14-day clock starts.</strong>{" "}
              Your free trial is separate from this right. The 14-day
              cancellation period runs from the day your paid
              subscription begins (your first charge), not from when
              the trial started.
            </p>
            <p className="mt-3">
              <strong className="text-acuity-text">Starting paid features early.</strong>{" "}
              When you subscribe, we ask you to confirm that you want
              your paid features to start immediately and that you
              understand the effect on your cancellation right. If you
              give that consent and we begin supplying the service:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                for digital content fully supplied during the period
                (for example, a Weekly Report we generate and deliver),
                you lose the right to cancel that content; and
              </li>
              <li>
                for the ongoing service, if you cancel during the 14
                days you will not lose the right outright &mdash; we
                will refund you, less a proportionate amount for the
                service actually supplied up to the moment you told us
                you wanted to cancel.
              </li>
            </ul>
            <p className="mt-3">
              If you have NOT asked us to begin immediately, or have not
              used any paid feature, you keep the full 14-day right and
              we will refund your charge in full within 14 days of
              receiving your notice, using the same payment method you
              paid with.
            </p>
            <p className="mt-3">
              <strong className="text-acuity-text">How to cancel.</strong>{" "}
              To exercise the right, tell us clearly within the 14 days
              &mdash; email{" "}
              <a
                href="mailto:privacy@heelerdigital.com"
                className="underline hover:text-acuity-text"
              >
                privacy@heelerdigital.com
              </a>{" "}
              or use the model cancellation form below. You may use this
              wording (completing the bracketed parts):
            </p>
            <blockquote className="mt-3 border-l-2 border-acuity-line pl-4 text-acuity-text-sec">
              &ldquo;To Heeler Digital, LLC: I hereby give notice that I
              withdraw from my contract for the Ripple subscription.
              Ordered on [date] / my account email is [email]. [Your
              name]. [Date].&rdquo;
            </blockquote>
            <p className="mt-3">
              <strong className="text-acuity-text">Statutory rights preserved.</strong>{" "}
              Nothing in these Terms limits your statutory consumer
              rights under applicable law, including (where relevant)
              the UK Consumer Rights Act 2015, the Australian Consumer
              Law in Schedule 2 of the Competition and Consumer Act 2010
              (Cth), or the New Zealand Consumer Guarantees Act 1993.
            </p>
          </Section>

          <Section id="ownership" title="6. Content ownership">
            <p>
              You own the audio you record and the transcripts and
              extracted data derived from it. By using Ripple, you grant
              us a limited, non-exclusive licence to process that
              content solely for the purpose of providing the service to
              you &mdash; transcribing, extracting structured data,
              generating reports, and storing it so you can retrieve it.
              This licence ends when you delete the content or your
              account.
            </p>
            <p className="mt-4">
              We do not use your content to train AI models. We do not
              sell or share your content with third parties for any
              purpose other than the subprocessor relationships disclosed
              in our{" "}
              <Link href="/privacy" className="underline hover:text-acuity-text">
                Privacy Policy
              </Link>
              .
            </p>
          </Section>

          <Section
            id="not-therapy"
            title="7. Ripple is not a therapy or medical service"
          >
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-amber-100">
              Ripple is a journaling tool that uses AI to help you see
              patterns in your own thinking. It is{" "}
              <strong className="text-acuity-text">not</strong> a substitute
              for therapy, counselling, psychiatric care, medical advice,
              or any other professional service.
            </p>
            <p className="mt-4">
              The AI-generated insights are pattern observations from
              your own words, not clinical assessments. They can be wrong.
              They should not be used to diagnose or treat any
              psychological, psychiatric, or medical condition.
            </p>
            <p className="mt-4">
              <strong className="text-acuity-text">
                If you are in a mental health crisis, contact a
                professional.
              </strong>{" "}
              In the United States, dial or text{" "}
              <strong className="text-acuity-text">988</strong> for the Suicide
              and Crisis Lifeline. In the UK, dial{" "}
              <strong className="text-acuity-text">116 123</strong> for
              Samaritans. Internationally, see{" "}
              <a
                href="https://findahelpline.com"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-acuity-text"
              >
                findahelpline.com
              </a>
              .
            </p>
          </Section>

          <Section id="warranty" title="8. Service is provided &ldquo;as is&rdquo;">
            <p className="mb-4">
              <strong className="text-acuity-text">Consumers first.</strong>{" "}
              Nothing in this section excludes or limits any rights you
              have as a consumer that cannot be excluded or limited
              under applicable law &mdash; including the statutory
              guarantees under the UK Consumer Rights Act 2015, the
              Australian Consumer Law, and the New Zealand Consumer
              Guarantees Act 1993. The disclaimers below apply only to
              the extent permitted by law.
            </p>
            <p>
              The service is provided on an &ldquo;as is&rdquo; and
              &ldquo;as available&rdquo; basis, without warranties of
              any kind, whether express or implied. To the maximum extent
              permitted by law, we disclaim all implied warranties
              including merchantability, fitness for a particular
              purpose, accuracy, and non-infringement.
            </p>
            <p className="mt-4">
              We don&rsquo;t guarantee that AI-generated content will
              be accurate, useful, or appropriate. We don&rsquo;t
              guarantee uninterrupted availability &mdash; the service
              depends on infrastructure providers and AI vendors that
              experience outages.
            </p>
          </Section>

          <Section id="liability" title="9. Limitation of liability">
            <p className="mb-4">
              Nothing in these Terms excludes or limits our liability
              for death or personal injury caused by our negligence,
              for fraud or fraudulent misrepresentation, or for any
              other liability that cannot be excluded or limited under
              applicable law. If you are a consumer, the exclusions and
              the cap below apply only to the extent permitted by the
              consumer-protection law of the country where you live,
              and do not reduce your non-excludable statutory rights.
            </p>
            <p>
              To the maximum extent permitted by law, Ripple, Heeler
              Digital, and our officers, employees, agents, and
              affiliates will not be liable for any indirect, incidental,
              special, consequential, or punitive damages arising from
              your use of the service, including but not limited to loss
              of profits, data, or goodwill.
            </p>
            <p className="mt-4">
              Our total liability to you for any claim arising under
              these Terms is limited to the greater of (a) the amount
              you paid us in the 12 months before the event giving rise
              to the claim, or (b) US$100.
            </p>
          </Section>

          <Section id="termination" title="10. Termination">
            <p>
              You can terminate your account at any time from{" "}
              <Link href="/account" className="underline hover:text-acuity-text">
                Account &rarr; Delete account
              </Link>
              , or by emailing{" "}
              <a
                href="mailto:hello@getacuity.io"
                className="underline hover:text-acuity-text"
              >
                hello@getacuity.io
              </a>
              . On termination, your data is deleted on the schedule
              described in the{" "}
              <Link href="/privacy" className="underline hover:text-acuity-text">
                Privacy Policy
              </Link>{" "}
              (immediate from our application database; infrastructure
              backups age out per the provider&rsquo;s schedule).
            </p>
            <p className="mt-4">
              We can terminate your account if you materially violate
              these Terms (most notably the acceptable-use rules in
              section 4). We&rsquo;ll generally try to give you notice
              and a chance to cure first, but we&rsquo;re not required
              to where the violation is severe or ongoing. We can also
              shut the service down entirely with reasonable notice; if
              we do, you&rsquo;ll get an export of your data and a pro
              rata refund for any unused subscription period.
            </p>
          </Section>

          <Section id="law" title="11. Governing law">
            <p>
              These Terms are governed by the laws of the Commonwealth
              of Massachusetts, United States, without regard to its
              conflict-of-laws rules. Any disputes that can&rsquo;t be
              resolved informally will be brought in the courts of that
              jurisdiction, and you consent to their personal
              jurisdiction.
            </p>
            <p className="mt-4">
              If you are a consumer, this choice of law does not deprive
              you of the protection of the mandatory consumer-protection
              rules of the country where you live, and you may be able
              to bring proceedings in your local courts.
            </p>
          </Section>

          <Section id="changes" title="12. Changes to these Terms">
            <p>
              We may update these Terms from time to time. When we make
              material changes, we&rsquo;ll notify you by email at least
              14 days before they take effect, and we&rsquo;ll change
              the &ldquo;Last updated&rdquo; date at the top. Continuing
              to use the service after changes take effect means you
              accept the updated Terms.
            </p>
          </Section>

          <Section id="contact" title="13. Contact">
            <p>
              Questions about these Terms? Email{" "}
              <a
                href="mailto:hello@getacuity.io"
                className="underline hover:text-acuity-text"
              >
                hello@getacuity.io
              </a>
              .
            </p>
          </Section>
        </div>

        <div className="mt-16 border-t border-acuity-line pt-8 text-sm text-acuity-text-sec">
          <p>
            See also:{" "}
            <Link href="/privacy" className="underline hover:text-acuity-text">
              Privacy Policy
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
