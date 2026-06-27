import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";

/**
 * /open — Universal link landing page.
 *
 * When the iOS app is installed AND Apple's AASA cache has the /open
 * path, iOS intercepts this URL and opens the app directly. The user
 * never sees this page.
 *
 * When the app is NOT installed (or AASA hasn't refreshed), this page
 * loads in the browser. Fallback behavior:
 *
 *   - AUTHENTICATED user → redirect to /home (the web app dashboard).
 *   - UNAUTHENTICATED user → redirect to the App Store listing. The
 *     App Store shows "OPEN" if the app is already installed (opens it)
 *     or "GET" if not (downloads it). This covers all states with zero
 *     dead ends.
 *
 * Why not always redirect to /home: /home requires auth. An
 * unauthenticated user (clicking from an email) would bounce to
 * /auth/signin — a confusing dead end when they expected to open an
 * app they already have.
 */

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";

export default async function OpenPage() {
  const session = await getServerSession(getAuthOptions());

  if (session?.user?.id) {
    // Logged in → send to the web app dashboard.
    redirect("/home");
  }

  // Not logged in → App Store handles both "open" and "download."
  redirect(APP_STORE_URL);
}
