import { RELEASE_EMAILS } from "@/emails/announcements/releases";

import { ReleaseEmailAdmin } from "./release-email-admin";

export const dynamic = "force-dynamic";

/**
 * /admin/release-email (2026-10-27): send a release announcement without
 * the Resend key leaving Vercel. The admin layout gates on isAdmin; the
 * API route re-checks.
 */
export default function ReleaseEmailPage() {
  const versions = RELEASE_EMAILS.map((r) => ({
    version: r.version,
    platform: r.platform,
  }));
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <h1 className="neo-title text-2xl font-semibold">Release email</h1>
      <p className="mt-1 text-sm text-acuity-text-sec">
        One email per release to that platform&apos;s users. Run the check first, then
        send yourself a test, then send it live. Live only works once the App Store is
        serving the version. People who unsubscribed, bounced or complained are left out.
        Nobody gets it twice, even if you click again.
      </p>
      <ReleaseEmailAdmin versions={versions} />
    </main>
  );
}
