/**
 * Recording-screen visual primitives (Slice Q5, 2026-05-20).
 *
 * Visual-layer only — state machine, audio capture, upload, and
 * polling all live in apps/mobile/app/record.tsx untouched. These
 * components consume signals that already exist (levels[], elapsed)
 * and never add new audio listeners or API calls.
 */

export { RecordOrb, type RecordOrbProps } from "./RecordOrb";
export {
  SpeedometerGauge,
  type SpeedometerGaugeProps,
} from "./SpeedometerGauge";
export { RecordWaveform, type RecordWaveformProps } from "./RecordWaveform";
