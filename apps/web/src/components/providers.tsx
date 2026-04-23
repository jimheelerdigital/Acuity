"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { type ReactNode } from "react";

import { PostHogProvider } from "@/components/posthog-provider";

/**
 * Client-only provider tree. The outer NextAuth session wrapper is on
 * top so all downstream children have auth context. next-themes sits
 * inside because theme preference is UI-only and doesn't need to wait
 * on session to be ready.
 *
 * ThemeProvider config:
 *   - `attribute="class"` pairs with tailwind.config.ts darkMode:"class"
 *     so React toggles class="dark" on <html>.
 *   - `defaultTheme="system"` respects the OS preference on first load.
 *     Once the user picks light/dark via the toggle, next-themes
 *     persists their choice to localStorage and honors it across
 *     reloads.
 *   - `disableTransitionOnChange` prevents a flash of weird-colored
 *     transitions when toggling — stops every element's transition
 *     from firing during the class swap, then re-enables after.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        forcedTheme="dark"
        disableTransitionOnChange
      >
        <PostHogProvider>{children}</PostHogProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
