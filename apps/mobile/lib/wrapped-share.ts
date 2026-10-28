import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { RefObject } from "react";
import { Platform, Share, type View } from "react-native";

/**
 * Share Ripple Wrapped as an image, falling back to text (2026-10-28).
 *
 * ── Native module guard ──────────────────────────────────────────────
 * react-native-view-shot is a native module that first ships in the 1.9.7
 * binary. runtimeVersion is "appVersion", so an OTA can still reach a
 * binary that lacks it. Its spec calls TurboModuleRegistry.getEnforcing at
 * import time, which THROWS when the native side is missing, so it is only
 * ever required lazily, inside try/catch, at the moment of sharing. Any
 * failure (missing module, capture error, sharing unavailable) falls back to
 * the existing text share, so the button always does something.
 *
 * Typed locally instead of importing the package's types, so this file
 * type-checks whether or not node_modules has the package yet.
 */

type CaptureRef = (
  view: RefObject<View | null>,
  options: {
    format: "png" | "jpg";
    quality: number;
    result: "tmpfile";
    width?: number;
    height?: number;
  }
) => Promise<string>;

type ViewShotModule = { captureRef: CaptureRef };

function loadViewShot(): ViewShotModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-view-shot") as Partial<ViewShotModule>;
    return typeof mod?.captureRef === "function" ? (mod as ViewShotModule) : null;
  } catch {
    return null;
  }
}

/**
 * Copy the capture into the app's cache directory under a readable name.
 * view-shot may write to Android's EXTERNAL cache; expo-sharing's file
 * provider reliably serves the internal cache (the Obsidian export shares
 * from there too). The file is not deleted after sharing: on Android the
 * share sheet returns before the receiving app has read it, and the OS
 * reclaims the cache anyway. Same name per period, so re-shares overwrite.
 */
async function stageInCache(captured: string, periodKey: string): Promise<string> {
  const from = captured.startsWith("file://") ? captured : `file://${captured}`;
  const dir = FileSystem.cacheDirectory;
  if (!dir) return from;
  const to = `${dir}ripple-wrapped-${periodKey.replace(/[^0-9A-Za-z-]/g, "")}.png`;
  try {
    await FileSystem.deleteAsync(to, { idempotent: true });
    await FileSystem.copyAsync({ from, to });
    return to;
  } catch {
    return from;
  }
}

export type WrappedShareResult = "image" | "text" | "failed";

export async function shareWrapped(opts: {
  /** The off-screen WrappedShareCard to capture. */
  cardRef: RefObject<View | null>;
  /** The privacy-safe text (wrappedShareText); the fallback. */
  text: string;
  dialogTitle: string;
  /** Period key (YYYY-MM or YYYY), for the file name. */
  periodKey: string;
}): Promise<WrappedShareResult> {
  const viewShot = loadViewShot();
  if (viewShot && opts.cardRef.current) {
    try {
      const captured = await viewShot.captureRef(opts.cardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
        // iOS captures at device scale (360×640 pt → 1080×1920 on 3x). On
        // Android these are output pixels, so pin the story size.
        ...(Platform.OS === "android" ? { width: 1080, height: 1920 } : {}),
      });
      if (await Sharing.isAvailableAsync()) {
        const fileUri = await stageInCache(captured, opts.periodKey);
        await Sharing.shareAsync(fileUri, {
          mimeType: "image/png",
          UTI: "public.png",
          dialogTitle: opts.dialogTitle,
        });
        return "image";
      }
    } catch (err) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn("[wrapped-share] image share failed, falling back to text", err);
      }
    }
  }

  try {
    await Share.share({ message: opts.text });
    return "text";
  } catch {
    return "failed";
  }
}
