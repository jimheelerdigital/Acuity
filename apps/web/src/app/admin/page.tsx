import AdminDashboard from "./admin-dashboard";

export const dynamic = "force-dynamic";

// Auth is handled by layout.tsx — if we're here, user is admin.
export default function AdminPage() {
  return <AdminDashboard />;
}
