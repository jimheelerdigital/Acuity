import type { Metadata } from "next";

// Hidden QA page (2026-10-03): never indexed.
export const metadata: Metadata = {
  title: "Microphone test",
  robots: { index: false, follow: false },
};

export default function MicTestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
