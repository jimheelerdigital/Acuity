import * as Notifications from "expo-notifications";

/**
 * Phase 2/3 (v1.3.3) — route taps on entry completion/failure pushes to the
 * entry detail. The server (`@acuity/web` entry-push) sends
 * `data: { entryId, type }`; both warm (app running) and cold (app launched
 * by the tap) starts are handled.
 */
function entryIdFromResponse(
  response: Notifications.NotificationResponse | null | undefined
): string | null {
  const data = response?.notification?.request?.content?.data as
    | { entryId?: unknown }
    | undefined;
  return typeof data?.entryId === "string" && data.entryId.length > 0
    ? data.entryId
    : null;
}

/** Warm-start: tap while the app is running. Returns a cleanup fn. */
export function registerNotificationTapRouting(
  navigate: (entryId: string) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const entryId = entryIdFromResponse(response);
      if (entryId) navigate(entryId);
    }
  );
  return () => sub.remove();
}

/** Cold-start: app launched by tapping the push. Routes once if present. */
export async function handleColdStartNotificationTap(
  navigate: (entryId: string) => void
): Promise<void> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    const entryId = entryIdFromResponse(response);
    if (entryId) navigate(entryId);
  } catch {
    // non-fatal
  }
}
