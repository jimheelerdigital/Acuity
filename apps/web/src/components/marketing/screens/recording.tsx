/**
 * Marketing Recording phone-mockup — static representation of the
 * in-app recording screen. Shows the mic orb, timer, waveform bars,
 * and a glass "REC" pill. Token-object driven (fixed dark mode).
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
            border: `0.5px solid oklch(1 0 0 / 0.12)`,
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

        {/* Mic orb */}
        <div style={{ position: "relative" }}>
          {/* Outer glow halo */}
          <div
            style={{
              position: "absolute",
              inset: -20,
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

        {/* Waveform bars */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            height: 40,
            padding: "0 40px",
          }}
        >
          {WAVE_BARS.map((h, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: `${h}%`,
                borderRadius: 2,
                background:
                  i >= WAVE_BARS.length - 4
                    ? `linear-gradient(180deg, ${t.primaryHi}, ${t.primary})`
                    : `oklch(1 0 0 / ${0.15 + (h / 100) * 0.25})`,
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

// Static waveform bar heights — mimics a voice-reactive pattern.
const WAVE_BARS = [
  20, 35, 25, 50, 40, 65, 45, 75, 55, 85, 60, 70, 50, 90, 65, 80, 55, 95,
  70, 60, 85, 75, 55, 40, 70, 80, 65, 90, 75, 85,
];
