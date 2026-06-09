/**
 * Scales a real 402×874 app screen down into the marketing layout, with
 * a soft primary/secondary halo behind it. Ported from the handoff
 * (`marketing_handoff/marketing.jsx → PhoneFrame`).
 *
 * The halo uses the token [L,C,H] triplets (t._primary / t._secondary)
 * with explicit oklch alpha — the prototype's `${t.primary}33` hex-alpha
 * concat is invalid on oklch() strings.
 */
import type { ReactNode } from "react";

import type { AcuityTokens } from "@acuity/shared";

const W = 402;
const H = 874;

export function PhoneFrame({
  children,
  scale = 0.72,
  t,
  halo = true,
}: {
  children?: ReactNode;
  scale?: number;
  t: AcuityTokens;
  halo?: boolean;
}) {
  const [pl, pc, ph] = t._primary;
  const [sl, sc, sh] = t._secondary;
  return (
    <div style={{ position: "relative", width: W * scale, height: H * scale }}>
      {halo && (
        <div
          style={{
            position: "absolute",
            inset: "-12% -18%",
            zIndex: 0,
            pointerEvents: "none",
            background: `radial-gradient(60% 50% at 50% 38%, oklch(${pl} ${pc} ${ph} / 0.2) 0%, transparent 70%),
                         radial-gradient(55% 45% at 70% 65%, oklch(${sl} ${sc} ${sh} / 0.18) 0%, transparent 70%)`,
            filter: "blur(20px)",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
