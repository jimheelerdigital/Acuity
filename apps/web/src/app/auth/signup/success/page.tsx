import Link from "next/link";
import type { Metadata } from "next";
import { AppStoreBadge } from "@/components/landing-shared";
import { TrackCompleteRegistration } from "@/components/meta-pixel-events";

export const metadata: Metadata = {
  title: "You're in — Download Acuity",
  robots: { index: false, follow: false },
};

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

export default function SignupSuccessPage() {
  return (
    <div className="min-h-screen bg-[#181614] flex items-center justify-center px-6">
      <TrackCompleteRegistration />
      <div className="w-full max-w-md text-center animate-fade-in">
        <div className="mb-6">
          <img src="/AcuityLogo.png" alt="Acuity" className="mx-auto" style={{ width: 48, height: 48 }} />
        </div>

        <h1 className="text-3xl font-bold text-[#F5EDE4] tracking-tight">
          You&apos;re in. Now download Acuity.
        </h1>
        <p className="mt-3 text-base text-[#F5EDE4]/60 leading-relaxed">
          Your account is ready. Download the app to start your first debrief.
        </p>

        {/* App Store Badge */}
        <div className="mt-8">
          <AppStoreBadge className="mx-auto" />
        </div>

        {/* QR Code for desktop users */}
        <div className="mt-8 hidden sm:block">
          <p className="text-xs text-[#F5EDE4]/40 mb-3">On desktop? Scan to download.</p>
          <div className="inline-block rounded-xl bg-white p-3">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(APP_STORE_URL)}&bgcolor=ffffff&color=181614`}
              alt="QR code to download Acuity"
              width={140}
              height={140}
            />
          </div>
        </div>

        {/* Fallback web link */}
        <p className="mt-8 text-sm text-[#F5EDE4]/40">
          Or{" "}
          <Link href="/home" className="text-[#7C5CFC] hover:text-[#6B4FE0] font-medium">
            continue in your browser
          </Link>
        </p>
      </div>
    </div>
  );
}
