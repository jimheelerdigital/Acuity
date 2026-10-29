import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Send to Ripple",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Send to Ripple" },
};

export default function SendVideoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
