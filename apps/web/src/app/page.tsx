import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { APP_NAME, APP_TAGLINE } from "@acuity/shared";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      {/* Hero */}
      <div className="max-w-2xl text-center animate-fade-in">
        {/* Logo mark */}
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-2xl shadow-violet-900/50">
          <span className="text-3xl">✦</span>
        </div>

        <h1 className="mb-4 text-5xl font-bold tracking-tight text-zinc-50 sm:text-6xl">
          {APP_NAME}
        </h1>
        <p className="mb-2 text-xl text-zinc-400">{APP_TAGLINE}</p>
        <p className="mb-12 text-base text-zinc-500 max-w-lg mx-auto leading-relaxed">
          Hit record, speak freely, and let Acuity extract your tasks, surface
          goals, and compile your week — all while you sleep.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/auth/signin"
            className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:opacity-90 active:scale-95"
          >
            Get started free
          </Link>
          <Link
            href="#how-it-works"
            className="rounded-xl border border-zinc-700 px-8 py-3.5 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            How it works
          </Link>
        </div>
      </div>

      {/* Feature grid */}
      <div
        id="how-it-works"
        className="mt-24 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3"
      >
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur"
          >
            <div className="mb-3 text-2xl">{f.icon}</div>
            <h3 className="mb-1.5 font-semibold text-zinc-100">{f.title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}

const features = [
  {
    icon: "🎙️",
    title: "Voice brain dump",
    desc: "Record up to 10 minutes of unfiltered thoughts every night. No typing required.",
  },
  {
    icon: "🤖",
    title: "AI extraction",
    desc: "Claude reads your transcript and pulls out tasks, goals, mood, wins, and blockers.",
  },
  {
    icon: "📊",
    title: "Weekly synthesis",
    desc: "Every Monday you get a digest: patterns, progress, and the top 3 actions for the week.",
  },
];
