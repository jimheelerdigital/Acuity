"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  FlaskConical,
  BarChart3,
  Settings,
  ArrowLeft,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin/adlab", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/adlab/projects", label: "Projects", icon: FolderKanban },
  { href: "/admin/adlab/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/admin/adlab/performance", label: "Performance", icon: BarChart3 },
  { href: "/admin/adlab/settings", label: "Settings", icon: Settings },
];

export default function AdLabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-68px)]">
      {/* Sidebar */}
      <aside className="sticky top-[68px] h-[calc(100vh-68px)] w-56 shrink-0 border-r border-white/10 bg-[#0A0A0F] overflow-y-auto">
        <div className="px-4 pt-6 pb-4">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-xs text-[#A0A0B8] hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Admin
          </Link>
          <h2 className="text-sm font-semibold text-white tracking-wide">
            AdLab
          </h2>
          <p className="text-[10px] text-[#A0A0B8] mt-0.5">
            Ad Research & Optimization
          </p>
        </div>

        <nav className="px-2 pb-6">
          {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact
              ? pathname === href
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors mb-0.5 ${
                  isActive
                    ? "bg-[#7C5CFC]/15 text-[#7C5CFC] font-medium"
                    : "text-[#A0A0B8] hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden">
        <div className="p-6 sm:p-8 max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
