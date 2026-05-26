"use client";

import Image from "next/image";
import Link from "next/link";
import {
  TestimonialCarousel,
  STATIC_CAROUSEL_TESTIMONIALS,
} from "@/components/testimonial-carousel";

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

export function SuccessPageClient() {
  return (
    <div className="min-h-screen bg-[#181614] text-[#F5EDE4]">
      {/* ── Hero section ── */}
      <div className="flex flex-col items-center justify-center px-6 pt-16 pb-10 sm:pt-24 sm:pb-14">
        <div className="w-full max-w-md text-center">
          <div className="mb-6">
            <Image src="/AcuityLogo.png" alt="Acuity" width={48} height={48} className="mx-auto" />
          </div>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            You&rsquo;re in. Your first debrief is&nbsp;waiting.
          </h1>
          <p className="mt-3 text-base text-[#F5EDE4]/60 leading-relaxed">
            Your account is ready. Download the app to start your first debrief.
          </p>

          {/* Urgency nudge */}
          <p className="mt-4 text-sm text-amber-400/80">
            Your 14-day free trial has started — don&rsquo;t let it tick away in silence.
          </p>

          {/* ── App Store hero button — pulsing purple ── */}
          <div className="mt-8">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative inline-flex items-center gap-3 rounded-full bg-[#7C5CFC] px-8 py-4 text-base font-semibold text-white transition-all duration-300 hover:bg-[#6B4FE0] hover:shadow-xl hover:shadow-[#7C5CFC]/25 hover:-translate-y-0.5 active:scale-95"
            >
              <span className="absolute inset-0 rounded-full bg-[#7C5CFC]/30 animate-pulse-ring" />
              <AppleLogo />
              Download on the App Store
            </a>
          </div>

          {/* QR Code — desktop only */}
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
        </div>
      </div>

      {/* ── What happens next ── */}
      <section className="px-6 pb-12 sm:pb-16">
        <div className="mx-auto max-w-md">
          <h2 className="text-center text-lg font-semibold text-white mb-8">
            Here&rsquo;s what happens when you open Acuity
          </h2>
          <div className="space-y-6">
            <Step
              number="1"
              icon={<MicIcon />}
              title="Record"
              description="Hit record and talk about your day — 60 seconds is all it takes."
            />
            <Step
              number="2"
              icon={<SparklesIcon />}
              title="Extract"
              description="AI extracts your tasks, tracks your goals, and spots patterns you can't see."
            />
            <Step
              number="3"
              icon={<ChartIcon />}
              title="Reflect"
              description="Every Sunday, get a weekly report that shows how your life is actually going."
            />
          </div>
        </div>
      </section>

      {/* ── Testimonials — reuse homepage carousel ── */}
      <section className="pb-12 sm:pb-16">
        <TestimonialCarousel testimonials={STATIC_CAROUSEL_TESTIMONIALS} />
      </section>

      {/* ── Continue in browser ── */}
      <div className="px-6 pb-16 sm:pb-24 text-center">
        <Link
          href="/home"
          className="inline-block rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-[#F5EDE4]/80 transition hover:border-white/40 hover:text-white active:scale-95"
        >
          Continue in your browser →
        </Link>
        <p className="mt-2 text-xs text-[#F5EDE4]/30">
          You can always download the app later.
        </p>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function Step({
  number,
  icon,
  title,
  description,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#7C5CFC]/10">
        {icon}
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#7C5CFC]">
            Step {number}
          </span>
        </div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-[#F5EDE4]/60">{description}</p>
      </div>
    </div>
  );
}

function AppleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
      <path d="M14.94 13.5c-.37.82-.55 1.19-.97 1.91-.59.99-1.42 2.24-2.45 2.25-.92.01-1.16-.6-2.41-.59-1.25.01-1.51.6-2.43.59-1.03-.01-1.81-1.13-2.4-2.12C2.92 13.39 2.8 10.77 3.68 9.39c.63-1 1.63-1.58 2.57-1.58.96 0 1.56.6 2.35.6.77 0 1.24-.6 2.35-.6.84 0 1.73.46 2.35 1.24-2.06 1.13-1.73 4.07.37 4.85-.29.7-.43.99-.73 1.6zM11.37 3c.47-.6.83-1.45.7-2.32-.77.05-1.67.54-2.2 1.17-.48.57-.88 1.43-.73 2.26.84.03 1.72-.47 2.23-1.11z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg className="h-5 w-5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg className="h-5 w-5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="h-5 w-5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}
