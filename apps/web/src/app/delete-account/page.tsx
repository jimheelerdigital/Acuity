import Link from "next/link";

export const metadata = {
  title: "Delete Your Account — Ripple",
  description:
    "How to request deletion of your Ripple account and data, what gets deleted, and what we retain for legal reasons.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "June 11, 2026";

/**
 * Public account + data deletion page. Required for the Google Play
 * Console "Data deletion" listing field (Play Data safety policy) and
 * referenced from the App Store / web support pages. Must be reachable
 * without signing in.
 *
 * Canonical URL: https://www.getacuity.io/delete-account
 */
export default function DeleteAccountPage() {
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
          Delete Your Account
        </h1>
        <p className="mt-2 text-sm text-acuity-text-sec">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-10 text-[15px] leading-relaxed">
          <section>
            <p>
              Ripple is an AI-powered voice journaling app published by{" "}
              <strong>Heeler Digital LLC</strong>. You can request deletion
              of your Ripple account and the personal data associated with it
              at any time, using either of the options below. There is no
              charge, and you do not need an active subscription.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-acuity-text">
              Option 1 — Delete in the app (immediate)
            </h2>
            <p className="mt-3">
              The fastest way is to delete your account directly from Ripple.
              This takes effect immediately.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-acuity-text-sec">
              <li>
                <span className="text-acuity-text">iOS app:</span> open the{" "}
                <strong>Profile</strong> tab, scroll to the{" "}
                <strong>Account</strong> section, and tap{" "}
                <strong>Delete account</strong>.
              </li>
              <li>
                <span className="text-acuity-text">Web app:</span> go to your{" "}
                <Link
                  href="/account"
                  className="text-acuity-primary underline-offset-4 hover:underline"
                >
                  Account
                </Link>{" "}
                page and use <strong>Delete account</strong> in the danger
                zone at the bottom.
              </li>
            </ul>
            <p className="mt-3">
              You&rsquo;ll be asked to confirm by typing to verify the action.
              Once confirmed, your account and data are removed as described
              below and you are signed out.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-acuity-text">
              Delete individual entries, tasks, or goals
            </h2>
            <p className="mt-3">
              You don&rsquo;t need to delete your account to remove specific
              data. From within Ripple:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-acuity-text-sec">
              <li>
                <span className="text-acuity-text">Delete an entry:</span> open
                the entry, tap the 3-dot menu in the top-right, then tap{" "}
                <strong>Delete entry</strong>.
              </li>
              <li>
                <span className="text-acuity-text">Delete a task:</span>{" "}
                long-press the task in your task list, then tap{" "}
                <strong>Delete</strong>.
              </li>
              <li>
                <span className="text-acuity-text">Delete a goal:</span> open
                the goal and tap <strong>Delete goal</strong> at the bottom,
                then confirm.
              </li>
            </ul>
            <p className="mt-3">
              Removed items are permanently deleted from our servers. Audio
              files associated with deleted entries are also removed from
              storage.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-acuity-text">
              Option 2 — Request deletion by email
            </h2>
            <p className="mt-3">
              If you can&rsquo;t access the app, email us and we&rsquo;ll
              process the deletion for you:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-acuity-text-sec">
              <li>
                Send a message to{" "}
                <a
                  href="mailto:hello@getacuity.io?subject=Account%20Deletion%20Request"
                  className="text-acuity-primary underline-offset-4 hover:underline"
                >
                  hello@getacuity.io
                </a>
                .
              </li>
              <li>
                Use the subject line{" "}
                <strong>&ldquo;Account Deletion Request&rdquo;</strong>.
              </li>
              <li>
                Include the email address associated with your Ripple account
                so we can locate and verify it.
              </li>
            </ul>
            <p className="mt-3">
              We&rsquo;ll confirm and complete the deletion within{" "}
              <strong>7 days</strong> of receiving your request.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-acuity-text">
              What gets deleted
            </h2>
            <p className="mt-3">
              When you delete your account, we permanently remove:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-acuity-text-sec">
              <li>Your account and profile</li>
              <li>
                All journal entries, including audio recordings and
                transcripts
              </li>
              <li>Tasks extracted from your entries</li>
              <li>Goals</li>
              <li>Achievements</li>
              <li>Consent records</li>
              <li>Push notification tokens</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-acuity-text">
              What we retain
            </h2>
            <p className="mt-3">
              A limited amount of data is kept after deletion only where the
              law requires it or where it can no longer identify you:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-acuity-text-sec">
              <li>
                <span className="text-acuity-text">
                  Aggregated / anonymized analytics
                </span>{" "}
                — data that has been stripped of any identifiers and can no
                longer be linked back to you.
              </li>
              <li>
                <span className="text-acuity-text">Billing records</span> —
                payment receipts and invoices from Stripe, Apple, and Google
                are retained for <strong>7 years</strong> to meet tax and
                accounting requirements.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-acuity-text">Contact</h2>
            <p className="mt-3">
              Questions about deleting your account or data? Email{" "}
              <a
                href="mailto:hello@getacuity.io"
                className="text-acuity-primary underline-offset-4 hover:underline"
              >
                hello@getacuity.io
              </a>
              . Ripple is operated by Heeler Digital LLC. See also our{" "}
              <Link
                href="/privacy"
                className="text-acuity-primary underline-offset-4 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
