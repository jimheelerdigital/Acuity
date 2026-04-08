import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <div className="mb-4 text-4xl">⚠️</div>
        <h1 className="text-xl font-semibold text-zinc-100 mb-2">
          Authentication error
        </h1>
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
          Something went wrong during sign-in. The link may have expired or
          already been used.
        </p>
        <Link
          href="/auth/signin"
          className="inline-block rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
