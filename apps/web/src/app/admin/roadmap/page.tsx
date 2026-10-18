import { RoadmapAdmin } from "./roadmap-admin";

export const dynamic = "force-dynamic";

/**
 * /admin/roadmap — curate the public roadmap (2026-10-18). The admin
 * layout already gates on User.isAdmin; the API routes re-check.
 */
export default function RoadmapAdminPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="neo-title text-2xl font-semibold">Public roadmap</h1>
      <p className="mt-1 text-sm text-acuity-text-sec">
        What goripple.io/roadmap and Profile → Roadmap show. Ideas from users arrive in
        #acuity-feedback; promote the good ones here. Mark things Shipped (with the version)
        when a build goes live.
      </p>
      <RoadmapAdmin />
    </main>
  );
}
