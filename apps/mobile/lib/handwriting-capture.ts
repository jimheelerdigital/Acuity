import { requireOptionalNativeModule } from "expo";
import type * as ImagePickerTypes from "expo-image-picker";
import { Alert, Linking } from "react-native";

import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";

/**
 * Handwritten entry capture (2026-10-17, Miro "Take picture of a
 * handwritten journal entry").
 *
 *   pick/shoot → shrink to ≤1600px JPEG → POST /api/record/transcribe-image
 *   → the page's words, which the caller drops into the typed composer for
 *   review. Saving is then an ordinary typed entry.
 *
 * Shrinking on-device matters twice: Vercel's 4.5 MB body cap, and the
 * vision model doesn't read a 12 MP photo any better than a 1600px one.
 *
 * ── Native modules are optional (2026-10-18) ─────────────────────────
 * expo-image-picker and expo-image-manipulator are NATIVE. Build 183
 * (1.9.4, runtimeVersion "1.9.4" via the appVersion policy) doesn't
 * contain them, and an OTA to 1.9.4 ships this JS to it. Both packages
 * call requireNativeModule() when their JS is first evaluated, which
 * THROWS on a binary without them — so a static import here would take
 * the record screen down on 183. Instead: nothing native is touched at
 * import time, `handwritingCaptureAvailable()` asks the binary
 * (requireOptionalNativeModule returns null instead of throwing), the
 * record screen only shows the camera button when it's true, and the
 * modules are loaded with import() on first use. Same JS: no button on
 * 183, working button on 1.9.5+.
 */

const PICKER_NATIVE = "ExponentImagePicker";
const MANIPULATOR_NATIVE = "ExpoImageManipulator";

let availability: boolean | null = null;

/** True only when this binary contains both native modules. Cached. */
export function handwritingCaptureAvailable(): boolean {
  if (availability === null) {
    try {
      availability =
        requireOptionalNativeModule(PICKER_NATIVE) != null &&
        requireOptionalNativeModule(MANIPULATOR_NATIVE) != null;
    } catch {
      availability = false;
    }
  }
  return availability;
}

async function loadPicker() {
  return import("expo-image-picker");
}

async function loadManipulator() {
  return import("expo-image-manipulator");
}

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

export type CaptureSource = "camera" | "library";

export class HandwritingError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "permission"
      | "cancelled"
      | "no_text"
      | "too_large"
      | "paywall"
      | "rate_limited"
      | "network"
      | "server"
      | "unavailable"
  ) {
    super(message);
  }
}

async function ensurePermission(source: CaptureSource): Promise<boolean> {
  const ImagePicker = await loadPicker();
  const res =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (res.granted) return true;
  if (!res.canAskAgain) {
    Alert.alert(
      source === "camera" ? "Camera access is off" : "Photo access is off",
      "Turn it on in Settings to add a page from a photo.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => void Linking.openSettings() },
      ]
    );
  }
  return false;
}

/** Returns the picked asset's local URI, or null when the user backed out. */
export async function pickPage(source: CaptureSource): Promise<string | null> {
  if (!(await ensurePermission(source))) {
    throw new HandwritingError("Permission not granted", "permission");
  }
  const ImagePicker = await loadPicker();
  const opts: ImagePickerTypes.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1, // we re-encode below; avoid double compression artefacts
    exif: false,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

/** Downscale + JPEG-encode; returns base64 (no data: prefix). */
export async function shrinkToBase64(uri: string): Promise<string> {
  const ImageManipulator = await loadManipulator();
  const ctx = ImageManipulator.ImageManipulator.manipulate(uri);
  // Resize by the longer edge only when it exceeds MAX_EDGE; the API
  // keeps aspect ratio when one dimension is given, but we don't know the
  // orientation up front, so render first and read the size.
  const probe = await ctx.renderAsync();
  const landscape = probe.width >= probe.height;
  const needsResize = Math.max(probe.width, probe.height) > MAX_EDGE;
  const resized = needsResize
    ? await ImageManipulator.ImageManipulator.manipulate(uri)
        .resize(landscape ? { width: MAX_EDGE } : { height: MAX_EDGE })
        .renderAsync()
    : probe;
  const saved = await resized.saveAsync({
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!saved.base64) throw new HandwritingError("Encode failed", "server");
  return saved.base64;
}

/** Full flow: pick → shrink → transcribe. Resolves to the page text. */
export async function captureHandwrittenPage(
  source: CaptureSource
): Promise<string | null> {
  if (!handwritingCaptureAvailable()) {
    throw new HandwritingError(
      "Adding a page from a photo needs the latest version of Ripple.",
      "unavailable"
    );
  }
  const uri = await pickPage(source);
  if (!uri) return null;
  const image = await shrinkToBase64(uri);

  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${api.baseUrl()}/api/record/transcribe-image`, {
      method: "POST",
      headers,
      body: JSON.stringify({ image, mediaType: "image/jpeg" }),
    });
  } catch {
    throw new HandwritingError(
      "We couldn't reach Ripple. Check your connection and try again.",
      "network"
    );
  }
  const body = (await res.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
    code?: string;
  };
  if (res.ok && typeof body.text === "string") return body.text;
  if (res.status === 402) {
    throw new HandwritingError("Upgrade to add entries.", "paywall");
  }
  if (res.status === 429) {
    throw new HandwritingError(
      "You're adding entries quickly — give it a few minutes.",
      "rate_limited"
    );
  }
  if (res.status === 422) {
    throw new HandwritingError(
      body.error ?? "We couldn't find any writing in that photo.",
      "no_text"
    );
  }
  if (res.status === 413) {
    throw new HandwritingError(
      body.error ?? "That photo is too large.",
      "too_large"
    );
  }
  throw new HandwritingError(
    body.error ?? "We couldn't read that photo right now.",
    "server"
  );
}
