/**
 * User-facing copy for recording / transcription failures (P0 — the
 * Bluetooth/silent-audio + OpenAI "Connection error." friendliness pass).
 *
 * Shared so all three surfaces agree:
 *   - the pipeline throws these as the stored Entry.errorMessage,
 *   - the web entry-status-gate sanitizer maps to / passes these through,
 *   - mobile renders Entry.errorMessage RAW, so the stored value must
 *     already be friendly.
 *
 * Both strings are < 160 chars so the async onFailure `truncateForUi`
 * (160-char cap) stores them intact.
 */

export const NO_SPEECH_MESSAGE =
  "We couldn't detect speech in your recording. If you were on Bluetooth or in a loud spot, try again with your built-in mic in a quieter place.";

export const CONNECTION_MESSAGE =
  "We had trouble reaching transcription. Your audio is saved — tap retry.";

/** Friendly strings we author ourselves — the sanitizer passes these
 *  through untouched instead of falling back to the generic copy. */
export const FRIENDLY_RECORDING_MESSAGES: ReadonlySet<string> = new Set([
  NO_SPEECH_MESSAGE,
  CONNECTION_MESSAGE,
]);

/**
 * True if `err` is an OpenAI / network connection failure (the OpenAI Node
 * SDK throws `APIConnectionError` with the literal message "Connection
 * error."). Classified as RETRYABLE by the pipeline.
 */
export function isConnectionError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    name === "APIConnectionError" ||
    name === "APIConnectionTimeoutError" ||
    /connection error|econnreset|etimedout|fetch failed|socket hang up|network error/.test(
      msg
    )
  );
}
