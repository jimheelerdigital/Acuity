import { redirect } from "next/navigation";

/**
 * Legacy /dashboard route — kept as a permanent redirect to /home
 * for old bookmarks, email-drip links, and any external referrers
 * from the pre-rename era. The actual page lives at /home.
 */
export default function DashboardRedirect() {
  redirect("/home");
}
