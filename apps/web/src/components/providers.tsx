"use client";

import { SessionProvider } from "next-auth/react";
import { type ReactNode } from "react";

import { PostHogProvider } from "@/components/posthog-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <PostHogProvider>{children}</PostHogProvider>
    </SessionProvider>
  );
}
