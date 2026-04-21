/**
 * Relative-date formatting shared across web + mobile. Same input
 * (Date or ISO string) + same output on both surfaces so entry cards
 * read identically whether the user's on iOS or web.
 *
 * Output format:
 *   < 1 min       → "Just now"
 *   < 60 min      → "N min ago"
 *   < 24 hr       → "N hour(s) ago"
 *   same cal day  → "Today"        (caught by the hour case above usually)
 *   yesterday     → "Yesterday"
 *   < 7 days      → "N days ago"
 *   else          → "Mon D"   (e.g. "Mar 15")
 *
 * Day boundaries are evaluated in the user's timezone. Passing a
 * timezone is optional — falls back to the runtime's local timezone,
 * which is fine for most cases but a Chicago user viewing on a VPN
 * endpoint in another zone would see drift. The web server reads
 * User.timezone and passes it; mobile reads user.timezone from auth
 * context.
 */

export function formatRelativeDate(
  input: Date | string,
  opts: { now?: Date; timezone?: string } = {}
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  const now = opts.now ?? new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);

  if (diffMs < 0) return "Just now"; // clock skew — treat as now
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;

  // 24h+ ago — use calendar-day arithmetic in the specified timezone.
  const tz = opts.timezone;
  const toKey = (d: Date): string =>
    tz
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d)
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const nowKey = toKey(now);
  const dateKey = toKey(date);
  const dayDiff = Math.round(
    (Date.parse(`${nowKey}T00:00:00Z`) - Date.parse(`${dateKey}T00:00:00Z`)) /
      (24 * 60 * 60 * 1000)
  );

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
