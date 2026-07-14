"use client";

import { SessionProvider } from "next-auth/react";
import { type ReactNode } from "react";
import { Toaster } from "sonner";

import { PostHogProvider } from "@/components/posthog-provider";
import { PendingEntriesProvider } from "@/contexts/pending-entries-context";
import {
  AppearanceProvider,
  type Palette,
  type ResolvedTheme,
  type ThemePreference,
} from "@/contexts/appearance-context";

/**
 * Client-only provider tree. The outer NextAuth session wrapper is on
 * top so all downstream children have auth context. Appearance comes
 * next (light/dark/system + 4-palette parametric) so children can
 * read it without waiting on session.
 *
 * Slice 21 (2026-05-24): replaced `next-themes` with the in-house
 * `<AppearanceProvider>`. next-themes only modeled `theme` and used
 * `attribute="class"`; Ripple needs theme + palette as data attribute
 * pair on `<html>` so the parametric tokens.css cascade works. SSR
 * passes initial values from User.theme + User.themePalette via
 * layout.tsx so first paint matches the persisted preference.
 */
export interface ProvidersProps {
  initialThemePreference: ThemePreference;
  initialPalette: Palette;
  initialResolvedTheme: ResolvedTheme;
  children: ReactNode;
}

export function Providers({
  initialThemePreference,
  initialPalette,
  initialResolvedTheme,
  children,
}: ProvidersProps) {
  return (
    <SessionProvider>
      <AppearanceProvider
        initialThemePreference={initialThemePreference}
        initialPalette={initialPalette}
        initialResolvedTheme={initialResolvedTheme}
      >
        <PostHogProvider>
          <PendingEntriesProvider>{children}</PendingEntriesProvider>
          <Toaster position="top-center" richColors closeButton />
        </PostHogProvider>
      </AppearanceProvider>
    </SessionProvider>
  );
}
