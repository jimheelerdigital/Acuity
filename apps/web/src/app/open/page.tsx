import { redirect } from "next/navigation";

/**
 * /open — Universal link landing page.
 *
 * When the iOS app is installed, iOS intercepts this URL and opens
 * the app directly (via the AASA config). The user never sees this
 * page — they land in the app.
 *
 * When the app is NOT installed, iOS falls back to loading this page
 * in Safari. We redirect to /home (the web app) so they get the full
 * web experience instead of a dead end.
 *
 * This is why /open exists as a separate path from /home — we want
 * /home to always open in the browser (it's the web app), and /open
 * to be the universal-link entry point that either opens the native
 * app or falls back to /home.
 */
export default function OpenPage() {
  redirect("/home");
}
