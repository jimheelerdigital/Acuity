import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-[#7C5CFC]">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Page not found
      </h1>
      <p className="mt-4 text-[#A0A0B8] max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-8 flex items-center gap-4">
        <a
          href="/"
          className="rounded-full bg-[#7C5CFC] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0]"
        >
          Go home
        </a>
        <a
          href="/blog"
          className="text-sm font-medium text-[#A0A0B8] transition hover:text-white"
        >
          Read our blog &rarr;
        </a>
      </div>
    </main>
  );
}
