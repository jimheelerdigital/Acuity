"use client";

/**
 * Integrations — placeholder section. Three calendar providers
 * (Google, Outlook, Apple) each rendered as a disabled "Coming
 * soon" card. The CalendarConnection schema + /api/integrations/
 * calendar/connect stub exist so this UI reserves its place without
 * shipping a half-wired flow; see docs/CALENDAR_INTEGRATION_PLAN.md
 * for the real rollout plan.
 */

const PROVIDERS: Array<{
  key: "GOOGLE" | "OUTLOOK" | "APPLE";
  label: string;
  blurb: string;
}> = [
  {
    key: "GOOGLE",
    label: "Google Calendar",
    blurb: "Attribute mood + energy shifts to meetings from your primary calendar.",
  },
  {
    key: "OUTLOOK",
    label: "Outlook / Microsoft 365",
    blurb: "Same picture for Microsoft 365 and Outlook.com calendars.",
  },
  {
    key: "APPLE",
    label: "Apple Calendar",
    blurb: "Reading iCloud + on-device calendars via CalDAV.",
  },
];

export function IntegrationsSection() {
  return (
    <section className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Integrations
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Connect a calendar so weekly reports and the Life Matrix can
        ground patterns in what you actually did. Coming soon — none
        of these light up until after beta.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PROVIDERS.map((p) => (
          <div
            key={p.key}
            className="rounded-lg border border-dashed border-zinc-200 dark:border-white/10 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {p.label}
              </h3>
              <span className="rounded-full bg-zinc-100 dark:bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                Coming soon
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {p.blurb}
            </p>
            <button
              disabled
              className="mt-3 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-400 dark:border-white/10 dark:bg-[#13131F] dark:text-zinc-500"
            >
              Connect
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
