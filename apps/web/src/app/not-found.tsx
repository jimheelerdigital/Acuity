import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium text-acuity-primary">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Page not found
      </h1>
      <p className="mt-4 text-acuity-text-sec max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="mt-8 flex items-center gap-4">
        <a
          href="/"
          className="rounded-full bg-acuity-primary px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-acuity-primary-lo"
        >
          Go home
        </a>
        <a
          href="/blog"
          className="text-sm font-medium text-acuity-text-sec transition hover:text-acuity-text"
        >
          Read our blog &rarr;
        </a>
      </div>
    </main>
  );
}
