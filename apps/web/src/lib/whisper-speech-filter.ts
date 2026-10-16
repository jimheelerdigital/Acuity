/**
 * Drop the parts of a Whisper transcript that Whisper made up.
 *
 * Whisper is known to "hallucinate": given silence, breathing or a second of
 * noise it returns fluent, plausible sentences nobody said. On 2026-10-15 a
 * ~2-second funnel take came back as "I need to have better days and
 * remember that I need to cry." and Ripple built a whole emotional summary
 * on it — Keenan had said nothing of the sort.
 *
 * `response_format: "verbose_json"` (whisper-1) returns per-segment
 * confidence. We apply the same rule Whisper's own reference decoder uses to
 * skip non-speech (openai/whisper `transcribe()` defaults):
 *
 *   no_speech_prob > 0.6  AND  avg_logprob < -1.0   → the segment is silence
 *
 * plus its repetition guard, compression_ratio > 2.4 (looping text such as
 * "Thank you. Thank you. Thank you."), and drop every segment when the whole
 * file is under MIN_AUDIO_SECONDS — far too short for a real debrief.
 *
 * Callers then apply their existing "too short or unclear" check to the
 * filtered text, so a hallucinated take now gets the friendly
 * "Record again" path instead of an invented summary.
 */

export const NO_SPEECH_PROB_THRESHOLD = 0.6;
export const LOGPROB_THRESHOLD = -1.0;
export const COMPRESSION_RATIO_THRESHOLD = 2.4;
export const MIN_AUDIO_SECONDS = 1.5;

export interface WhisperSegment {
  text: string;
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
}

export interface WhisperVerbose {
  text?: string;
  duration?: number;
  segments?: WhisperSegment[];
}

export interface FilteredTranscript {
  text: string;
  /** Segments dropped as non-speech / hallucination. */
  dropped: number;
  total: number;
  duration: number | null;
}

export function isLikelyHallucinated(seg: WhisperSegment): boolean {
  const noSpeech = seg.no_speech_prob ?? 0;
  const logprob = seg.avg_logprob ?? 0;
  if (noSpeech > NO_SPEECH_PROB_THRESHOLD && logprob < LOGPROB_THRESHOLD) return true;
  if ((seg.compression_ratio ?? 0) > COMPRESSION_RATIO_THRESHOLD) return true;
  return false;
}

export function filterWhisperVerbose(res: WhisperVerbose | string): FilteredTranscript {
  // A plain string means no segment data (e.g. a model without
  // verbose_json): keep the old behaviour rather than guessing.
  if (typeof res === "string") {
    return { text: res.trim(), dropped: 0, total: 0, duration: null };
  }
  const duration = typeof res.duration === "number" ? res.duration : null;
  const segments = Array.isArray(res.segments) ? res.segments : null;
  if (!segments) {
    return { text: (res.text ?? "").trim(), dropped: 0, total: 0, duration };
  }
  if (duration !== null && duration < MIN_AUDIO_SECONDS) {
    return { text: "", dropped: segments.length, total: segments.length, duration };
  }
  const kept = segments.filter((s) => !isLikelyHallucinated(s));
  return {
    text: kept
      .map((s) => s.text.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
    dropped: segments.length - kept.length,
    total: segments.length,
    duration,
  };
}
