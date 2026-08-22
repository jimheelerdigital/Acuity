# Orb update — drop-in spec

Update only the recording orb. Three reference files in this folder:

- `screen-recording.jsx` — the new `MorphOrb` component (prototype impl). Port this to RN.
- `Orb Exploration.html` — open in a browser to see the live morph behavior (variation A is the picked direction).
- This README — production implementation spec.

**RN porting note:** the prototype uses per-frame setState to rebuild the path. In production use `react-native-reanimated`'s `useDerivedValue` to compute the path string on the UI thread, then `useAnimatedProps` to feed it into `<Path>`. The shape morph runs continuously; the scale pulse is driven by mic RMS smoothed at ~80ms.

---

### 1. Voice-reactive recording orb _(Recording screen)_

The central orb is the ceremonial focal point — an organic morphing "lava lamp" blob, **not** a glossy sphere or marble. Shape is a 5-point Catmull-Rom-smoothed closed path (`tension 0.18`) whose control-point radii each wobble independently via a slow sine.

**Implementation reference:** `screen-recording.jsx → MorphOrb` and the standalone exploration in `Orb Exploration.html` (variation A is what ships).

**Shape morph (always on — both idle and active):**
- 5 control points evenly spaced around a base radius
- Each point's radius = baseR + `sin(t * freq[i] + phase[i]) * amp[i]`
- **Idle parameters:**
  - amps: `[3.5, 3.0, 4.0, 3.2, 3.6]` (≈±4% of baseR)
  - phases: `[0, 1.1, 2.3, 4.0, 5.5]` rad
  - freqs (rad/ms): `[0.00080, 0.00065, 0.00095, 0.00075, 0.00085]` — one full wobble cycle per 6.5–9.7s
- **Active (recording) parameters:**
  - amps: `[5.5, 5.0, 6.0, 5.2, 5.6]` (≈±6.5%)
  - phases: same as idle
  - freqs: `[0.0016, 0.0013, 0.0019, 0.0015, 0.0017]` — roughly 2× idle speed
- Smooth cardinal-spline interpolation so it never reads as a polygon

**Amplitude pulse (active only):**
- **Scale:** 1.0 → 1.14, mapped to smoothed RMS of mic input
- **Smoothing:** ~80ms exponential moving average so it breathes rather than chatters
- **Idle fallback:** when mic RMS is below threshold, fall back to the idle morph parameters above (no scale pulse)
- RN: read mic level via `expo-av` Recording's `onRecordingStatusUpdate` (or equivalent), drive an `Animated.Value` for scale

**Fill:**
- Radial gradient (`cx=38% cy=34% r=72%`) from `primaryHi → primary → secondary`
- **No specular highlight.** No top-left white shine, ever.
- **Ambient halo:** a single radial gradient circle at 1.35× baseR, `primary at 18%/0% stops`. **No separate ring, no outer aura.**

**Size:** 148px on the recording screen (baseR ≈ 62). Use the `size` prop on `MorphOrb` to adapt.

**Production tip:** the prototype uses `setState` per frame to drive the path string — fine for a mock but heavy in RN. Port using `react-native-svg` `<Path>` with `react-native-reanimated`'s `useDerivedValue` + `useAnimatedProps` so the path string is built on the UI thread.