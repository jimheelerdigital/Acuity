import { SystemMap } from "./system-map";

export const dynamic = "force-dynamic";

/**
 * /admin/system-map — drag-and-drop map of the codebase (2026-10-29).
 * Systems → their files → what each file touches. Data comes from
 * scripts/build-system-map.ts via /api/admin/system-map. The admin
 * layout gates on User.isAdmin; the API route re-checks.
 */
export default function SystemMapPage() {
  return <SystemMap />;
}
