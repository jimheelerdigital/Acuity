/**
 * Marketing Recording phone-mockup — animated representation of the
 * in-app recording screen. The mic orb pulses gently and the waveform
 * bars bounce with staggered delays to simulate live voice input.
 * Token-object driven (fixed dark mode).
 */
import type { AcuityTokens } from "@acuity/shared";

import { AcuityDevice, AcuityStatus } from "./chrome";

export function RecordingScreen({ t }: { t: AcuityTokens }) {
  return (
    <AcuityDevice t={t}>
      <AcuityStatus dark={t.mode === "dark"} time="10:14" />

      {/* Background glow — record gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: t.recordGrad,
          zIndex: 2,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 3,
          gap: 28,
          paddingBottom: 60,
        }}
      >
        {/* REC pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 14px 7px 10px",
            borderRadius: 999,
            background: "oklch(1 0 0 / 0.08)",
            backdropFilter: "blur(20px) saturate(180%)",
            border: "0.5px solid oklch(1 0 0 / 0.12)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: t.bad,
              boxShadow: `0 0 8px ${t.bad}`,
            }}
          />
          <span
            style={{
              fontFamily: t.mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              color: "#ffffffd9",
              textTransform: "uppercase",
            }}
          >
            REC
          </span>
        </div>

        {/* Mic orb with pulsating glow */}
        <div style={{ position: "relative" }}>
          {/* Animated outer glow halo */}
          <div
            className="acuity-orb-pulse"
            style={{
              position: "absolute",
              inset: -24,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${t.primary} 0%, transparent 70%)`,
              opacity: 0.18,
              filter: "blur(14px)",
            }}
          />
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              background: t.gradPrimary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: t.glowPrimary,
              border: "0.5px solid oklch(1 0 0 / 0.25)",
              position: "relative",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={44}
              height={44}
              fill="none"
              stroke="#fff"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </div>
        </div>

        {/* Timer */}
        <div
          style={{
            fontFamily: t.mono,
            fontSize: 32,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          0:47
        </div>

        {/* Animated waveform bars */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 3,
            height: 48,
            padding: "0 30px",
            width: "100%",
          }}
        >
          {WAVE_BARS.map((h, i) => (
            <div
              key={i}
              className="acuity-wave-bar"
              style={{
                width: 3,
                height: `${h}%`,
                borderRadius: 2,
                background:
                  i >= WAVE_BARS.length - 6
                    ? `linear-gradient(180deg, ${t.primaryHi}, ${t.primary})`
                    : `oklch(1 0 0 / ${0.18 + (h / 100) * 0.3})`,
                animationDelay: `${(i * 0.08) % 1.2}s`,
                animationDuration: `${0.8 + (i % 5) * 0.15}s`,
              }}
            />
          ))}
        </div>

        {/* Helper text */}
        <p
          style={{
            fontFamily: t.sans,
            fontSize: 15,
            color: "oklch(1 0 0 / 0.55)",
            textAlign: "center",
            maxWidth: 240,
            lineHeight: 1.4,
          }}
        >
          Talk through your day. Acuity is listening.
        </p>
      </div>
    </AcuityDevice>
  );
}

// Static waveform bar heights — baseline heights that the animation
// scales from. Each bar bounces between scaleY(0.4) and scaleY(1)
// with a staggered delay to simulate live voice input.
const WAVE_BARS = [
  30, 50, 35, 65, 45, 80, 55, 90, 60, 75, 50, 85, 65, 95, 70, 60,
  80, 45, 70, 90, 55, 75, 40, 65, 85, 50, 70, 80, 60, 90,
];
