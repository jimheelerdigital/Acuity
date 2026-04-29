import Link from "next/link";

// Pure-markup page — no DB call, no auth read. force-dynamic was
// cargo from the surrounding routes; dropped so this renders
// statically at build and ships from edge cache.

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-8 text-center shadow-lg animate-fade-in">
        <div className="mb-4 text-4xl">⚠️</div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
          Authentication error
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
          Something went wrong during sign-in. The link may have expired or
          already been used.
        </p>
        <Link
          href="/auth/signin"
          className="inline-block rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-all duration-200 active:scale-95"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
