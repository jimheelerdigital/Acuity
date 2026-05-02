/**
 * Calendar integrations — slice C5b web surface.
 *
 * Three states:
 *   1. FREE post-trial → ProLockedCard (calendar_connect_locked)
 *      Single billing-gate card. CTA opens Safari to /upgrade.
 *
 *   2. PRO/TRIAL/PAST_DUE not yet connected → "Connect on iOS" card
 *      Web is informational only in v1.1 — Phase A connect happens
 *      via iOS EventKit (proxies Google + Outlook + iCloud through
 *      the OS account integration). Web Google OAuth is Phase B.
 *
 *   3. PRO/TRIAL/PAST_DUE already connected → connected-state card
 *      Shows provider, target calendar, autoSendTasks toggle state,
 *      defaultEventDuration. Disconnect is deferred to follow-up
 *      (per scoping doc — not on critical path for v1.1 launch).
 *
 * This is a server component — entitlement + connection state come
 * in as props from /account/page.tsx. No client-side fetch; client
 * bundle stays minimal.
 */

import { ProLockedCard } from "@/components/pro-locked-card";

export interface CalendarConnectionSummary {
  provider: string | null; // "ios_eventkit" | "google" | "outlook" | null
  connectedAt: Date | null;
  targetCalendarId: string | null;
  autoSendTasks: boolean;
  defaultEventDuration: string; // "ALL_DAY" | "TIMED"
}

const PROVIDER_LABEL: Record<string, string> = {
  ios_eventkit: "Apple Calendar (iOS)",
  google: "Google Calendar",
  outlook: "Outlook / Microsoft 365",
};

export function IntegrationsSection({
  isProLocked,
  connection,
}: {
  isProLocked: boolean;
  connection: CalendarConnectionSummary | null;
}) {
  // FREE post-trial: paywall card, no connect surface.
  if (isProLocked) {
    return (
      <section className="mt-8" data-section="integrations">
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Integrations
        </h2>
        <ProLockedCard surfaceId="calendar_connect_locked" />
      </section>
    );
  }

  // PRO/TRIAL/PAST_DUE: connect or connected state.
  const isConnected = !!(connection && connection.provider);

  return (
    <section
      className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6"
      data-section="integrations"
    >
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        Calendar
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Send Acuity tasks with due dates to your calendar so they show
        up where you already plan your day.
      </p>

      {!isConnected ? <ConnectOnMobileCard /> : <ConnectedStateCard connection={connection!} />}
    </section>
  );
}

function ConnectOnMobileCard() {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-zinc-200 dark:border-white/10 p-5">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Connect from the iOS app
      </h3>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Acuity reads your Apple Calendar — which already includes any
        Google or Outlook calendars you&apos;ve added on iOS — through
        the system EventKit framework. Open the Acuity iOS app, then
        Profile → Integrations to connect.
      </p>
      <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">
        Web-side Google OAuth ships post-launch. Outlook follows.
      </p>
    </div>
  );
}

function ConnectedStateCard({
  connection,
}: {
  connection: CalendarConnectionSummary;
}) {
  const provider = connection.provider ?? "unknown";
  const providerLabel = PROVIDER_LABEL[provider] ?? provider;
  const connectedDate = connection.connectedAt
    ? new Date(connection.connectedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const durationLabel =
    connection.defaultEventDuration === "ALL_DAY" ? "All-day" : "Timed (1h)";

  return (
    <div className="mt-5 space-y-4 rounded-lg border border-zinc-200 dark:border-white/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {providerLabel}
          </h3>
          {connectedDate && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Connected {connectedDate}
            </p>
          )}
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Connected
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SettingRow
          label="Auto-send tasks"
          value={connection.autoSendTasks ? "On" : "Off"}
        />
        <SettingRow label="Default event" value={durationLabel} />
      </dl>

      <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        Settings (auto-send, default duration, target calendar) are
        edited from the iOS app today. Disconnect ships in a follow-up.
      </p>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zinc-50 dark:bg-white/5 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-200">
        {value}
      </dd>
    </div>
  );
}
