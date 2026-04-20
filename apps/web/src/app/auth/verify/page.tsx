export const dynamic = "force-dynamic";

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-8 text-center shadow-lg animate-fade-in">
        <div className="mb-4 text-4xl">📬</div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
          Check your email
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
          A sign-in link has been sent to your email address. Click the link to
          continue.
        </p>
        <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
          Didn't get it? Check your spam folder or{" "}
          <a href="/auth/signin" className="text-violet-600 hover:underline">
            try again
          </a>
          .
        </p>
      </div>
    </div>
  );
}
