import { Audio } from "expo-av";

/**
 * Recording options for every voice capture in the app.
 *
 * ── Why this exists (production 413, 2026-08-20) ─────────────────────
 * Full-length (~5 min) recordings were failing upload with HTTP 413 while
 * short ones succeeded. Vercel caps serverless request bodies at 4.5MB and
 * that limit is not configurable, so the request was rejected at the edge
 * before any handler ran — which is why the failure was opaque rather than
 * one of our own error messages.
 *
 * DB proof: the voice-entries bucket's largest object was 4.28MB, with 112
 * files clustered at 4.0–4.5MB and ZERO above 4.5MB. Everything larger was
 * being silently rejected.
 *
 * The cause was `RecordingOptionsPresets.HIGH_QUALITY`: 128 kbps STEREO at
 * 44.1 kHz. At 300s that is 128000 × 300 / 8 ≈ 4.8MB — over the cap, which
 * matches the observed ceiling exactly.
 *
 * ── Why 64 kbps mono is the right target, not a compromise ───────────
 * This is speech destined for Whisper, not music.
 *   - MONO: a phone has one microphone. Stereo was storing two copies of the
 *     same signal and doubling the bitrate for nothing.
 *   - 64 kbps AAC is comfortably above the rate at which speech
 *     intelligibility saturates; Whisper's own resampling target is 16 kHz.
 *   - 22.05 kHz sample rate still covers the full speech band (human voice
 *     tops out ~8 kHz; Nyquist gives us ~11 kHz).
 *
 * Result: 300s ≈ 64000 × 300 / 8 ≈ 2.4MB — roughly half the cap, with room
 * for container overhead.
 *
 * ── This is a STOPGAP ────────────────────────────────────────────────
 * It buys headroom; it does not remove the ceiling. A long enough recording
 * still eventually hits 4.5MB (~9.8 min at this bitrate). The real fix is
 * direct-to-storage upload, after which the bitrate could be raised again if
 * anyone wants it.
 */
export const SPEECH_RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: ".m4a",
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: ".m4a",
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 64000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 64000,
  },
};

/** Bytes per second at the configured bitrate — for size estimates/tests. */
export const SPEECH_BYTES_PER_SECOND = 64000 / 8;

/** Vercel's serverless request body limit. Not configurable. */
export const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

/** Estimated upload size for a recording of `seconds` at these settings. */
export function estimateRecordingBytes(seconds: number): number {
  return seconds * SPEECH_BYTES_PER_SECOND;
}
