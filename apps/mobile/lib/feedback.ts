import Constants from "expo-constants";
import { Platform } from "react-native";

import { api } from "@/lib/api";

/**
 * Slice O (2026-05-18). Mobile-side feedback submission. POSTs to our
 * /api/feedback/submit proxy which enriches with server-side user
 * context and forwards to a Make.com webhook for distillation +
 * Monday.com routing.
 *
 * We auto-append mobile-side context (app version, build number, OS,
 * OS version) from expo-constants / react-native Platform — info the
 * server can't derive from the session alone.
 */

export type FeedbackType = "bug" | "feature" | "ux" | "other";

export interface SubmitFeedbackInput {
  content: string;
  type: FeedbackType;
}

export interface SubmitFeedbackResult {
  ok: boolean;
  /** Human-readable error message when ok=false. Safe to surface. */
  message: string | null;
}

export async function submitFeedback(
  input: SubmitFeedbackInput
): Promise<SubmitFeedbackResult> {
  const appVersion =
    (Constants.expoConfig?.version as string | undefined) ?? null;
  const buildNumber =
    (Constants.expoConfig?.ios?.buildNumber as string | undefined) ??
    (Constants.expoConfig?.android?.versionCode as
      | number
      | undefined)?.toString() ??
    null;

  try {
    await api.post("/api/feedback/submit", {
      content: input.content.trim(),
      type: input.type,
      appVersion,
      buildNumber,
      osName: Platform.OS === "ios" ? "iOS" : "Android",
      osVersion:
        typeof Platform.Version === "string"
          ? Platform.Version
          : String(Platform.Version),
    });
    return { ok: true, message: null };
  } catch (err) {
    const status = (err as { status?: number }).status;
    const errorCode = (err as { body?: { error?: string } }).body?.error;
    // Map the proxy's response codes to user-facing copy.
    if (status === 503 || errorCode === "Disabled") {
      return {
        ok: false,
        message:
          "Feedback isn't available right now. Please try again later.",
      };
    }
    if (status === 429) {
      return {
        ok: false,
        message:
          "You've sent a lot of feedback in the last hour. Please try again later.",
      };
    }
    if (status === 401) {
      return {
        ok: false,
        message: "Please sign in again, then try sending feedback.",
      };
    }
    if (errorCode === "ContentTooLong") {
      return {
        ok: false,
        message: "Your message is too long. Please trim it to 4000 characters or fewer.",
      };
    }
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Couldn't send: ${err.message}`
          : "Couldn't send feedback. Please try again.",
    };
  }
}
