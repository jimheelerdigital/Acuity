"use client";

import { useAppearance } from "@/contexts/appearance-context";

/**
 * Three-state theme toggle: light / dark / system. Reads + writes
 * through `useAppearance()`, which persists via POST /api/user/theme
 * and applies `data-theme` to `<html>` immediately.
 *
 * Slice 21 (2026-05-24): swapped off next-themes. SSR gives us the
 * correct initial state in the AppearanceProvider; no mount gate
 * needed. The `localOnly` prop is preserved as a no-op so external
 * consumers don't break — the new appearance context is no-op for
 * unauthenticated routes (defaults), so passing localOnly is moot.
 *
 * Slice 22 (2026-05-24) replaces this with a richer Appearance
 * section in /account that also includes the palette picker. This
 * component is kept around for any standalone consumer that wants a
 * compact theme-only toggle.
 */
const OPTIONS = ["light", "dark", "system"] as const;
type ThemeChoice = (typeof OPTIONS)[number];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Props {
  /** No-op; retained for legacy consumer compatibility. */
  localOnly?: boolean;
}

export function ThemeToggle(_props: Props = {}) {
  const { themePreference, setThemePreference } = useAppearance();

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex h-9 items-center rounded-acuity-pill bg-acuity-bg-sub p-0.5 text-xs font-medium"
    >
      {OPTIONS.map((opt) => {
        const selected = themePreference === opt;
        return (
          <button
            key={opt}
            role="radio"
            aria-checked={selected}
            onClick={() => setThemePreference(opt)}
            className={`flex h-8 items-center justify-center rounded-acuity-pill px-3 transition ${
              selected
                ? "bg-acuity-card-bg text-acuity-text shadow-acuity-soft"
                : "text-acuity-text-sec hover:text-acuity-text"
            }`}
          >
            {labelFor(opt)}
          </button>
        );
      })}
    </div>
  );
}

function labelFor(opt: ThemeChoice): string {
  if (opt === "light") return "Light";
  if (opt === "dark") return "Dark";
  return "System";
}
