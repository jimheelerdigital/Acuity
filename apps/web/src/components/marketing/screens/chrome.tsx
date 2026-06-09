/**
 * Marketing phone-mockup chrome — ported from the design handoff
 * (`marketing_handoff/acuity-chrome.jsx`) to TS. These render the REAL
 * app-screen chrome (status bar, tab bar, ring/sparkbar, device frame)
 * at a FIXED token mode (the marketing phones don't follow the page
 * theme — each screen passes its own `t` from makeAcuityTokens).
 *
 * Token-object driven (not CSS vars) so the screens stay pixel-true to
 * the app regardless of the page's data-theme. Pure presentational —
 * server-renderable (no hooks). See SHARED_TOKENS_MIGRATION.md.
 */
import type { CSSProperties, ReactNode } from "react";

import type { AcuityTokens } from "@acuity/shared";

export interface IconProps {
  color: string;
  size?: number;
  weight?: number;
}

type IconFn = (p: IconProps) => ReactNode;

// Icons — 24px artboard, 1.7 stroke, friendly rounded joins.
export const AcuityIcons: Record<string, IconFn> = {
  home: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 22} height={p.size || 22} fill="none" stroke={p.color} strokeWidth={p.weight || 1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 11.2 12 4l8.5 7.2" />
      <path d="M5.8 10v9.5h12.4V10" />
    </svg>
  ),
  entries: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 22} height={p.size || 22} fill="none" stroke={p.color} strokeWidth={p.weight || 1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <path d="M8 9.5h8M8 13h8M8 16.5h5" />
    </svg>
  ),
  tasks: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 22} height={p.size || 22} fill="none" stroke={p.color} strokeWidth={p.weight || 1.7} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="7" r="2.6" />
      <circle cx="6.5" cy="17" r="2.6" />
      <path d="M11.5 7h8.5M11.5 17H20" />
    </svg>
  ),
  goals: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 22} height={p.size || 22} fill="none" stroke={p.color} strokeWidth={p.weight || 1.7} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.3" fill={p.color} stroke="none" />
    </svg>
  ),
  insights: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 22} height={p.size || 22} fill="none" stroke={p.color} strokeWidth={p.weight || 1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V11M10 19V5M16 19V13M22 19h-20" />
    </svg>
  ),
  mic: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 22} height={p.size || 22} fill="none" stroke={p.color} strokeWidth={p.weight || 1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
  micFill: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 22} height={p.size || 22}>
      <rect x="9" y="3" width="6" height="12" rx="3" fill={p.color} />
      <path d="M5 11a7 7 0 0 0 14 0" fill="none" stroke={p.color} strokeWidth={1.8} strokeLinecap="round" />
      <path d="M12 18v3" fill="none" stroke={p.color} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  ),
  arrow: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} fill="none" stroke={p.color} strokeWidth={p.weight || 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  arrowUR: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} fill="none" stroke={p.color} strokeWidth={p.weight || 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  ),
  chevron: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none" stroke={p.color} strokeWidth={p.weight || 2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  more: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} fill={p.color}>
      <circle cx="6" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18" cy="12" r="1.7" />
    </svg>
  ),
  sparkle: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} fill="none" stroke={p.color} strokeWidth={p.weight || 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5v3.5M12 17v3.5M3.5 12h3.5M17 12h3.5" />
      <path d="M12 7c0 2.8 2.2 5 5 5-2.8 0-5 2.2-5 5 0-2.8-2.2-5-5-5 2.8 0 5-2.2 5-5z" fill={p.color} stroke="none" opacity="0.85" />
    </svg>
  ),
  flame: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} fill={p.color}>
      <path d="M12 2.5c.5 3 3 4.3 3 7.4 0 1.8-1 3.2-2.4 3.2-1 0-1.7-.6-1.7-1.5 0-1.2.9-1.4.9-2.6 0-1-.8-1.4-1.5-.5-1.8 2-2.8 3.7-2.8 5.9C7.5 17.6 9.6 20 12 20s4.5-2.4 4.5-5.6c0-4.8-4.5-6.6-4.5-11.9z" />
    </svg>
  ),
  check: (p) => (
    <svg viewBox="0 0 24 24" width={p.size || 14} height={p.size || 14} fill="none" stroke={p.color} strokeWidth={p.weight || 2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5 10 17l9-10" />
    </svg>
  ),
};

// Status bar
export function AcuityStatus({ dark = true, time = "7:42", tone }: { dark?: boolean; time?: string; tone?: string }) {
  const c = tone || (dark ? "#fff" : "#15131A");
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "18px 32px 0",
      fontFamily: '-apple-system, "SF Pro Text", system-ui',
      fontWeight: 600, fontSize: 16, color: c, letterSpacing: -0.2,
    }}>
      <span style={{ minWidth: 60 }}>{time}</span>
      <div style={{ display: "flex", gap: 7, alignItems: "center", minWidth: 60, justifyContent: "flex-end" }}>
        <svg width="19" height="12" viewBox="0 0 19 12">
          <rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill={c} />
          <rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill={c} />
          <rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill={c} />
          <rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill={c} />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke={c} strokeOpacity="0.4" fill="none" />
          <rect x="2" y="2" width="17" height="9" rx="2" fill={c} />
          <path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill={c} fillOpacity="0.5" />
        </svg>
      </div>
    </div>
  );
}

// Bottom tab bar — floating pill, 5 tabs, center mic FAB
export function AcuityTabBar({ active = "home", t, withFab = true }: { active?: string; t: AcuityTokens; withFab?: boolean }) {
  const tabs: { id: string; label: string; icon: IconFn }[] = [
    { id: "home", label: "Home", icon: AcuityIcons.home },
    { id: "entries", label: "Entries", icon: AcuityIcons.entries },
    { id: "tasks", label: "Tasks", icon: AcuityIcons.tasks },
    { id: "goals", label: "Goals", icon: AcuityIcons.goals },
    { id: "insights", label: "Insights", icon: AcuityIcons.insights },
  ];
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0,
      paddingBottom: 26, paddingTop: 14, pointerEvents: "none", zIndex: 40,
      // NB: prototype used `${t.bg}D9` (hex-alpha concat) which is invalid
      // on oklch() strings — use color-mix for the fade instead.
      background: t.mode === "dark"
        ? `linear-gradient(180deg, transparent 0%, color-mix(in oklch, ${t.bg}, transparent 15%) 70%, ${t.bg} 100%)`
        : `linear-gradient(180deg, transparent 0%, color-mix(in oklch, ${t.bg}, transparent 10%) 70%, ${t.bg} 100%)`,
    }}>
      <div style={{ position: "relative", margin: "0 14px", pointerEvents: "auto" }}>
        <div style={{
          height: 60, borderRadius: 30,
          background: t.mode === "dark" ? "oklch(0.20 0.018 280 / 0.75)" : "oklch(1 0 0 / 0.78)",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
          border: `0.5px solid ${t.lineStrong}`,
          boxShadow: t.shadowLift,
          display: "flex", alignItems: "center", padding: "0 4px",
        }}>
          {tabs.map((tab) => {
            const isActive = tab.id === active;
            const isCenter = tab.id === "tasks" && withFab;
            const Icon = tab.icon;
            return (
              <div key={tab.id} style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", gap: 2, position: "relative",
                opacity: isCenter ? 0 : 1,
                pointerEvents: isCenter ? "none" : "auto",
              }}>
                <Icon color={isActive ? t.primary : t.textTer} weight={isActive ? 2 : 1.7} />
                <div style={{
                  fontSize: 10, fontWeight: 600,
                  color: isActive ? t.primary : t.textTer,
                  letterSpacing: 0.1, fontFamily: t.sans, position: "relative", zIndex: 1,
                }}>{tab.label}</div>
              </div>
            );
          })}
        </div>
        {withFab && (
          <div style={{
            position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)",
            width: 60, height: 60, borderRadius: 30,
            background: t.gradPrimary,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: t.glowPrimary,
            border: "0.5px solid oklch(1 0 0 / 0.25)",
          }}>
            {AcuityIcons.mic({ color: "#fff", weight: 2, size: 26 })}
          </div>
        )}
      </div>
    </div>
  );
}

// Theme pill with gradient dot
export function AcuityThemePill({ label, hue, t, size = "m" }: { label: string; hue: number; t: AcuityTokens; size?: "s" | "m" }) {
  const px = size === "s" ? 10 : 12;
  const py = size === "s" ? 5 : 7;
  const fs = size === "s" ? 12 : 13;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: `${py}px ${px + 2}px ${py}px ${px}px`,
      borderRadius: 999, fontFamily: t.sans, fontSize: fs,
      fontWeight: 600, letterSpacing: -0.1, color: t.text,
      background: t.mode === "dark" ? `oklch(0.22 0.02 ${hue} / 0.65)` : `oklch(0.96 0.04 ${hue})`,
      border: `0.5px solid ${t.line}`,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: 4,
        background: `linear-gradient(135deg, oklch(0.78 0.16 ${hue}), oklch(0.55 0.16 ${hue}))`,
        boxShadow: `0 0 6px oklch(0.66 0.14 ${hue} / 0.35)`,
      }} />
      {label}
    </span>
  );
}

// RingProgress — SVG ring with optional gradient stroke, center slot
export function RingProgress({ value = 0, size = 96, stroke = 8, t, color, trackColor, children, gradient = true }: {
  value?: number; size?: number; stroke?: number; t: AcuityTokens;
  color?: string; trackColor?: string; children?: ReactNode; gradient?: boolean;
}) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const off = C * (1 - Math.min(1, Math.max(0, value)));
  const stop1 = color || t.primary;
  const stop2 = t.secondary;
  const gradId = `rg-${Math.round(value * 1000)}-${size}-${(stop1 + stop2).length}`;
  return (
    <div style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          {gradient && (
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={stop1} />
              <stop offset="100%" stopColor={stop2} />
            </linearGradient>
          )}
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={trackColor || (t.mode === "dark" ? "oklch(1 0 0 / 0.08)" : "oklch(0 0 0 / 0.06)")}
          strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={gradient ? `url(#${gradId})` : stop1}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={off} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

// Sparkbar — small bar chart for weekly cards
export function Sparkbar({ values, t, height = 28, color, gap = 3 }: {
  values: number[]; t: AcuityTokens; height?: number; color?: string; gap?: number;
}) {
  const max = Math.max(...values);
  void color;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", height, gap }}>
      {values.map((v, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${Math.max(8, (v / max) * 100)}%`,
          borderRadius: 3,
          background: i === values.length - 1
            ? `linear-gradient(180deg, ${t.primaryHi}, ${t.primary})`
            : t.mode === "dark" ? "oklch(1 0 0 / 0.18)" : "oklch(0 0 0 / 0.10)",
        }} />
      ))}
    </div>
  );
}

// Device frame
export function AcuityDevice({ children, t, width = 402, height = 874 }: {
  children?: ReactNode; t: AcuityTokens; width?: number; height?: number;
}) {
  const grainBlend: CSSProperties["mixBlendMode"] = t.mode === "dark" ? "overlay" : "multiply";
  return (
    <div style={{
      width, height, borderRadius: 56, overflow: "hidden",
      position: "relative", background: t.bg,
      boxShadow: t.mode === "dark"
        ? "0 30px 80px oklch(0 0 0 / 0.6), 0 0 0 1.5px oklch(0.30 0.01 280), 0 0 0 8px oklch(0.16 0.01 280)"
        : "0 30px 80px oklch(0 0 0 / 0.18), 0 0 0 1.5px oklch(0.85 0 0), 0 0 0 8px oklch(0.95 0 0)",
      fontFamily: t.sans,
      WebkitFontSmoothing: "antialiased",
    }}>
      {/* Grain overlay — above bg, below content, no pointer events */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
        backgroundImage: t.grain, backgroundRepeat: "repeat",
        mixBlendMode: grainBlend,
      }} />
      <div style={{
        position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)",
        width: 126, height: 37, borderRadius: 24, background: "#000", zIndex: 50,
      }} />
      {children}
      <div style={{
        position: "absolute", bottom: 8, left: 0, right: 0, zIndex: 60,
        display: "flex", justifyContent: "center", pointerEvents: "none",
      }}>
        <div style={{
          width: 139, height: 5, borderRadius: 100,
          background: t.mode === "dark" ? "oklch(1 0 0 / 0.7)" : "oklch(0 0 0 / 0.28)",
        }} />
      </div>
    </div>
  );
}
