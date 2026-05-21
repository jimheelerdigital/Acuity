import Link from "next/link";
import type { Metadata } from "next";
import { TrackCompleteRegistration } from "@/components/meta-pixel-events";
import { SyncAttribution } from "./sync-attribution";
import { SuccessPageClient } from "./success-client";

export const metadata: Metadata = {
  title: "You're in — Download Acuity",
  robots: { index: false, follow: false },
};

export default function SignupSuccessPage() {
  return (
    <>
      <TrackCompleteRegistration />
      <SyncAttribution />
      <SuccessPageClient />
    </>
  );
}
