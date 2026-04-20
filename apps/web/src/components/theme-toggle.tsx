"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { saveThemePreference } from "@/app/actions/save-theme";

/**
 * Three-state theme toggle: light / dark / system. Renders as a small
 * segmented control so the user's current choice is visible at a glance
 * without clicking. Calls the save-theme server action after every
 * switch so the preference persists to the DB and survives device
 * changes (localStorage only covers the same browser).
 *
 * Hydration note: next-themes resolves the theme asynchronously after
 * mount — before that, `theme` is undefined and the DOM has no dark
 * class regardless of the user's stored preference. Rendering the
 * toggle during that window causes a flash when the correct value
 * arrives. Gate render on `mounted` to suppress it.
 */
const OPTIONS = ["light", "dark", "system"] as const;
type ThemeChoice = (typeof OPTIONS)[number];

interface Props {
  /**
   * When true, skip the server-side save. Useful when the toggle is
   * shown on a public page (e.g. /auth/signin) where the user isn't
   * authenticated yet and the server action would 401.
   */
  localOnly?: boolean;
}

export function ThemeToggle({ localOnly = false }: Props) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Placeholder with the same footprint so layout doesn't shift.
    return (
      <div className="h-9 w-[156px] rounded-full bg-zinc-200 dark:bg-zinc-800" />
    );
  }

  const current = (theme as ThemeChoice) ?? "system";

  const pick = async (next: ThemeChoice) => {
    setTheme(next);
    if (!localOnly) {
      // Fire-and-forget; network failure shouldn't revert the UI.
      void saveThemePreference(next);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex h-9 items-center rounded-full bg-zinc-200/70 p-0.5 text-xs font-medium dark:bg-zinc-800/70"
    >
      {OPTIONS.map((opt) => {
        const selected = current === opt;
        return (
          <button
            key={opt}
            role="radio"
            aria-checked={selected}
            onClick={() => pick(opt)}
            className={`flex h-8 items-center justify-center rounded-full px-3 transition ${
              selected
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
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
