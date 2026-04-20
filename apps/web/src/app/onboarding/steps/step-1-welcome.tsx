// TODO: fill in final welcome copy when onboarding spec lands.
// Intent: warm handshake. No product pitch yet — that's step 2.
// Should feel like "hi, we saw you signed up, here's what comes next."
// Consider: show the user's name (from session.user.name) to make it
// personal. Consider a subtle brand moment here (logo animation) —
// the whole flow is 60-90s so one small moment of delight is fine.
export function Step1Welcome() {
  return (
    <div className="animate-fade-in text-center">
      <div className="mb-6 text-5xl">👋</div>
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        Welcome to Acuity.
      </h1>
      <p className="mt-4 text-base leading-relaxed text-zinc-500">
        Before your first brain dump, a handful of quick questions. About a
        minute. They shape what the app notices on your behalf.
      </p>
    </div>
  );
}
